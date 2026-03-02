// Phase 44b: ステージングファイル自動クリーンアップ Cron Job
// 14日以上経過した pending_review ファイルを expired に更新し、一時Driveファイルを削除
// 毎日0:30実行（vercel.json で設定）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EXPIRY_DAYS = 14;

export async function GET(request: NextRequest) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/DriveCleanup] ステージングクリーンアップ開始:', new Date().toISOString());

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase未設定' });
  }

  const stats = { expired: 0, driveDeleted: 0, errors: 0 };

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS);

    // 期限切れのステージングファイル取得
    const { data: expiredFiles, error } = await supabase
      .from('drive_file_staging')
      .select('id, user_id, temp_drive_file_id, file_name')
      .eq('status', 'pending_review')
      .lt('created_at', cutoff.toISOString())
      .limit(50);

    if (error) {
      console.error('[Cron/DriveCleanup] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!expiredFiles || expiredFiles.length === 0) {
      console.log('[Cron/DriveCleanup] クリーンアップ対象なし');
      return NextResponse.json({ success: true, stats });
    }

    console.log(`[Cron/DriveCleanup] ${expiredFiles.length}件のファイルを処理`);

    for (const file of expiredFiles) {
      try {
        // 一時Driveファイル削除
        if (file.temp_drive_file_id) {
          try {
            await DriveService.deleteFile(file.user_id, file.temp_drive_file_id);
            stats.driveDeleted++;
          } catch {
            // Driveファイルが既に削除済みでもエラーにしない
          }
        }

        // ステータスを expired に更新
        await supabase
          .from('drive_file_staging')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', file.id);

        stats.expired++;
        console.log(`[Cron/DriveCleanup] 期限切れ: ${file.file_name}`);
      } catch (fileError) {
        console.error('[Cron/DriveCleanup] ファイル処理エラー:', file.id, fileError);
        stats.errors++;
      }
    }

    // rejected ステータスのレコードも30日後に物理削除
    const deleteOldCutoff = new Date();
    deleteOldCutoff.setDate(deleteOldCutoff.getDate() - 30);

    await supabase
      .from('drive_file_staging')
      .delete()
      .in('status', ['rejected', 'expired'])
      .lt('updated_at', deleteOldCutoff.toISOString());

    console.log('[Cron/DriveCleanup] 完了:', JSON.stringify(stats));
    return NextResponse.json({ success: true, stats });

  } catch (error) {
    console.error('[Cron/DriveCleanup] 全体エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クリーンアップ処理に失敗しました', stats },
      { status: 500 }
    );
  }
}
