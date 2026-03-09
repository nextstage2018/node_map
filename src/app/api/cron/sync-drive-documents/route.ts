// Phase 45a: Google Drive 添付ファイル自動同期 Cron Job（全チャネル + URL検出対応）
// inbox_messages（email/slack/chatwork）の添付ファイルを自動検出 → 一時フォルダにアップロード → AI分類 → ステージング登録
// 本文中のGoogle Docs/Sheets/Drive URLもdrive_documentsにリンクとして記録
// ユーザー承認後に最終フォルダへ移動（承認は秘書チャットの FileIntakeCard 経由）
// 日次実行（vercel.json で設定）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';
import { classifyFile } from '@/services/drive/fileClassification.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 最大2分

const BATCH_SIZE = 20; // AI分類の分だけ処理時間が増えるため30→20に削減

export async function GET(request: NextRequest) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/DriveDocs] 添付ファイル同期開始（全チャネル+URL検出）:', new Date().toISOString());

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase未設定' });
  }

  const stats = {
    processed: 0,
    staged: 0,
    skipped: 0,
    errors: 0,
    urlsRecorded: 0,
  };

  try {
    // drive_synced = false の全チャネルメッセージを取得（email/slack/chatwork）
    const { data: messages, error } = await supabase
      .from('inbox_messages')
      .select('id, channel, from_address, from_name, subject, body, metadata, direction, created_at')
      .eq('drive_synced', false)
      .in('channel', ['email', 'slack', 'chatwork'])
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[Cron/DriveDocs] メッセージ取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      console.log('[Cron/DriveDocs] 同期対象メッセージなし');
      return NextResponse.json({ success: true, stats });
    }

    console.log(`[Cron/DriveDocs] ${messages.length}件のメッセージを処理`);

    // Drive連携ユーザーのトークン取得（Gmail OAuth = Drive/Calendar共通）
    const { data: tokenUsers } = await supabase
      .from('user_service_tokens')
      .select('user_id, token_data')
      .eq('service_name', 'gmail')
      .eq('is_active', true);

    if (!tokenUsers || tokenUsers.length === 0) {
      console.log('[Cron/DriveDocs] Drive連携ユーザーなし');
      const msgIds = messages.map(m => m.id);
      await supabase
        .from('inbox_messages')
        .update({ drive_synced: true })
        .in('id', msgIds);
      return NextResponse.json({ success: true, stats });
    }

    for (const msg of messages) {
      stats.processed++;

      try {
        const metadata = msg.metadata || {};

        // ========================================
        // 1. 本文中のURL検出（全チャネル共通）
        // ========================================
        if (msg.body) {
          const bodyText = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
          const extractedUrls = DriveService.extractUrlsFromText(bodyText);

          if (extractedUrls.length > 0) {
            // URL記録にはDrive接続済みユーザーが必要
            for (const tokenUser of tokenUsers) {
              const userId = tokenUser.user_id;
              const connected = await DriveService.isDriveConnected(userId);
              if (!connected) continue;

              // チャネルに応じて組織/プロジェクトを推定
              const orgProject = msg.channel === 'email'
                ? await detectOrgProject(supabase, msg.from_address, userId)
                : await DriveService.detectOrgProjectFromChannel(
                    supabase, msg.channel, getChannelId(msg)
                  );

              for (const urlInfo of extractedUrls) {
                try {
                  await DriveService.recordDocumentLink({
                    userId,
                    url: urlInfo.url,
                    linkType: urlInfo.linkType,
                    documentId: urlInfo.documentId,
                    title: urlInfo.title,
                    organizationId: orgProject.orgId || undefined,
                    projectId: orgProject.projectId || undefined,
                    sourceMessageId: msg.id,
                    sourceChannel: msg.channel,
                  });
                  stats.urlsRecorded++;
                } catch (urlError) {
                  console.error('[Cron/DriveDocs] URL記録エラー:', urlInfo.url, urlError);
                }
              }
              break; // 1ユーザーで処理
            }
          }
        }

        // ========================================
        // 2. チャネル別の添付ファイル処理
        // ========================================
        if (msg.channel === 'email') {
          // === Email: 既存のGmail添付ファイル処理 ===
          await processEmailAttachments(supabase, msg, metadata, tokenUsers, stats);
        } else if (msg.channel === 'slack') {
          // === Slack: files配列から添付ファイル処理 ===
          await processSlackAttachments(supabase, msg, metadata, tokenUsers, stats);
        } else if (msg.channel === 'chatwork') {
          // === Chatwork: file_info から添付ファイル処理 ===
          await processChatworkAttachments(supabase, msg, metadata, tokenUsers, stats);
        }

        // メッセージを処理済みにマーク
        await supabase
          .from('inbox_messages')
          .update({ drive_synced: true })
          .eq('id', msg.id);

      } catch (msgError) {
        console.error('[Cron/DriveDocs] メッセージ処理エラー:', msg.id, msgError);
        stats.errors++;
        await supabase
          .from('inbox_messages')
          .update({ drive_synced: true })
          .eq('id', msg.id);
      }
    }

    console.log('[Cron/DriveDocs] 完了:', JSON.stringify(stats));
    return NextResponse.json({ success: true, stats });

  } catch (error) {
    console.error('[Cron/DriveDocs] 全体エラー:', error);
    return NextResponse.json(
      { success: false, error: 'Drive同期処理に失敗しました', stats },
      { status: 500 }
    );
  }
}

// ========================================
// Email添付ファイル処理（既存ロジック）
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processEmailAttachments(supabase: any, msg: any, metadata: any, tokenUsers: any[], stats: any) {
  const gmailMessageId = metadata.messageId;
  if (!gmailMessageId) {
    stats.skipped++;
    return;
  }

  for (const tokenUser of tokenUsers) {
    const userId = tokenUser.user_id;
    const connected = await DriveService.isDriveConnected(userId);
    if (!connected) continue;

    const attachments = await DriveService.getGmailAttachments(userId, gmailMessageId);
    if (attachments.length === 0) continue;

    const orgProject = await detectOrgProject(supabase, msg.from_address, userId);
    const tempFolderId = await DriveService.getOrCreateTempFolder(userId);

    for (const att of attachments) {
      await processAttachment(supabase, msg, userId, att.fileName, att.mimeType, async () => {
        return await DriveService.downloadGmailAttachment(userId, gmailMessageId, att.attachmentId);
      }, orgProject, tempFolderId, 'email', stats);
    }
    break; // 1ユーザーで処理
  }
}

// ========================================
// Slack添付ファイル処理
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processSlackAttachments(supabase: any, msg: any, metadata: any, tokenUsers: any[], stats: any) {
  // Slackメッセージのmetadataからfiles情報を取得
  const files = metadata.files || [];
  if (files.length === 0) {
    stats.skipped++;
    return;
  }

  const channelId = getChannelId(msg);

  for (const tokenUser of tokenUsers) {
    const userId = tokenUser.user_id;
    const connected = await DriveService.isDriveConnected(userId);
    if (!connected) continue;

    const orgProject = await DriveService.detectOrgProjectFromChannel(supabase, 'slack', channelId);
    const tempFolderId = await DriveService.getOrCreateTempFolder(userId);

    for (const file of files) {
      const fileName = file.name || file.title || 'slack_file';
      const mimeType = file.mimetype || 'application/octet-stream';
      const fileId = file.id;

      if (!fileId) continue;

      await processAttachment(supabase, msg, userId, fileName, mimeType, async () => {
        const result = await DriveService.downloadSlackFile(userId, fileId);
        if (!result) return null;
        return { data: result.buffer, mimeType: result.mimeType };
      }, orgProject, tempFolderId, 'slack', stats);
    }
    break;
  }
}

// ========================================
// Chatwork添付ファイル処理
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processChatworkAttachments(supabase: any, msg: any, metadata: any, tokenUsers: any[], stats: any) {
  // Chatworkメッセージのmetadataからfile_info情報を取得
  const fileInfo = metadata.file_info || metadata.files || [];
  const files = Array.isArray(fileInfo) ? fileInfo : [fileInfo];
  if (files.length === 0 || !files[0]?.file_id) {
    stats.skipped++;
    return;
  }

  const roomId = metadata.chatworkRoomId || metadata.room_id;
  if (!roomId) {
    stats.skipped++;
    return;
  }

  const channelId = getChannelId(msg);

  for (const tokenUser of tokenUsers) {
    const userId = tokenUser.user_id;
    const connected = await DriveService.isDriveConnected(userId);
    if (!connected) continue;

    const orgProject = await DriveService.detectOrgProjectFromChannel(supabase, 'chatwork', channelId);
    const tempFolderId = await DriveService.getOrCreateTempFolder(userId);

    for (const file of files) {
      const fileName = file.filename || file.name || 'chatwork_file';
      const mimeType = file.content_type || 'application/octet-stream';
      const fileId = file.file_id;

      if (!fileId) continue;

      await processAttachment(supabase, msg, userId, fileName, mimeType, async () => {
        const result = await DriveService.downloadChatworkFile(userId, String(roomId), String(fileId));
        if (!result) return null;
        return { data: result.buffer, mimeType: result.mimeType };
      }, orgProject, tempFolderId, 'chatwork', stats);
    }
    break;
  }
}

// ========================================
// 共通: 添付ファイル1件の処理（DL → アップロード → AI分類 → staging登録）
// ========================================
async function processAttachment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msg: any,
  userId: string,
  fileName: string,
  mimeType: string,
  downloadFn: () => Promise<{ data: Buffer; mimeType: string } | null>,
  orgProject: { orgId: string | null; orgName: string | null; projectId: string | null; projectName: string | null },
  tempFolderId: string | null,
  sourceChannel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any,
) {
  try {
    // ダウンロード
    const fileData = await downloadFn();
    if (!fileData) {
      stats.errors++;
      return;
    }

    // 1. 一時フォルダにアップロード
    let tempDriveFileId: string | null = null;
    if (tempFolderId) {
      const tempFile = await DriveService.uploadFile(
        userId,
        fileData.data,
        fileName,
        mimeType,
        tempFolderId
      );
      tempDriveFileId = tempFile?.id || null;
    }

    // 2. AI分類
    const sourceTypeMap: Record<string, string> = {
      email: msg.direction === 'sent' ? 'submitted_email' : 'received_email',
      slack: msg.direction === 'sent' ? 'submitted_chat' : 'received_chat',
      chatwork: msg.direction === 'sent' ? 'submitted_chat' : 'received_chat',
    };
    const sourceType = sourceTypeMap[sourceChannel] || 'received_email';

    const classification = await classifyFile({
      fileName,
      mimeType,
      emailSubject: msg.subject || undefined,
      emailBody: msg.body ? String(msg.body).slice(0, 200) : undefined,
      senderName: msg.from_name || undefined,
      senderAddress: msg.from_address || undefined,
      direction: msg.direction === 'sent' ? 'sent' : 'received',
      messageDate: msg.created_at,
      organizationName: orgProject.orgName || undefined,
      projectName: orgProject.projectName || undefined,
    });

    // 3. ステージングに登録
    // v3.3: ファイル名を新命名規則に変換 (YYYY-MM-DD_種別_原名.ext)
    const suggestedName = classification.suggestedName
      || DriveService.generateV33FileName(
          fileName,
          classification.documentType,
          msg.created_at ? new Date(msg.created_at) : undefined
        );

    const stagingId = await DriveService.saveStagingFile({
      userId,
      sourceMessageId: msg.id,
      sourceType,
      sourceFromName: msg.from_name || undefined,
      sourceFromAddress: msg.from_address || undefined,
      sourceSubject: msg.subject || undefined,
      fileName,
      mimeType,
      fileSizeBytes: fileData.data.length,
      tempDriveFileId: tempDriveFileId || undefined,
      organizationId: orgProject.orgId || undefined,
      organizationName: orgProject.orgName || undefined,
      projectId: orgProject.projectId || undefined,
      projectName: orgProject.projectName || undefined,
      aiDocumentType: classification.documentType,
      aiDirection: classification.direction,
      aiYearMonth: classification.yearMonth,
      aiSuggestedName: suggestedName,
      aiConfidence: classification.confidence,
      aiReasoning: classification.reasoning,
      sourceChannel,
    });

    if (stagingId) {
      stats.staged++;
      console.log(`[Cron/DriveDocs] ステージング登録: ${fileName} (${sourceChannel}) → ${classification.documentType} (${Math.round(classification.confidence * 100)}%)`);
    } else {
      stats.errors++;
    }
  } catch (attError) {
    console.error(`[Cron/DriveDocs] 添付処理エラー (${sourceChannel}):`, fileName, attError);
    stats.errors++;
  }
}

// ========================================
// ヘルパー: メッセージからチャネルIDを取得
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getChannelId(msg: any): string {
  const metadata = msg.metadata || {};
  if (msg.channel === 'slack') {
    return metadata.slackChannel || metadata.channel_id || '';
  }
  if (msg.channel === 'chatwork') {
    return metadata.chatworkRoomId || metadata.room_id || '';
  }
  return '';
}

// ========================================
// ヘルパー: メッセージのfrom_addressから組織/プロジェクトを推定（Email用）
// ========================================
async function detectOrgProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fromAddress: string | null,
  userId: string
): Promise<{
  orgId: string | null;
  orgName: string | null;
  projectId: string | null;
  projectName: string | null;
}> {
  const result = {
    orgId: null as string | null,
    orgName: null as string | null,
    projectId: null as string | null,
    projectName: null as string | null,
  };

  if (!fromAddress) return result;

  try {
    // 1. from_addressからコンタクトを検索
    const { data: channels } = await supabase
      .from('contact_channels')
      .select('contact_id')
      .eq('address', fromAddress)
      .limit(1);

    if (channels && channels.length > 0) {
      const contactId = channels[0].contact_id;

      const { data: contact } = await supabase
        .from('contact_persons')
        .select('company_name')
        .eq('id', contactId)
        .single();

      if (contact?.company_name) {
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name')
          .ilike('name', `%${contact.company_name}%`)
          .limit(1)
          .single();

        if (org) {
          result.orgId = org.id;
          result.orgName = org.name;

          const { data: project } = await supabase
            .from('projects')
            .select('id, name')
            .eq('organization_id', org.id)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (project) {
            result.projectId = project.id;
            result.projectName = project.name;
          }
        }
      }
    }

    // 2. メールドメインから組織を検索（フォールバック）
    if (!result.orgId) {
      const domain = fromAddress.split('@')[1];
      if (domain) {
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('domain', domain)
          .limit(1)
          .single();

        if (org) {
          result.orgId = org.id;
          result.orgName = org.name;

          const { data: project } = await supabase
            .from('projects')
            .select('id, name')
            .eq('organization_id', org.id)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (project) {
            result.projectId = project.id;
            result.projectName = project.name;
          }
        }
      }
    }
  } catch (error) {
    console.error('[Cron/DriveDocs] 組織推定エラー:', error);
  }

  return result;
}
