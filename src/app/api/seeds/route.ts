// Phase 28: 種（Seed）API — ナレッジパイプライン統合
// POST時にパイプラインを呼び出してキーワード抽出→ナレッジ登録
// Phase 40: PUT/DELETE追加、createSeed引数修正

import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { getServerUserId } from '@/lib/serverAuth';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

// 種一覧取得
export async function GET(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';

    const seeds = await TaskService.getSeeds(userId, status, search);
    return NextResponse.json({ success: true, data: seeds });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の取得エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// Phase 40b: AI種化 — 前後メッセージからコンテキストを読んで要約生成
async function generateSeedContent(
  contextMessages: { from: string; body: string; timestamp: string; isTarget?: boolean }[],
  sourceChannel?: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // デモモード: ターゲットメッセージの本文をそのまま返す
    const target = contextMessages.find(m => m.isTarget);
    return target?.body.slice(0, 500) || contextMessages[0]?.body.slice(0, 500) || '';
  }

  // 会話コンテキストを構築
  const conversationText = contextMessages.map((m) => {
    const marker = m.isTarget ? ' ★種化対象' : '';
    const time = new Date(m.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    return `[${time}] ${m.from}${marker}:\n${m.body.slice(0, 300)}`;
  }).join('\n\n');

  const channelLabel = sourceChannel === 'email' ? 'メール'
    : sourceChannel === 'slack' ? 'Slack'
    : sourceChannel === 'chatwork' ? 'Chatwork'
    : 'メッセージ';

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 400,
      system: `あなたはビジネスコミュニケーションの要約専門家です。${channelLabel}の会話から、★マークの付いたメッセージを中心に、前後の文脈を踏まえて「種（アクションの種）」を生成してください。

出力フォーマット（必ずこの形式で）:
【依頼・要件】1行で何を求められているか
【背景】1-2行で会話の文脈
【必要なアクション】箇条書きで具体的なTODO

ルール:
- 日本語で簡潔に
- 合計150文字以内を目安
- 推測を入れず、会話に書かれた事実のみ
- ★メッセージが依頼でなく情報共有の場合は「要件」→「要点」に変更`,
      messages: [
        { role: 'user', content: `以下の${channelLabel}の会話から種を生成してください:\n\n${conversationText}` },
      ],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
    if (text) return text;
  } catch (e) {
    console.error('[Seeds API] AI種化エラー（フォールバック）:', e);
  }

  // フォールバック: ターゲットメッセージの本文
  const target = contextMessages.find(m => m.isTarget);
  return target?.body.slice(0, 500) || contextMessages[0]?.body.slice(0, 500) || '';
}

// 種作成 + ナレッジパイプライン
export async function POST(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const body = await request.json();

    // Phase 40b: contextMessages がある場合はAIで種化
    let seedContent = body.content || '';
    if (body.contextMessages && body.contextMessages.length > 0) {
      seedContent = await generateSeedContent(body.contextMessages, body.sourceChannel);
    }

    if (!seedContent) {
      return NextResponse.json(
        { success: false, error: '内容は必須です' },
        { status: 400 }
      );
    }

    // Phase 40: オブジェクト引数で渡す
    const seed = await TaskService.createSeed({
      content: seedContent,
      sourceChannel: body.sourceChannel,
      sourceMessageId: body.sourceMessageId,
      sourceFrom: body.sourceFrom,
      sourceDate: body.sourceDate,
      userId,
    });

    // Phase 28: ナレッジパイプライン実行
    let knowledgeResult = null;
    try {
      knowledgeResult = await triggerKnowledgePipeline({
        text: seedContent,
        trigger: 'seed',
        sourceId: seed.id,
        sourceType: 'seed',
        direction: 'self',
        userId,
      });
    } catch (e) {
      console.error('[Seeds API] ナレッジパイプラインエラー（種作成は成功）:', e);
    }

    return NextResponse.json({
      success: true,
      data: seed,
      knowledge: knowledgeResult ? {
        keywords: knowledgeResult.keywords,
        newKeywords: knowledgeResult.newKeywords,
        nodeCount: knowledgeResult.nodeCount,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の作成エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の作成に失敗しました' },
      { status: 500 }
    );
  }
}

// Phase 40: 種の更新
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    if (!body.seedId || !body.content) {
      return NextResponse.json(
        { success: false, error: 'seedId と content は必須です' },
        { status: 400 }
      );
    }

    const updated = await TaskService.updateSeed(body.seedId, body.content, body.tags);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: '種が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の更新エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// Phase 40: 種の削除
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const seedId = searchParams.get('seedId');
    if (!seedId) {
      return NextResponse.json(
        { success: false, error: 'seedId は必須です' },
        { status: 400 }
      );
    }

    const deleted = await TaskService.deleteSeed(seedId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: '種が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の削除エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の削除に失敗しました' },
      { status: 500 }
    );
  }
}
