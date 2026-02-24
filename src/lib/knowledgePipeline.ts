// Phase 28: ナレッジパイプラインヘルパー
// 各トリガーポイントから呼び出す共通関数
// サーバーサイドで直接パイプラインAPIの内部ロジックを呼ぶ

type TriggerType = 'seed' | 'task_create' | 'task_complete' | 'job_execute' | 'message_send' | 'message_receive';
type SourceType = 'message' | 'task' | 'job' | 'seed';

interface PipelineResult {
  keywords: string[];
  newKeywords: string[];
  nodeCount: number;
}

/**
 * ナレッジパイプラインをサーバーサイドから呼び出す
 * 内部的に /api/knowledge/pipeline のPOSTハンドラと同じロジックを実行
 *
 * 非同期で実行し、呼び出し元をブロックしない
 */
export async function triggerKnowledgePipeline(params: {
  text: string;
  trigger: TriggerType;
  sourceId: string;
  sourceType: SourceType;
  direction?: 'sent' | 'received' | 'self';
  userId: string;
}): Promise<PipelineResult | null> {
  try {
    // 内部APIを直接呼び出す（same-origin fetch）
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/knowledge/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // サーバーサイドから呼び出す場合、内部トークンを使用
        'x-internal-call': 'true',
        'x-user-id': params.userId,
      },
      body: JSON.stringify({
        text: params.text,
        trigger: params.trigger,
        sourceId: params.sourceId,
        sourceType: params.sourceType,
        direction: params.direction || 'self',
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.data as PipelineResult;
    }

    console.error('[KnowledgePipeline Helper] API応答エラー:', response.status);
    return null;
  } catch (e) {
    console.error('[KnowledgePipeline Helper] 呼び出しエラー:', e);
    return null;
  }
}

/**
 * ナレッジパイプラインをバックグラウンドで実行（fire-and-forget）
 * メインの処理をブロックせずにパイプラインを非同期実行
 */
export function triggerKnowledgePipelineAsync(params: {
  text: string;
  trigger: TriggerType;
  sourceId: string;
  sourceType: SourceType;
  direction?: 'sent' | 'received' | 'self';
  userId: string;
}): void {
  // Vercel環境ではawaitしないとカットされる可能性があるが、
  // パイプラインは「あると嬉しい」レベルなので fire-and-forget で問題なし
  triggerKnowledgePipeline(params).catch((e) => {
    console.error('[KnowledgePipeline Async] バックグラウンド実行エラー:', e);
  });
}
