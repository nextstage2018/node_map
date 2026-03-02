// Phase A-2: 秘書AI会話API（意図分類 + コンテキスト拡充）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ========================================
// コンテキスト構築
// ========================================
async function buildContext(userId: string): Promise<string> {
  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) return '';

  const parts: string[] = [];

  try {
    // 並列でデータ取得
    const [messagesRes, tasksRes, jobsRes, knowledgeRes] = await Promise.all([
      // 新着メッセージ（未読 + 直近）
      supabase
        .from('inbox_messages')
        .select('id, channel, from_name, from_address, subject, body, is_read, direction, created_at, metadata')
        .eq('direction', 'received')
        .order('created_at', { ascending: false })
        .limit(15),
      // タスク
      supabase
        .from('tasks')
        .select('id, title, status, priority, phase, due_date, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20),
      // ジョブ
      supabase
        .from('jobs')
        .select('id, title, status, type, due_date, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      // ナレッジノード
      supabase
        .from('knowledge_master_entries')
        .select('id, label, category')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // メッセージ一覧
    const messages = messagesRes.data || [];
    if (messages.length > 0) {
      const unreadCount = messages.filter((m: { is_read: boolean }) => !m.is_read).length;
      const msgLines = messages.slice(0, 10).map(
        (m: { is_read: boolean; from_name: string; channel: string; subject?: string; body: string; created_at: string }) => {
          const status = m.is_read ? '既読' : '未読';
          const preview = (m.body || '').replace(/\n/g, ' ').slice(0, 60);
          return `- [${status}][${m.channel}] ${m.from_name}: ${m.subject || preview}（${new Date(m.created_at).toLocaleString('ja-JP')}）`;
        }
      );
      parts.push(`\n\n【メッセージ（最新${messages.length}件、未読${unreadCount}件）】\n${msgLines.join('\n')}`);
    }

    // タスク一覧
    const tasks = tasksRes.data || [];
    if (tasks.length > 0) {
      const activeTasks = tasks.filter((t: { status: string }) => t.status !== 'done');
      const taskLines = activeTasks.slice(0, 10).map(
        (t: { title: string; status: string; priority: string; phase: string; due_date?: string }) =>
          `- [${t.status}/${t.phase}] ${t.title}（優先度: ${t.priority}${t.due_date ? ', 期限: ' + t.due_date : ''}）`
      );
      const doneCount = tasks.filter((t: { status: string }) => t.status === 'done').length;
      parts.push(`\n\n【タスク（進行中${activeTasks.length}件、完了${doneCount}件）】\n${taskLines.join('\n')}`);
    }

    // ジョブ一覧
    const jobs = jobsRes.data || [];
    if (jobs.length > 0) {
      const pendingJobs = jobs.filter((j: { status: string }) => j.status === 'pending');
      if (pendingJobs.length > 0) {
        const jobLines = pendingJobs.map(
          (j: { title: string; type: string; due_date?: string }) =>
            `- [${j.type || 'その他'}] ${j.title}${j.due_date ? '（期限: ' + j.due_date + '）' : ''}`
        );
        parts.push(`\n\n【未処理ジョブ（${pendingJobs.length}件）】\n${jobLines.join('\n')}`);
      }
    }

    // ナレッジ
    const knowledge = knowledgeRes.data || [];
    if (knowledge.length > 0) {
      const knowledgeLines = knowledge.slice(0, 10).map(
        (k: { label: string; category?: string }) =>
          `- ${k.label}${k.category ? '（' + k.category + '）' : ''}`
      );
      parts.push(`\n\n【ナレッジノード（最新${knowledge.length}件）】\n${knowledgeLines.join('\n')}`);
    }
  } catch (error) {
    console.error('[Secretary API] コンテキスト構築エラー:', error);
  }

  return parts.join('');
}

// ========================================
// システムプロンプト
// ========================================
function buildSystemPrompt(contextSummary: string): string {
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return `あなたはNodeMapのパーソナル秘書です。ユーザーの仕事全体を把握し、的確なサポートを提供します。

## 基本ルール
- 日本語で簡潔に回答する（1応答300文字以内を目安）
- 具体的なデータに基づいてアドバイスする
- 緊急度が高い事項を先に報告する
- 提案は具体的に（「〇〇したほうがいいです」ではなく「〇〇の返信を先にしましょう。下書きを作りますか？」）

## あなたの能力
- メッセージの要約・返信下書き
- タスクの状況確認・優先度の提案
- ジョブ（簡易作業）の提案と実行支援
- ビジネスログの参照
- 思考マップ・ナレッジの参照

## 朝のブリーフィング
「今日の状況を教えて」等と聞かれた場合は、以下の形式で簡潔に報告してください:
1. 未読メッセージの要約（誰から何件、緊急なもの）
2. 対応が必要なタスク・ジョブ
3. 今日の提案（優先順位）

## 今日の日付
${today}

## ユーザーのデータ
${contextSummary || '（データなし — Supabase未接続の可能性があります）'}`;
}

// ========================================
// POST: 秘書AI会話
// ========================================
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'messageは必須です' },
        { status: 400 }
      );
    }

    // コンテキスト構築
    const contextSummary = await buildContext(userId);

    // Claude APIキーの確認
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // デモモード
      return NextResponse.json({
        success: true,
        data: {
          reply: generateDemoResponse(message, contextSummary),
        },
      });
    }

    // 会話履歴を構築（最新15件まで）
    const conversationHistory = (history || []).slice(-15).map(
      (msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
    );
    conversationHistory.push({ role: 'user' as const, content: message });

    // システムプロンプト構築
    const systemPrompt = buildSystemPrompt(contextSummary);

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1200,
      system: systemPrompt,
      messages: conversationHistory,
    });

    const reply =
      response.content[0]?.type === 'text'
        ? response.content[0].text
        : '応答を生成できませんでした';

    return NextResponse.json({
      success: true,
      data: { reply },
    });
  } catch (error) {
    console.error('[Secretary Chat API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '秘書応答の生成に失敗しました' },
      { status: 500 }
    );
  }
}

// ========================================
// デモ応答生成（APIキーなし時）
// ========================================
function generateDemoResponse(message: string, context: string): string {
  const lowerMsg = message.toLowerCase();

  // ブリーフィング系
  if (lowerMsg.includes('今日') || lowerMsg.includes('状況') || lowerMsg.includes('おはよう')) {
    if (context) {
      return `おはようございます。今日の状況をお伝えします。\n\n${context.includes('未読') ? 'メッセージが届いています。' : '新着メッセージはありません。'}\n\n${context.includes('タスク') ? '進行中のタスクがあります。' : 'タスクは落ち着いています。'}\n\n何から始めますか？`;
    }
    return 'おはようございます。\n\n【デモモード】ANTHROPIC_API_KEYを設定すると、メッセージ・タスク・ジョブの状況を踏まえた秘書応答が利用できます。\n\nサジェストチップを押して試してみてください。';
  }

  // メッセージ系
  if (lowerMsg.includes('メッセージ') || lowerMsg.includes('メール') || lowerMsg.includes('新着')) {
    return '【デモ応答】メッセージ一覧を表示します。\n\n本番環境ではインボックスの実データを参照し、緊急度に応じて整理して表示します。';
  }

  // タスク系
  if (lowerMsg.includes('タスク') || lowerMsg.includes('進行')) {
    return '【デモ応答】タスクの状況を確認します。\n\n本番環境ではタスクの進行状況・優先度・期限を踏まえた報告と提案を行います。';
  }

  // ジョブ系
  if (lowerMsg.includes('対応') || lowerMsg.includes('ジョブ') || lowerMsg.includes('必要')) {
    return '【デモ応答】対応が必要な項目を確認します。\n\n本番環境では未処理ジョブと期限が迫ったタスクを優先度順に提示します。';
  }

  // 思考マップ
  if (lowerMsg.includes('思考') || lowerMsg.includes('マップ')) {
    return '思考マップを表示するには、左のナビゲーションから「思考マップ」を選んでください。\n\nどのユーザーの思考マップを見たいですか？';
  }

  // ビジネスログ
  if (lowerMsg.includes('ログ') || lowerMsg.includes('ビジネス')) {
    return 'ビジネスログを表示するには、左のナビゲーションから「ビジネスログ」を選んでください。\n\n特定のプロジェクトや組織のログを探していますか？';
  }

  // デフォルト
  return `「${message}」について確認しました。\n\n【デモモード】ANTHROPIC_API_KEYを設定すると、コンテキストを踏まえた秘書応答が利用できます。`;
}
