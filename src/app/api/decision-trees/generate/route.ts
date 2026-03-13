// V2-E: 検討ツリーAI生成エンドポイント
// 会議録AI解析で抽出された topics を受け取り、検討ツリーに反映
// v3.0: チャネルメッセージからのトピックも統合対応（source_type / confidence_score）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  matchTopic,
  isChildNodeDuplicate,
  calculateMergedConfidence,
} from '@/services/nodemap/topicMatcher.service';
import type { DecisionTreeNodeForMatch } from '@/services/nodemap/topicMatcher.service';

export const dynamic = 'force-dynamic';

interface Topic {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface GenerateRequest {
  project_id: string;
  meeting_record_id?: string;  // 会議録由来の場合
  message_id?: string;         // チャネルメッセージ由来の場合
  topics: Topic[];
  source_type?: 'meeting' | 'channel'; // デフォルト: 'meeting'（後方互換）
}

// ソース別のデフォルトconfidence
const CONFIDENCE_MAP = {
  meeting: 0.85,
  channel: 0.6,
} as const;

export async function POST(request: NextRequest) {
  try {
    // 通常認証 or 内部呼び出し（Cron/Webhook）の認証バイパス
    const isInternalCall = request.headers.get('x-webhook-internal') === 'true';
    let userId = await getServerUserId();
    if (!userId && isInternalCall) {
      userId = process.env.ENV_TOKEN_OWNER_ID || '';
    }
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body: GenerateRequest = await request.json();
    const { project_id, meeting_record_id, message_id, topics, source_type: reqSourceType } = body;

    // ソースタイプ判定（後方互換: 未指定なら meeting）
    const sourceType = reqSourceType || 'meeting';
    const confidence = CONFIDENCE_MAP[sourceType] || 0.5;
    // ソースID（meeting_record_id または message_id）
    const sourceRefId = meeting_record_id || message_id || null;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }
    if (!meeting_record_id && !message_id) {
      return NextResponse.json({ success: false, error: 'meeting_record_id または message_id は必須です' }, { status: 400 });
    }
    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ success: false, error: 'topics は必須です' }, { status: 400 });
    }

    // 1. プロジェクトに既存ツリーがあるか確認
    const { data: existingTrees } = await supabase
      .from('decision_trees')
      .select('id')
      .eq('project_id', project_id)
      .order('created_at', { ascending: true })
      .limit(1);

    let treeId: string;

    if (existingTrees && existingTrees.length > 0) {
      treeId = existingTrees[0].id;
    } else {
      // 新規ツリーを作成
      const { data: newTree, error: createError } = await supabase
        .from('decision_trees')
        .insert({
          project_id,
          title: '検討ツリー',
          description: '会議録から自動生成された検討ツリー',
        })
        .select()
        .single();

      if (createError) {
        console.error('[DecisionTrees Generate] ツリー作成エラー:', createError);
        return NextResponse.json({ success: false, error: createError.message }, { status: 500 });
      }

      treeId = newTree.id;
    }

    // 2. 既存ノードを取得
    const { data: existingNodes } = await supabase
      .from('decision_tree_nodes')
      .select('*')
      .eq('tree_id', treeId);

    const rootNodes: DecisionTreeNodeForMatch[] = (existingNodes || []).filter((n: any) => !n.parent_node_id);

    // 3. 各 topic を処理（topicMatcher で類似度判定）
    const createdNodes: string[] = [];
    const updatedNodes: string[] = [];
    const mergedNodes: string[] = [];

    const sourceLabel = sourceType === 'meeting' ? '会議録' : 'チャネルメッセージ';

    for (const topic of topics) {
      // topicMatcher で既存ノードと照合
      const match = matchTopic(topic.title, rootNodes);
      const matchingNode = match.matchedNode;

      if (match.recommendedAction === 'merge' && matchingNode) {
        // === マージ or 更新 ===

        // ソース追跡の更新
        const currentMsgIds = matchingNode.source_message_ids || [];
        const newMsgIds = message_id && !currentMsgIds.includes(message_id)
          ? [...currentMsgIds, message_id]
          : currentMsgIds;

        // source_type: 異なるソースからのマージなら 'hybrid'
        let newSourceType = matchingNode.source_type || sourceType;
        if (matchingNode.source_type && matchingNode.source_type !== sourceType) {
          newSourceType = 'hybrid';
        }
        const newConfidence = calculateMergedConfidence(
          matchingNode.confidence_score || confidence,
          Math.max(currentMsgIds.length, 1),
          confidence
        );

        // ステータス変更チェック（cancelled / completed）
        if (topic.status === 'cancelled' && matchingNode.status !== 'cancelled') {
          await supabase
            .from('decision_tree_nodes')
            .update({
              status: 'cancelled',
              cancel_reason: `${sourceLabel}で方針変更`,
              cancel_meeting_id: meeting_record_id || null,
              source_type: newSourceType,
              confidence_score: newConfidence,
              source_message_ids: newMsgIds,
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchingNode.id);

          await supabase.from('decision_tree_node_history').insert({
            node_id: matchingNode.id,
            previous_status: matchingNode.status,
            new_status: 'cancelled',
            reason: `${sourceLabel}で方針変更`,
            meeting_record_id: meeting_record_id || null,
          });
          updatedNodes.push(matchingNode.id);
        } else if (topic.status === 'completed' && matchingNode.status !== 'completed') {
          await supabase
            .from('decision_tree_nodes')
            .update({
              status: 'completed',
              source_type: newSourceType,
              confidence_score: newConfidence,
              source_message_ids: newMsgIds,
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchingNode.id);

          await supabase.from('decision_tree_node_history').insert({
            node_id: matchingNode.id,
            previous_status: matchingNode.status,
            new_status: 'completed',
            reason: `${sourceLabel}で完了確認`,
            meeting_record_id: meeting_record_id || null,
          });
          updatedNodes.push(matchingNode.id);
        } else {
          // ステータス変更なし → ソース追跡のみ更新
          await supabase
            .from('decision_tree_nodes')
            .update({
              source_type: newSourceType,
              confidence_score: newConfidence,
              source_message_ids: newMsgIds,
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchingNode.id);
          mergedNodes.push(matchingNode.id);
        }

        // options を子ノードとして追加（重複チェック: topicMatcherのisChildNodeDuplicate使用）
        if (topic.options && topic.options.length > 0) {
          const childNodes: DecisionTreeNodeForMatch[] = (existingNodes || []).filter((n: any) => n.parent_node_id === matchingNode.id);

          for (const option of topic.options) {
            if (!isChildNodeDuplicate(option, childNodes)) {
              const { data: newNode } = await supabase
                .from('decision_tree_nodes')
                .insert({
                  tree_id: treeId,
                  parent_node_id: matchingNode.id,
                  title: option,
                  node_type: 'option',
                  status: 'active',
                  source_meeting_id: meeting_record_id || null,
                  source_type: sourceType,
                  confidence_score: confidence,
                  source_message_ids: message_id ? [message_id] : [],
                  sort_order: childNodes.length,
                })
                .select()
                .single();

              if (newNode) {
                createdNodes.push(newNode.id);
                await supabase.from('decision_tree_node_history').insert({
                  node_id: newNode.id,
                  previous_status: null,
                  new_status: 'active',
                  reason: `${sourceLabel}から自動追加`,
                  meeting_record_id: meeting_record_id || null,
                });
              }
            }
          }
        }

        // decision を子ノードとして追加
        if (topic.decision) {
          const childNodes: DecisionTreeNodeForMatch[] = (existingNodes || []).filter((n: any) => n.parent_node_id === matchingNode.id);
          const existingDecision = childNodes.find(cn => cn.node_type === 'decision' && isChildNodeDuplicate(topic.decision!, [cn]));
          if (!existingDecision) {
            const { data: newNode } = await supabase
              .from('decision_tree_nodes')
              .insert({
                tree_id: treeId,
                parent_node_id: matchingNode.id,
                title: topic.decision,
                node_type: 'decision',
                status: 'active',
                source_meeting_id: meeting_record_id || null,
                source_type: sourceType,
                confidence_score: confidence,
                source_message_ids: message_id ? [message_id] : [],
                sort_order: childNodes.length,
              })
              .select()
              .single();

            if (newNode) {
              createdNodes.push(newNode.id);
              await supabase.from('decision_tree_node_history').insert({
                node_id: newNode.id,
                previous_status: null,
                new_status: 'active',
                reason: `${sourceLabel}から決定事項として追加`,
                meeting_record_id: meeting_record_id || null,
              });
            }
          }
        }
      } else {
        // === 新規 topic ノードを作成 ===
        const { data: topicNode, error: topicError } = await supabase
          .from('decision_tree_nodes')
          .insert({
            tree_id: treeId,
            parent_node_id: null,
            title: topic.title,
            node_type: 'topic',
            status: topic.status || 'active',
            source_meeting_id: meeting_record_id || null,
            source_type: sourceType,
            confidence_score: confidence,
            source_message_ids: message_id ? [message_id] : [],
            sort_order: rootNodes.length + createdNodes.length,
          })
          .select()
          .single();

        if (topicError) {
          console.error('[DecisionTrees Generate] topic作成エラー:', topicError);
          continue;
        }

        createdNodes.push(topicNode.id);

        await supabase.from('decision_tree_node_history').insert({
          node_id: topicNode.id,
          previous_status: null,
          new_status: topic.status || 'active',
          reason: `${sourceLabel}から自動生成`,
          meeting_record_id: meeting_record_id || null,
        });

        // options を子ノードとして追加
        if (topic.options && topic.options.length > 0) {
          for (let i = 0; i < topic.options.length; i++) {
            const { data: optionNode } = await supabase
              .from('decision_tree_nodes')
              .insert({
                tree_id: treeId,
                parent_node_id: topicNode.id,
                title: topic.options[i],
                node_type: 'option',
                status: 'active',
                source_meeting_id: meeting_record_id || null,
                source_type: sourceType,
                confidence_score: confidence,
                source_message_ids: message_id ? [message_id] : [],
                sort_order: i,
              })
              .select()
              .single();

            if (optionNode) {
              createdNodes.push(optionNode.id);
              await supabase.from('decision_tree_node_history').insert({
                node_id: optionNode.id,
                previous_status: null,
                new_status: 'active',
                reason: `${sourceLabel}から自動追加`,
                meeting_record_id: meeting_record_id || null,
              });
            }
          }
        }

        // decision を子ノードとして追加
        if (topic.decision) {
          const { data: decisionNode } = await supabase
            .from('decision_tree_nodes')
            .insert({
              tree_id: treeId,
              parent_node_id: topicNode.id,
              title: topic.decision,
              node_type: 'decision',
              status: 'active',
              source_meeting_id: meeting_record_id || null,
              source_type: sourceType,
              confidence_score: confidence,
              source_message_ids: message_id ? [message_id] : [],
              sort_order: topic.options ? topic.options.length : 0,
            })
            .select()
            .single();

          if (decisionNode) {
            createdNodes.push(decisionNode.id);
            await supabase.from('decision_tree_node_history').insert({
              node_id: decisionNode.id,
              previous_status: null,
              new_status: 'active',
              reason: `${sourceLabel}から決定事項として追加`,
              meeting_record_id: meeting_record_id || null,
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        tree_id: treeId,
        created_count: createdNodes.length,
        updated_count: updatedNodes.length,
        merged_count: mergedNodes.length,
      },
    });
  } catch (error) {
    console.error('[DecisionTrees Generate] エラー:', error);
    return NextResponse.json({ success: false, error: '検討ツリーの生成に失敗しました' }, { status: 500 });
  }
}
