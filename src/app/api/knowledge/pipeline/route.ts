// Phase 28: ナレッジパイプラインAPI
// ユーザーアクション → AIキーワード抽出 → ナレッジマスタ登録（組織共通）→ 個人ノード追加
//
// トリガーポイント:
//   1. 種にする（seed）
//   2. タスク作成・完了
//   3. ジョブ実行・完了
//   4. メッセージ送信（返信）
//   5. メッセージ受信（既存processText統合）

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

// ========================================
// 型定義
// ========================================
interface PipelineRequest {
  text: string;
  trigger: 'seed' | 'task_create' | 'task_complete' | 'job_execute' | 'message_send' | 'message_receive';
  sourceId: string;
  sourceType: 'message' | 'task' | 'job' | 'seed';
  direction?: 'sent' | 'received' | 'self';
  metadata?: Record<string, unknown>;
}

interface ExtractedKeyword {
  label: string;
  type: 'keyword' | 'person' | 'project';
  confidence: number;
  context?: string;
}

interface KnowledgeRegistration {
  keyword: string;
  domainId: string | null;
  domainName: string | null;
  fieldId: string | null;
  fieldName: string | null;
  isNew: boolean; // 新規マスタ登録かどうか
  nodeId: string | null;
}

// ========================================
// POST: ナレッジパイプライン実行
// ========================================
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
    const body: PipelineRequest = await request.json();

    if (!body.text || !body.trigger) {
      return NextResponse.json(
        { success: false, error: 'text と trigger は必須です' },
        { status: 400 }
      );
    }

    console.log(`[Knowledge Pipeline] trigger=${body.trigger}, sourceType=${body.sourceType}, userId=${userId}`);

    // Step 1: AIキーワード抽出
    const keywords = await extractKeywordsWithAI(body.text, body.trigger);
    if (keywords.length === 0) {
      return NextResponse.json({
        success: true,
        data: { keywords: [], registrations: [], message: 'キーワードが見つかりませんでした' },
      });
    }

    console.log(`[Knowledge Pipeline] 抽出キーワード: ${keywords.map(k => k.label).join(', ')}`);

    // Step 2: ナレッジマスタに分類・登録（組織共通）
    const registrations = await registerToKnowledgeMaster(keywords);

    // Step 3: 個人の思考マップにノード追加
    const nodeResults = await addToPersonalNodes(
      userId,
      registrations,
      body.sourceType,
      body.sourceId,
      body.direction || 'self'
    );

    // Step 4: 共起エッジを生成（2つ以上のキーワードがある場合）
    if (nodeResults.length >= 2) {
      await createCoOccurrenceEdges(userId, nodeResults, body.sourceId);
    }

    console.log(`[Knowledge Pipeline] 完了: ${registrations.length}件登録, 新規${registrations.filter(r => r.isNew).length}件`);

    return NextResponse.json({
      success: true,
      data: {
        keywords: keywords.map(k => k.label),
        registrations,
        nodeCount: nodeResults.length,
        newKeywords: registrations.filter(r => r.isNew).map(r => r.keyword),
        trigger: body.trigger,
      },
    });
  } catch (error) {
    console.error('[Knowledge Pipeline] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ナレッジパイプラインの実行に失敗しました' },
      { status: 500 }
    );
  }
}

// ========================================
// Step 1: AIキーワード抽出
// ========================================
async function extractKeywordsWithAI(text: string, trigger: string): Promise<ExtractedKeyword[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    // AI抽出モード
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `以下のテキストからビジネス・技術・専門分野に関連するキーワードを抽出してください。

【抽出ルール】
- 名詞（専門用語、技術用語、ビジネス用語）のみ抽出
- 一般的すぎる語（「もの」「こと」「ため」等）は除外
- 人名は type: "person" で抽出
- プロジェクト名・案件名は type: "project" で抽出
- それ以外は type: "keyword" で抽出
- 各キーワードにconfidence（0.0〜1.0）を付与
- 最大10個まで、重要度順
- トリガー: ${trigger}

【テキスト】
${text.slice(0, 2000)}

【出力形式】JSON配列のみ返してください:
[{"label": "キーワード", "type": "keyword", "confidence": 0.9, "context": "抽出元の文脈"}]`,
            },
          ],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.content?.[0]?.text || '';
        // JSON部分を抽出
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
          return parsed.filter(k => k.confidence >= 0.5);
        }
      }
    } catch (e) {
      console.error('[Knowledge Pipeline] AI抽出失敗、ルールベースにフォールバック:', e);
    }
  }

  // ルールベースフォールバック
  return extractKeywordsRuleBased(text);
}

// ========================================
// ルールベースキーワード抽出（フォールバック）
// ========================================
function extractKeywordsRuleBased(text: string): ExtractedKeyword[] {
  const keywords: ExtractedKeyword[] = [];
  const seen = new Set<string>();

  // カタカナ語（技術用語に多い）
  const katakanaRegex = /[\u30A0-\u30FF]{3,}/g;
  let match;
  while ((match = katakanaRegex.exec(text)) !== null) {
    const word = match[0];
    if (!seen.has(word) && !isCommonKatakana(word)) {
      seen.add(word);
      keywords.push({ label: word, type: 'keyword', confidence: 0.7 });
    }
  }

  // 英語の専門用語（2文字以上の英単語の連続）
  const engRegex = /[A-Z][a-zA-Z]*(?:\s[A-Z][a-zA-Z]*)*/g;
  while ((match = engRegex.exec(text)) !== null) {
    const word = match[0];
    if (!seen.has(word) && word.length >= 3) {
      seen.add(word);
      keywords.push({ label: word, type: 'keyword', confidence: 0.6 });
    }
  }

  // 日本語の複合名詞パターン（〜システム、〜管理、〜開発 等）
  const compoundRegex = /[\u4E00-\u9FFF\u30A0-\u30FF]{2,}(?:システム|管理|開発|設計|運用|分析|戦略|施策|改善|最適化|自動化|連携|統合|基盤|機能)/g;
  while ((match = compoundRegex.exec(text)) !== null) {
    const word = match[0];
    if (!seen.has(word)) {
      seen.add(word);
      keywords.push({ label: word, type: 'keyword', confidence: 0.65 });
    }
  }

  return keywords.slice(0, 10);
}

function isCommonKatakana(word: string): boolean {
  const common = [
    'メール', 'メッセージ', 'コメント', 'データ', 'リスト', 'テスト',
    'エラー', 'ファイル', 'ページ', 'ボタン', 'クリック', 'チェック',
    'スタート', 'エンド', 'アップ', 'ダウン', 'サーバー', 'ユーザー',
  ];
  return common.includes(word);
}

// ========================================
// Step 2: ナレッジマスタに分類・登録
// ========================================
async function registerToKnowledgeMaster(keywords: ExtractedKeyword[]): Promise<KnowledgeRegistration[]> {
  const supabase = createServerClient();
  if (!supabase) {
    // デモモード: 分類のみ返す
    return keywords.map(k => ({
      keyword: k.label,
      domainId: null,
      domainName: null,
      fieldId: null,
      fieldName: null,
      isNew: false,
      nodeId: null,
    }));
  }

  const registrations: KnowledgeRegistration[] = [];

  // 既存のマスタエントリとドメイン・フィールドを取得
  const [
    { data: domains },
    { data: fields },
    { data: entries },
  ] = await Promise.all([
    supabase.from('knowledge_domains').select('*'),
    supabase.from('knowledge_fields').select('*'),
    supabase.from('knowledge_master_entries').select('*'),
  ]);

  for (const kw of keywords) {
    if (kw.type !== 'keyword') {
      // person/projectはナレッジマスタ対象外（個人ノードのみ）
      registrations.push({
        keyword: kw.label,
        domainId: null,
        domainName: null,
        fieldId: null,
        fieldName: null,
        isNew: false,
        nodeId: null,
      });
      continue;
    }

    // 既存エントリを検索（完全一致 → 同義語 → 部分一致）
    let matchedEntry = entries?.find(e =>
      e.label.toLowerCase() === kw.label.toLowerCase()
    );

    if (!matchedEntry) {
      matchedEntry = entries?.find(e =>
        e.synonyms?.some((s: string) => s.toLowerCase() === kw.label.toLowerCase())
      );
    }

    if (!matchedEntry) {
      matchedEntry = entries?.find(e =>
        e.label.toLowerCase().includes(kw.label.toLowerCase()) ||
        kw.label.toLowerCase().includes(e.label.toLowerCase())
      );
    }

    if (matchedEntry) {
      // 既存エントリにマッチ → ドメイン・フィールド情報を取得
      const field = fields?.find(f => f.id === matchedEntry!.field_id);
      const domain = field ? domains?.find(d => d.id === field.domain_id) : null;

      registrations.push({
        keyword: kw.label,
        domainId: domain?.id || null,
        domainName: domain?.name || null,
        fieldId: field?.id || null,
        fieldName: field?.name || null,
        isNew: false,
        nodeId: null,
      });
    } else {
      // 新規キーワード → AIで分類してマスタに追加
      const classification = await classifyNewKeyword(kw.label, domains || [], fields || []);

      if (classification.fieldId) {
        // マスタエントリに新規追加
        const { data: newEntry } = await supabase
          .from('knowledge_master_entries')
          .insert({
            field_id: classification.fieldId,
            label: kw.label,
            synonyms: [],
            description: kw.context || null,
          })
          .select()
          .single();

        registrations.push({
          keyword: kw.label,
          domainId: classification.domainId,
          domainName: classification.domainName,
          fieldId: classification.fieldId,
          fieldName: classification.fieldName,
          isNew: true,
          nodeId: null,
        });
      } else {
        registrations.push({
          keyword: kw.label,
          domainId: null,
          domainName: null,
          fieldId: null,
          fieldName: null,
          isNew: false,
          nodeId: null,
        });
      }
    }
  }

  return registrations;
}

// ========================================
// AI分類: 新規キーワードのドメイン・フィールド判定
// ========================================
async function classifyNewKeyword(
  keyword: string,
  domains: Array<{ id: string; name: string }>,
  fields: Array<{ id: string; domain_id: string; name: string }>
): Promise<{
  domainId: string | null;
  domainName: string | null;
  fieldId: string | null;
  fieldName: string | null;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const nullResult = { domainId: null, domainName: null, fieldId: null, fieldName: null };

  if (!apiKey || domains.length === 0) return nullResult;

  // ドメイン→フィールドの構造を作成
  const hierarchy = domains.map(d => ({
    domainId: d.id,
    domainName: d.name,
    fields: fields.filter(f => f.domain_id === d.id).map(f => ({
      fieldId: f.id,
      fieldName: f.name,
    })),
  }));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `キーワード「${keyword}」を以下の分類体系のどの分野に分類しますか？
最も適切なfieldIdを1つ返してください。

${JSON.stringify(hierarchy, null, 2)}

回答は {"fieldId": "xxx"} のJSON形式のみ返してください。該当なしの場合は {"fieldId": null}`,
          },
        ],
      }),
    });

    if (response.ok) {
      const result = await response.json();
      const content = result.content?.[0]?.text || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.fieldId) {
          const field = fields.find(f => f.id === parsed.fieldId);
          const domain = field ? domains.find(d => d.id === field.domain_id) : null;
          return {
            domainId: domain?.id || null,
            domainName: domain?.name || null,
            fieldId: field?.id || null,
            fieldName: field?.name || null,
          };
        }
      }
    }
  } catch (e) {
    console.error('[Knowledge Pipeline] AI分類エラー:', e);
  }

  // ルールベースフォールバック: キーワードと分野名の部分一致
  for (const field of fields) {
    if (
      keyword.toLowerCase().includes(field.name.toLowerCase()) ||
      field.name.toLowerCase().includes(keyword.toLowerCase())
    ) {
      const domain = domains.find(d => d.id === field.domain_id);
      return {
        domainId: domain?.id || null,
        domainName: domain?.name || null,
        fieldId: field.id,
        fieldName: field.name,
      };
    }
  }

  return nullResult;
}

// ========================================
// Step 3: 個人の思考マップにノード追加
// ========================================
async function addToPersonalNodes(
  userId: string,
  registrations: KnowledgeRegistration[],
  sourceType: string,
  sourceId: string,
  direction: string
): Promise<Array<{ id: string; label: string }>> {
  const supabase = createServerClient();
  if (!supabase) return [];

  const results: Array<{ id: string; label: string }> = [];
  const now = new Date().toISOString();

  for (const reg of registrations) {
    try {
      // 既存ノードを検索
      const { data: existing } = await supabase
        .from('user_nodes')
        .select('id, frequency')
        .eq('user_id', userId)
        .eq('label', reg.keyword)
        .single();

      let nodeId: string;

      if (existing) {
        // 既存ノード → frequency++, last_seen_at更新
        await supabase
          .from('user_nodes')
          .update({
            frequency: (existing.frequency || 0) + 1,
            last_seen_at: now,
            updated_at: now,
            ...(reg.domainId ? { domain_id: reg.domainId } : {}),
            ...(reg.fieldId ? { field_id: reg.fieldId } : {}),
          })
          .eq('id', existing.id);

        nodeId = existing.id;
      } else {
        // 新規ノード作成
        const { data: newNode } = await supabase
          .from('user_nodes')
          .insert({
            label: reg.keyword,
            type: 'keyword',
            user_id: userId,
            frequency: 1,
            understanding_level: 'recognition',
            domain_id: reg.domainId,
            field_id: reg.fieldId,
            first_seen_at: now,
            last_seen_at: now,
            created_at: now,
            updated_at: now,
          })
          .select('id')
          .single();

        if (!newNode) continue;
        nodeId = newNode.id;
      }

      // ソースコンテキストを記録
      await supabase.from('node_source_contexts').insert({
        node_id: nodeId,
        source_type: sourceType === 'seed' ? 'message' : sourceType === 'task' ? 'task_conversation' : sourceType,
        source_id: sourceId,
        direction: direction,
        timestamp: now,
        created_at: now,
      });

      // node_master_linksにリンク追加（マスタエントリが見つかった場合）
      if (reg.fieldId) {
        const { data: masterEntry } = await supabase
          .from('knowledge_master_entries')
          .select('id')
          .eq('label', reg.keyword)
          .single();

        if (masterEntry) {
          // 既存リンクがなければ追加
          const { data: existingLink } = await supabase
            .from('node_master_links')
            .select('id')
            .eq('node_id', nodeId)
            .eq('master_entry_id', masterEntry.id)
            .single();

          if (!existingLink) {
            await supabase.from('node_master_links').insert({
              node_id: nodeId,
              master_entry_id: masterEntry.id,
              confidence: 0.8,
              confirmed: false,
              created_at: now,
            });
          }
        }
      }

      results.push({ id: nodeId, label: reg.keyword });
      reg.nodeId = nodeId;
    } catch (e) {
      console.error(`[Knowledge Pipeline] ノード追加エラー (${reg.keyword}):`, e);
    }
  }

  return results;
}

// ========================================
// Step 4: 共起エッジ生成
// ========================================
async function createCoOccurrenceEdges(
  userId: string,
  nodes: Array<{ id: string; label: string }>,
  sourceId: string
): Promise<void> {
  const supabase = createServerClient();
  if (!supabase || nodes.length < 2) return;

  const now = new Date().toISOString();

  // ペアごとにエッジを作成（上限: 最初の5ノード間）
  const targetNodes = nodes.slice(0, 5);
  for (let i = 0; i < targetNodes.length; i++) {
    for (let j = i + 1; j < targetNodes.length; j++) {
      try {
        // 既存エッジを確認
        const { data: existing } = await supabase
          .from('node_edges')
          .select('id, weight')
          .or(`and(source_node_id.eq.${targetNodes[i].id},target_node_id.eq.${targetNodes[j].id}),and(source_node_id.eq.${targetNodes[j].id},target_node_id.eq.${targetNodes[i].id})`)
          .single();

        if (existing) {
          // 既存エッジの重みを増加
          await supabase
            .from('node_edges')
            .update({ weight: (existing.weight || 1) + 1, updated_at: now })
            .eq('id', existing.id);
        } else {
          // 新規エッジ作成
          await supabase.from('node_edges').insert({
            source_node_id: targetNodes[i].id,
            target_node_id: targetNodes[j].id,
            user_id: userId,
            edge_type: 'co_occurrence',
            flow_type: 'tributary',
            direction: 'bidirectional',
            weight: 1,
            created_at: now,
            updated_at: now,
          });
        }
      } catch {
        // 個別エッジの失敗は無視
      }
    }
  }
}
