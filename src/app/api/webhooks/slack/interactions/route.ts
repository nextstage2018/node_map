/**
 * v4.5: Slack Interactivity Webhook
 *
 * Slack Block Kit のボタン押下（block_actions）やモーダル送信（view_submission）を受信。
 * 現在は「完了」ボタン（nm_task_complete_*）のみ対応。
 *
 * Slack App設定:
 *   Interactivity & Shortcuts → Request URL:
 *   https://node-map-eight.vercel.app/api/webhooks/slack/interactions
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Slackはapplication/x-www-form-urlencodedで送る（JSONではない）
    const formData = await request.formData();
    const payloadStr = formData.get('payload');

    if (!payloadStr || typeof payloadStr !== 'string') {
      return NextResponse.json({ ok: true });
    }

    const payload = JSON.parse(payloadStr);

    // block_actions: ボタン押下
    if (payload.type === 'block_actions') {
      const actions = payload.actions || [];

      for (const action of actions) {
        // 「完了」ボタンか判定: action_id が nm_task_complete_ で始まる
        if (action.action_id?.startsWith('nm_task_complete_')) {
          const { handleSlackTaskComplete } = await import(
            '@/services/v45/externalTaskSync.service'
          );

          const result = await handleSlackTaskComplete({
            action_id: action.action_id,
            value: action.value, // taskId
            channel_id: payload.channel?.id || payload.container?.channel_id || '',
            message_ts: payload.message?.ts || payload.container?.message_ts || '',
            user_id: payload.user?.id || '',
          });

          console.log(`[Slack Interactions] タスク完了処理: ${result.ok ? '成功' : '失敗'} - ${result.message}`);
        }

        // 「NodeMapで開く」ボタンはURL型のためWebhookは飛ばない（クライアント側で直接遷移）
      }
    }

    // view_submission: モーダル送信（将来の「編集」モーダル用に予約）
    if (payload.type === 'view_submission') {
      // TODO: v4.5+ タスク編集モーダル対応
      console.log('[Slack Interactions] view_submission 受信（未実装）');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Interactions] Webhookエラー:', error);
    // Slackには200を返さないとリトライが来る
    return NextResponse.json({ ok: true });
  }
}
