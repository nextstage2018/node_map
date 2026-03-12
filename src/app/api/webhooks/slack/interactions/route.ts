/**
 * v4.5: Slack Interactivity Webhook
 *
 * Slack Block Kit のボタン押下（block_actions）やモーダル送信（view_submission）を受信。
 *
 * 対応アクション:
 * - nm_task_complete_* : 「完了」ボタン → タスク完了 + カード打ち消し線
 * - nm_task_edit_*     : 「編集」ボタン → 編集モーダル表示
 * - view_submission (nm_task_edit_submit) : モーダルOK → タスク更新 + カード更新
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

    // ============================================================
    // block_actions: ボタン押下
    // ============================================================
    if (payload.type === 'block_actions') {
      const actions = payload.actions || [];

      for (const action of actions) {
        // 「完了」ボタン
        if (action.action_id?.startsWith('nm_task_complete_')) {
          const { handleSlackTaskComplete } = await import(
            '@/services/v45/externalTaskSync.service'
          );

          const result = await handleSlackTaskComplete({
            action_id: action.action_id,
            value: action.value,
            channel_id: payload.channel?.id || payload.container?.channel_id || '',
            message_ts: payload.message?.ts || payload.container?.message_ts || '',
            user_id: payload.user?.id || '',
          });

          console.log(`[Slack Interactions] タスク完了: ${result.ok ? '成功' : '失敗'} - ${result.message}`);
        }

        // 「編集」ボタン → モーダルを開く
        if (action.action_id?.startsWith('nm_task_edit_')) {
          const { openSlackEditModal } = await import(
            '@/services/v45/externalTaskSync.service'
          );

          await openSlackEditModal({
            trigger_id: payload.trigger_id,
            taskId: action.value,
          });

          console.log(`[Slack Interactions] 編集モーダル表示: taskId=${action.value}`);
        }
      }
    }

    // ============================================================
    // view_submission: モーダル送信
    // ============================================================
    if (payload.type === 'view_submission') {
      const callbackId = payload.view?.callback_id;

      if (callbackId === 'nm_task_edit_submit') {
        const taskId = payload.view?.private_metadata;
        const values = payload.view?.state?.values || {};

        // フォーム値を抽出
        const title = values.task_title_block?.task_title?.value || '';
        const dueDate = values.task_due_date_block?.task_due_date?.selected_date || null;
        const description = values.task_description_block?.task_description?.value || null;

        const { handleSlackEditSubmission } = await import(
          '@/services/v45/externalTaskSync.service'
        );

        await handleSlackEditSubmission({
          taskId,
          title,
          dueDate,
          description,
          channel_id: '', // view_submissionではchannel_idがないため、service内で取得
          message_ts: '',
        });

        console.log(`[Slack Interactions] タスク編集完了: ${title}`);

        // モーダルを閉じる（空レスポンスで自動クローズ）
        return NextResponse.json({ response_action: 'clear' });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Interactions] Webhookエラー:', error);
    return NextResponse.json({ ok: true });
  }
}
