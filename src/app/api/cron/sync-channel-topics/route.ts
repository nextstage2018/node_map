// Cron: チャネルメッセージからトピックを抽出し、検討ツリーに統合
// スケジュール: 毎日 01:30 UTC（sync-business-eventsの30分後）
// 対象: 過去24hのSlack/Chatworkメッセージ
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { extractTopicsFromMessages } from '@/services/ai/topicExtractor.service';
import { matchTopic, isChildNodeDuplicate, calculateMergedConfidence } from '@/services/nodemap/topicMatcher.service';
import type { DecisionTreeNodeForMatch } from '@/services/nodemap/topicMatcher.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// チャネル由来のconfidence（議事録=0.85に対して低め）
const CHANNEL_CONFIDENCE = 0.6;

export async function GET(request: NextRequest) {
  try {
    // Cron認証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase未設定' }, { status: 400 });
    }

    const stats = {
      messagesProcessed: 0,
      topicsExtracted: 0,
      nodesCreated: 0,
      nodesMerged: 0,
      errors: 0,
    };

    // 1. 過去24hのSlack/Chatworkメッセージを取得（topic抽出済みを除外）
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: messages, error: fetchError } = await supabase
      .from('inbox_messages')
      .select('id, subject, body, channel, from_name, metadata, received_at')
      .in('channel', ['slack', 'chatwork'])
      .gte('received_at', since)
      .order('received_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error('[SyncChannelTopics] メッセージ取得エラー:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, stats, message: '対象メッセージなし' });
    }

    stats.messagesProcessed = messages.length;

    // 2. メッセージ → プロジェクト解決 → グループ化
    const projectMessageMap = new Map<string, { projectId: string; projectName: string; messages: typeof messages }>();

    for (const msg of messages) {
      const projectId = await resolveProjectFromMetadata(supabase, msg.metadata, msg.channel);
      if (!projectId) continue; // プロジェクト不明 → スキップ

      if (!projectMessageMap.has(projectId)) {
        // プロジェクト名取得
        const { data: project } = await supabase
          .from('projects')
          .select('name')
          .eq('id', projectId)
          .single();

        projectMessageMap.set(projectId, {
          projectId,
          projectName: project?.name || '',
          messages: [],
        });
      }
      projectMessageMap.get(projectId)!.messages.push(msg);
    }

    // 3. プロジェクトごとにトピック抽出 → 検討ツリー統合
    for (const [projectId, group] of projectMessageMap.entries()) {
      try {
        // AI でトピック抽出
        const extractionResults = await extractTopicsFromMessages(
          group.messages.map(m => ({
            id: m.id,
            subject: m.subject || undefined,
            body: m.body || '',
            channel: m.channel,
          })),
          group.projectName
        );

        // 各トピックを検討ツリーに統合
        for (const result of extractionResults) {
          for (const topic of result.topics) {
            stats.topicsExtracted++;
            try {
              const mergeResult = await mergeTopicIntoTree(
                supabase,
                projectId,
                topic,
                result.messageId,
              );
              if (mergeResult === 'created') stats.nodesCreated++;
              if (mergeResult === 'merged') stats.nodesMerged++;
            } catch (mergeErr) {
              console.error(`[SyncChannelTopics] トピック "${topic.title}" 統合エラー:`, mergeErr);
              stats.errors++;
            }
          }
        }
      } catch (projectErr) {
        console.error(`[SyncChannelTopics] プロジェクト ${projectId} 処理エラー:`, projectErr);
        stats.errors++;
      }
    }

    console.log(`[SyncChannelTopics] 完了:`, stats);
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[SyncChannelTopics] エラー:', error);
    return NextResponse.json({ error: 'チャネルトピック同期に失敗しました' }, { status: 500 });
  }
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * メッセージmetadataからプロジェクトIDを解決
 * channelProjectLink.service.ts の resolveProjectFromChannel() を簡易再実装
 */
async function resolveProjectFromMetadata(
  supabase: any,
  metadata: any,
  channel: string
): Promise<string | null> {
  try {
    let channelIdentifier: string | null = null;

    if (channel === 'slack' && metadata?.slackChannel) {
      channelIdentifier = metadata.slackChannel;
    } else if (channel === 'chatwork' && metadata?.chatworkRoomId) {
      channelIdentifier = metadata.chatworkRoomId;
    }

    if (!channelIdentifier) return null;

    const { data } = await supabase
      .from('project_channels')
      .select('project_id')
      .eq('service_name', channel)
      .eq('channel_identifier', channelIdentifier)
      .limit(1)
      .maybeSingle();

    return data?.project_id || null;
  } catch {
    return null;
  }
}

/**
 * トピックを検討ツリーに統合（作成 or マージ）
 */
async function mergeTopicIntoTree(
  supabase: any,
  projectId: string,
  topic: { title: string; options: string[]; decision: string | null; status: string },
  messageId: string,
): Promise<'created' | 'merged' | 'skipped'> {
  // 1. プロジェクトの検討ツリーを取得 or 作成
  const { data: existingTrees } = await supabase
    .from('decision_trees')
    .select('id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(1);

  let treeId: string;
  if (existingTrees && existingTrees.length > 0) {
    treeId = existingTrees[0].id;
  } else {
    const { data: newTree, error: createError } = await supabase
      .from('decision_trees')
      .insert({
        project_id: projectId,
        title: '検討ツリー',
        description: '会議録・チャネルメッセージから自動生成された検討ツリー',
      })
      .select()
      .single();

    if (createError || !newTree) {
      console.error('[SyncChannelTopics] ツリー作成エラー:', createError);
      return 'skipped';
    }
    treeId = newTree.id;
  }

  // 2. 既存のルートノードを取得
  const { data: existingNodes } = await supabase
    .from('decision_tree_nodes')
    .select('*')
    .eq('tree_id', treeId);

  const allNodes = existingNodes || [];
  const rootNodes: DecisionTreeNodeForMatch[] = allNodes.filter((n: any) => !n.parent_node_id);

  // 3. トピックマッチング
  const match = matchTopic(topic.title, rootNodes);

  if (match.recommendedAction === 'merge' && match.matchedNode) {
    // マージ: 既存ノードにチャネル情報を追加
    const existingNode = match.matchedNode;
    const currentMsgIds = existingNode.source_message_ids || [];
    const newMsgIds = currentMsgIds.includes(messageId)
      ? currentMsgIds
      : [...currentMsgIds, messageId];

    const newSourceType = existingNode.source_type === 'meeting' ? 'hybrid' : (existingNode.source_type || 'channel');
    const newConfidence = calculateMergedConfidence(
      existingNode.confidence_score || CHANNEL_CONFIDENCE,
      Math.max(currentMsgIds.length, 1),
      CHANNEL_CONFIDENCE
    );

    await supabase
      .from('decision_tree_nodes')
      .update({
        source_type: newSourceType,
        confidence_score: newConfidence,
        source_message_ids: newMsgIds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingNode.id);

    // 履歴記録
    await supabase.from('decision_tree_node_history').insert({
      node_id: existingNode.id,
      previous_status: existingNode.status,
      new_status: existingNode.status, // ステータスは変えない
      reason: `チャネルメッセージから情報をマージ（類似度: ${match.similarityScore.toFixed(2)}）`,
    });

    // options/decision の子ノードも追加（重複チェック付き）
    await addChildNodes(supabase, treeId, existingNode.id, topic, messageId, allNodes);

    return 'merged';
  } else {
    // 新規作成
    const { data: topicNode, error: topicError } = await supabase
      .from('decision_tree_nodes')
      .insert({
        tree_id: treeId,
        parent_node_id: null,
        title: topic.title,
        node_type: 'topic',
        status: topic.status || 'active',
        source_type: 'channel',
        confidence_score: CHANNEL_CONFIDENCE,
        source_message_ids: [messageId],
        sort_order: rootNodes.length,
      })
      .select()
      .single();

    if (topicError || !topicNode) {
      console.error('[SyncChannelTopics] ノード作成エラー:', topicError);
      return 'skipped';
    }

    // 履歴記録
    await supabase.from('decision_tree_node_history').insert({
      node_id: topicNode.id,
      previous_status: null,
      new_status: topic.status || 'active',
      reason: 'チャネルメッセージから自動生成',
    });

    // options/decision の子ノード追加
    await addChildNodes(supabase, treeId, topicNode.id, topic, messageId, []);

    return 'created';
  }
}

/**
 * 子ノード（options + decision）を追加（重複チェック付き）
 */
async function addChildNodes(
  supabase: any,
  treeId: string,
  parentNodeId: string,
  topic: { options: string[]; decision: string | null },
  messageId: string,
  allExistingNodes: any[],
): Promise<void> {
  const childNodes: DecisionTreeNodeForMatch[] = allExistingNodes.filter(
    (n: any) => n.parent_node_id === parentNodeId
  );

  // options追加
  if (topic.options && topic.options.length > 0) {
    for (let i = 0; i < topic.options.length; i++) {
      const option = topic.options[i];
      if (isChildNodeDuplicate(option, childNodes)) continue;

      const { data: newNode } = await supabase
        .from('decision_tree_nodes')
        .insert({
          tree_id: treeId,
          parent_node_id: parentNodeId,
          title: option,
          node_type: 'option',
          status: 'active',
          source_type: 'channel',
          confidence_score: CHANNEL_CONFIDENCE,
          source_message_ids: [messageId],
          sort_order: childNodes.length + i,
        })
        .select()
        .single();

      if (newNode) {
        await supabase.from('decision_tree_node_history').insert({
          node_id: newNode.id,
          previous_status: null,
          new_status: 'active',
          reason: 'チャネルメッセージから自動追加',
        });
      }
    }
  }

  // decision追加
  if (topic.decision) {
    const existingDecision = childNodes.find(
      (cn: any) => cn.node_type === 'decision' && isChildNodeDuplicate(topic.decision!, [cn])
    );
    if (!existingDecision) {
      const { data: newNode } = await supabase
        .from('decision_tree_nodes')
        .insert({
          tree_id: treeId,
          parent_node_id: parentNodeId,
          title: topic.decision,
          node_type: 'decision',
          status: 'active',
          source_type: 'channel',
          confidence_score: CHANNEL_CONFIDENCE,
          source_message_ids: [messageId],
          sort_order: childNodes.length + (topic.options?.length || 0),
        })
        .select()
        .single();

      if (newNode) {
        await supabase.from('decision_tree_node_history').insert({
          node_id: newNode.id,
          previous_status: null,
          new_status: 'active',
          reason: 'チャネルメッセージから決定事項として追加',
        });
      }
    }
  }
}
