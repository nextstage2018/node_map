// Google Drive 添付ファイル自動同期 Cron Job
// inbox_messages の添付ファイルを自動検出し、Driveにアップロード
// 日次実行（vercel.json で設定）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 最大2分

const BATCH_SIZE = 30; // 1回あたりの処理件数

export async function GET(request: NextRequest) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/DriveDocs] 添付ファイル同期開始:', new Date().toISOString());

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Supabase未設定',
    });
  }

  const stats = {
    processed: 0,
    uploaded: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // drive_synced = false かつ Gmail チャネルのメッセージを取得
    // （Slack/Chatworkの添付取得はAPI制限のため将来対応）
    const { data: messages, error } = await supabase
      .from('inbox_messages')
      .select('id, channel, from_address, from_name, subject, metadata, direction, created_at')
      .eq('drive_synced', false)
      .eq('channel', 'email')
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

    // ユーザーごとにグループ化（user_service_tokensからユーザーを特定）
    // inbox_messagesにuser_idカラムはないため、全ユーザーのトークンを取得
    const { data: tokenUsers } = await supabase
      .from('user_service_tokens')
      .select('user_id, token_data')
      .eq('service_name', 'gmail')
      .eq('is_active', true);

    if (!tokenUsers || tokenUsers.length === 0) {
      console.log('[Cron/DriveDocs] Gmail連携ユーザーなし');
      // 全メッセージをdrive_synced=trueにマーク（処理不要）
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
        const gmailMessageId = metadata.messageId;

        if (!gmailMessageId) {
          // Gmail messageIdがないメッセージはスキップ
          stats.skipped++;
          await supabase
            .from('inbox_messages')
            .update({ drive_synced: true })
            .eq('id', msg.id);
          continue;
        }

        // 各ユーザーのトークンで添付ファイルを確認
        let attachmentFound = false;

        for (const tokenUser of tokenUsers) {
          const userId = tokenUser.user_id;

          // Drive接続チェック
          const connected = await DriveService.isDriveConnected(userId);
          if (!connected) continue;

          // Gmail添付ファイル一覧取得
          const attachments = await DriveService.getGmailAttachments(userId, gmailMessageId);

          if (attachments.length === 0) continue;

          attachmentFound = true;

          // 組織/プロジェクトを推定（from_addressからコンタクト → 組織）
          const orgProject = await detectOrgProject(supabase, msg.from_address, userId);

          for (const att of attachments) {
            try {
              // 添付ファイルダウンロード
              const fileData = await DriveService.downloadGmailAttachment(
                userId, gmailMessageId, att.attachmentId
              );

              if (!fileData) {
                stats.errors++;
                continue;
              }

              // アップロード先フォルダ確定
              let folderId: string | null = null;

              if (orgProject.orgId && orgProject.orgName) {
                const orgFolderId = await DriveService.getOrCreateOrgFolder(
                  userId, orgProject.orgId, orgProject.orgName
                );

                if (orgFolderId && orgProject.projectId && orgProject.projectName) {
                  folderId = await DriveService.getOrCreateProjectFolder(
                    userId, orgProject.orgId, orgProject.projectId, orgProject.projectName
                  );
                } else {
                  folderId = orgFolderId;
                }
              }

              if (!folderId) {
                // フォルダ未特定の場合、「未分類」フォルダを作成
                const unsortedFolder = await DriveService.createFolder(userId, '[NodeMap] 未分類');
                folderId = unsortedFolder?.id || null;
              }

              if (!folderId) {
                stats.errors++;
                continue;
              }

              // Driveにアップロード
              const driveFile = await DriveService.uploadFile(
                userId,
                fileData.data,
                att.fileName,
                att.mimeType,
                folderId
              );

              if (!driveFile) {
                stats.errors++;
                continue;
              }

              // DBに記録
              await DriveService.recordDocument({
                userId,
                organizationId: orgProject.orgId || undefined,
                projectId: orgProject.projectId || undefined,
                driveFileId: driveFile.id,
                driveFolderId: folderId,
                fileName: driveFile.name,
                fileSizeBytes: driveFile.size,
                mimeType: driveFile.mimeType,
                driveUrl: driveFile.webViewLink,
                sourceChannel: 'email',
                sourceMessageId: msg.id,
              });

              stats.uploaded++;
            } catch (attError) {
              console.error('[Cron/DriveDocs] 添付処理エラー:', att.fileName, attError);
              stats.errors++;
            }
          }

          break; // 1ユーザーで処理できたら次のメッセージへ
        }

        if (!attachmentFound) {
          stats.skipped++;
        }

        // メッセージを処理済みにマーク
        await supabase
          .from('inbox_messages')
          .update({ drive_synced: true })
          .eq('id', msg.id);

      } catch (msgError) {
        console.error('[Cron/DriveDocs] メッセージ処理エラー:', msg.id, msgError);
        stats.errors++;
        // エラーでもdrive_syncedをtrueにして無限リトライを防止
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
// ヘルパー: メッセージのfrom_addressから組織/プロジェクトを推定
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

      // コンタクトからcompany_nameを取得
      const { data: contact } = await supabase
        .from('contact_persons')
        .select('company_name')
        .eq('id', contactId)
        .single();

      if (contact?.company_name) {
        // company_nameから組織を検索
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name')
          .ilike('name', `%${contact.company_name}%`)
          .limit(1)
          .single();

        if (org) {
          result.orgId = org.id;
          result.orgName = org.name;

          // 組織に紐づくプロジェクトを検索（最新1件）
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
