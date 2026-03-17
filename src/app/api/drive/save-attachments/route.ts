// Phase 62 → v10.0: メッセージ添付ファイルをDriveに直接保存するAPI
// インボックスの「📁 Drive」ボタンから即時実行で呼ばれる
// v10.0: ステージング廃止。受領フォルダに直接保存
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json({ error: 'messageId は必須です' }, { status: 400 });
    }

    // Drive接続チェック
    const connected = await DriveService.isDriveConnected(userId);
    if (!connected) {
      return NextResponse.json({ error: 'Google Driveが接続されていません。設定画面からGmail連携を再設定してください。' }, { status: 400 });
    }

    // メッセージ情報を取得
    const sb = getServerSupabase() || getSupabase();
    const { data: msg, error: msgError } = await sb
      .from('inbox_messages')
      .select('*')
      .eq('id', messageId)
      .eq('user_id', userId)
      .single();

    if (msgError || !msg) {
      return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 });
    }

    const metadata = msg.metadata || {};
    const channel = msg.channel || 'email';
    const results: { fileName: string; status: string }[] = [];

    // 一時フォルダ
    const tempFolderId = await DriveService.getOrCreateTempFolder(userId);

    // 組織/プロジェクト推定
    let orgProject = { orgId: null as string | null, orgName: null as string | null, projectId: null as string | null, projectName: null as string | null };

    if (channel === 'email' && msg.from_address) {
      // メールの場合: from_addressからコンタクト→組織→プロジェクト推定
      const { data: contactChannel } = await sb
        .from('contact_channels')
        .select('contact_id')
        .eq('address', msg.from_address)
        .limit(1);
      if (contactChannel?.[0]) {
        const { data: contact } = await sb
          .from('contact_persons')
          .select('organization_id')
          .eq('id', contactChannel[0].contact_id)
          .single();
        if (contact?.organization_id) {
          const { data: org } = await sb
            .from('organizations')
            .select('id, name')
            .eq('id', contact.organization_id)
            .single();
          if (org) {
            orgProject.orgId = org.id;
            orgProject.orgName = org.name;
            // プロジェクト検索
            const { data: projects } = await sb
              .from('projects')
              .select('id, name')
              .eq('organization_id', org.id)
              .limit(1);
            if (projects?.[0]) {
              orgProject.projectId = projects[0].id;
              orgProject.projectName = projects[0].name;
            }
          }
        }
      }
    } else if (channel === 'slack' || channel === 'chatwork') {
      const channelId = channel === 'slack'
        ? (metadata.slackChannel || metadata.channel)
        : (metadata.chatworkRoomId || metadata.room_id || '');
      if (channelId) {
        orgProject = await DriveService.detectOrgProjectFromChannel(sb, channel, String(channelId));
      }
    }

    // チャネル別にファイルダウンロード＆アップロード
    if (channel === 'email') {
      const gmailMessageId = metadata.messageId;
      if (!gmailMessageId) {
        return NextResponse.json({ error: 'Gmail messageIdが見つかりません' }, { status: 400 });
      }

      const attachments = await DriveService.getGmailAttachments(userId, gmailMessageId);
      if (attachments.length === 0) {
        return NextResponse.json({ error: 'このメッセージには添付ファイルがありません' }, { status: 400 });
      }

      for (const att of attachments) {
        try {
          const fileData = await DriveService.downloadGmailAttachment(userId, gmailMessageId, att.attachmentId);
          if (!fileData) { results.push({ fileName: att.fileName, status: 'download_failed' }); continue; }

          await processSingleAttachment(userId, sb, msg, att.fileName, att.mimeType, fileData, orgProject, tempFolderId, 'email');
          results.push({ fileName: att.fileName, status: 'ok' });
        } catch (e) {
          console.error('[SaveAttachments] Email添付エラー:', att.fileName, e);
          results.push({ fileName: att.fileName, status: 'error' });
        }
      }
    } else if (channel === 'slack') {
      const files = metadata.files || [];
      if (files.length === 0) {
        return NextResponse.json({ error: 'このメッセージにはファイルがありません' }, { status: 400 });
      }
      for (const file of files) {
        const fileName = file.name || file.title || 'slack_file';
        const mimeType = file.mimetype || 'application/octet-stream';
        try {
          const result = await DriveService.downloadSlackFile(userId, file.id);
          if (!result) { results.push({ fileName, status: 'download_failed' }); continue; }

          await processSingleAttachment(userId, sb, msg, fileName, mimeType, { data: result.buffer, mimeType: result.mimeType }, orgProject, tempFolderId, 'slack');
          results.push({ fileName, status: 'ok' });
        } catch (e) {
          console.error('[SaveAttachments] Slack添付エラー:', fileName, e);
          results.push({ fileName, status: 'error' });
        }
      }
    } else if (channel === 'chatwork') {
      const fileInfo = metadata.file_info || metadata.files || [];
      const files = Array.isArray(fileInfo) ? fileInfo : [fileInfo];
      const roomId = metadata.chatworkRoomId || metadata.room_id;
      if (!roomId || files.length === 0 || !files[0]?.file_id) {
        return NextResponse.json({ error: 'このメッセージにはファイルがありません' }, { status: 400 });
      }
      for (const file of files) {
        const fileName = file.filename || file.name || 'chatwork_file';
        const mimeType = file.content_type || 'application/octet-stream';
        try {
          const result = await DriveService.downloadChatworkFile(userId, String(roomId), String(file.file_id));
          if (!result) { results.push({ fileName, status: 'download_failed' }); continue; }

          await processSingleAttachment(userId, sb, msg, fileName, mimeType, { data: result.buffer, mimeType: result.mimeType }, orgProject, tempFolderId, 'chatwork');
          results.push({ fileName, status: 'ok' });
        } catch (e) {
          console.error('[SaveAttachments] CW添付エラー:', fileName, e);
          results.push({ fileName, status: 'error' });
        }
      }
    }

    // メッセージのdrive_syncedフラグを更新
    await sb.from('inbox_messages').update({ drive_synced: true }).eq('id', messageId);

    const okCount = results.filter(r => r.status === 'ok').length;
    if (results.length === 0) {
      return NextResponse.json({ error: 'このメッセージにはファイルがありません' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        totalFiles: results.length,
        savedFiles: okCount,
        results,
        message: okCount > 0
          ? `${okCount}件のファイルをDriveの受領フォルダに保存しました。`
          : 'ファイルの保存に失敗しました',
      },
    });
  } catch (error) {
    console.error('[SaveAttachments] エラー:', error);
    return NextResponse.json(
      { error: 'Drive保存に失敗しました' },
      { status: 500 }
    );
  }
}

// v10.0: 1つのファイルを受領フォルダに直接アップロード→drive_documentsに記録（ステージング廃止）
async function processSingleAttachment(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msg: any,
  fileName: string,
  mimeType: string,
  fileData: { data: Buffer; mimeType: string },
  orgProject: { orgId: string | null; orgName: string | null; projectId: string | null; projectName: string | null },
  tempFolderId: string | null,
  sourceChannel: string,
) {
  // 1. ファイル名を標準化
  const uploadFileName = DriveService.generateV33FileName(
    fileName,
    undefined,
    msg.created_at ? new Date(msg.created_at) : undefined
  );

  // 2. アップロード先フォルダ決定（受領フォルダ優先、なければ一時フォルダ）
  let targetFolderId = tempFolderId;
  if (orgProject.orgId && orgProject.orgName && orgProject.projectId && orgProject.projectName) {
    await DriveService.getOrCreateOrgFolder(userId, orgProject.orgId, orgProject.orgName);
    await DriveService.getOrCreateProjectFolder(userId, orgProject.orgId, orgProject.projectId, orgProject.projectName);
    const receivedFolderId = await DriveService.getOrCreateDirectionFolder(
      userId, orgProject.orgId, orgProject.projectId, 'received'
    );
    if (receivedFolderId) targetFolderId = receivedFolderId;
  }

  // 3. Driveにアップロード
  const driveFile = await DriveService.uploadFile(userId, fileData.data, uploadFileName, mimeType, targetFolderId);
  if (!driveFile) return;

  // 4. drive_documentsに直接記録（ステージング経由なし）
  await DriveService.recordDocument({
    userId,
    organizationId: orgProject.orgId || undefined,
    projectId: orgProject.projectId || undefined,
    driveFileId: driveFile.id,
    driveFolderId: targetFolderId,
    fileName: driveFile.name,
    fileSizeBytes: fileData.data.length,
    mimeType,
    driveUrl: driveFile.webViewLink,
    direction: 'received',
    sourceChannel,
    sourceMessageId: msg.id,
  });
}
