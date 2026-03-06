// V2-E: 検討ツリーAI生成エンドポイント
// 会議録AI解析で抽出された topics を受け取り、検討ツリーに反映
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Topic {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface GenerateRequest {
  project_id: string;
  meeting_record_id: string;
  topics: Topic[];
}

// 簡易類似度判定（タイトルの正規化比較）
function isSimilarTitle(existingTitle: string, newTitle: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[\s　]+/g, '')
      .replace(/[・\-_]/g, '')
      .replace(/について$/, '')
      .replace(/の件$/, '')
      .replace(/に関して$/, '');

  const a = normalize(existingTitle);
  const b = normalize(newTitle);

  // 完全一致
  if (a === b) return true;
  // 一方が他方を含む
  if (a.includes(b) || b.includes(a)) return true;

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body: GenerateRequest = await request.json();
    const { project_id, meeting_record_id, topics } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }
    if (!meeting_record_id) {
      return NextResponse.json({ success: false, error: 'meeting_record_id は必須です' }, { status: 400 });
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

    const rootNodes = (existingNodes || []).filter(n => !n.parent_node_id);

    // 3. 各 topic を処理
    const createdNodes: string[] = [];
    const updatedNodes: string[] = [];

    for (const topic of topics) {
      // 既存ノードとタイトルで照合
      const matchingNode = rootNodes.find(n => isSimilarTitle(n.title, topic.title));

      if (matchingNode) {
        // 既存ノードの場合: ステータスが cancelled なら更新
        if (topic.status === 'cancelled' && matchingNode.status !== 'cancelled') {
          const { error: updateError } = await supabase
            .from('decision_tree_nodes')
            .update({
              status: 'cancelled',
              cancel_reason: `会議で方針変更`,
              cancel_meeting_id: meeting_record_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchingNode.id);

          if (!updateError) {
            // 変更履歴を記録
            await supabase.from('decision_tree_node_history').insert({
              node_id: matchingNode.id,
              previous_status: matchingNode.status,
              new_status: 'cancelled',
              reason: '会議で方針変更',
              meeting_record_id,
            });
            updatedNodes.push(matchingNode.id);
          }
        } else if (topic.status === 'completed' && matchingNode.status !== 'completed') {
          const { error: updateError } = await supabase
            .from('decision_tree_nodes')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchingNode.id);

          if (!updateError) {
            await supabase.from('decision_tree_node_history').insert({
              node_id: matchingNode.id,
              previous_status: matchingNode.status,
              new_status: 'completed',
              reason: '会議で完了確認',
              meeting_record_id,
            });
            updatedNodes.push(matchingNode.id);
          }
        }

        // options を子ノードとして追加（重複チェック）
        if (topic.options && topic.options.length > 0) {
          const childNodes = (existingNodes || []).filter(n => n.parent_node_id === matchingNode.id);

          for (const option of topic.options) {
            const existingOption = childNodes.find(cn => isSimilarTitle(cn.title, option));
            if (!existingOption) {
              const { data: newNode } = await supabase
                .from('decision_tree_nodes')
                .insert({
                  tree_id: treeId,
                  parent_node_id: matchingNode.id,
                  title: option,
                  node_type: 'option',
                  status: 'active',
                  source_meeting_id: meeting_record_id,
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
                  reason: '会議録から自動追加',
                  meeting_record_id,
                });
              }
            }
          }
        }

        // decision を子ノードとして追加
        if (topic.decision) {
          const childNodes = (existingNodes || []).filter(n => n.parent_node_id === matchingNode.id);
          const existingDecision = childNodes.find(cn => cn.node_type === 'decision' && isSimilarTitle(cn.title, topic.decision!));
          if (!existingDecision) {
            const { data: newNode } = await supabase
              .from('decision_tree_nodes')
              .insert({
                tree_id: treeId,
                parent_node_id: matchingNode.id,
                title: topic.decision,
                node_type: 'decision',
                status: 'active',
                source_meeting_id: meeting_record_id,
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
                reason: '会議録から決定事項として追加',
                meeting_record_id,
              });
            }
          }
        }
      } else {
        // 新規 topic ノードを作成
        const { data: topicNode, error: topicError } = await supabase
          .from('decision_tree_nodes')
          .insert({
            tree_id: treeId,
            parent_node_id: null,
            title: topic.title,
            node_type: 'topic',
            status: topic.status || 'active',
            source_meeting_id: meeting_record_id,
            sort_order: rootNodes.length + createdNodes.length,
          })
          .select()
          .single();

        if (topicError) {
          console.error('[DecisionTrees Generate] topic作成エラー:', topicError);
          continue;
        }

        createdNodes.push(topicNode.id);

        // 作成履歴を記録
        await supabase.from('decision_tree_node_history').insert({
          node_id: topicNode.id,
          previous_status: null,
          new_status: topic.status || 'active',
          reason: '会議録から自動生成',
          meeting_record_id,
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
                source_meeting_id: meeting_record_id,
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
                reason: '会議録から自動追加',
                meeting_record_id,
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
              source_meeting_id: meeting_record_id,
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
              reason: '会議録から決定事項として追加',
              meeting_record_id,
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
      },
    });
  } catch (error) {
    console.error('[DecisionTrees Generate] エラー:', error);
    return NextResponse.json({ success: false, error: '検討ツリーの生成に失敗しました' }, { status: 500 });
  }
}
