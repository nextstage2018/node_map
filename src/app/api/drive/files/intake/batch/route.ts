// Phase 44c: ファイル一括承認API
// 全 pending_review ファイルをAI推奨値で一括承認
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    let body: { ids?: string[] } = {};
    try {
      body = await request.json();
    } catch {
      // bodyなし = 全件一括
    }

    // 対象ファイル取得
    const allPending = await DriveService.getPendingStagingFiles(userId);

    // idsが指定されていればフィルタ
    const targets = body.ids
      ? allPending.filter(f => body.ids!.includes(f.id as string))
      : allPending;

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        data: { approved: 0, errors: 0, message: '承認対象のファイルがありません' },
      });
    }

    let approved = 0;
    let errors = 0;
    const results: { fileName: string; success: boolean; driveUrl?: string; error?: string }[] = [];

    for (const file of targets) {
      try {
        // 組織/プロジェクトが未設定のファイルはスキップ
        if (!file.organization_id || !file.project_id) {
          results.push({
            fileName: file.file_name as string,
            success: false,
            error: '組織/プロジェクト未設定',
          });
          errors++;
          continue;
        }

        const result = await DriveService.approveStagingFile({
          stagingId: file.id as string,
          userId,
          documentType: (file.ai_document_type as string) || 'その他',
          direction: (file.ai_direction as string) === 'submitted' ? 'submitted' : 'received',
          yearMonth: (file.ai_year_month as string) || new Date().toISOString().slice(0, 7),
        });

        if (result.success) {
          approved++;
          results.push({
            fileName: file.file_name as string,
            success: true,
            driveUrl: result.driveUrl,
          });
        } else {
          errors++;
          results.push({
            fileName: file.file_name as string,
            success: false,
            error: result.error,
          });
        }
      } catch (fileError) {
        errors++;
        results.push({
          fileName: file.file_name as string,
          success: false,
          error: fileError instanceof Error ? fileError.message : '不明なエラー',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        approved,
        errors,
        total: targets.length,
        results,
        message: `${approved}件を承認しました${errors > 0 ? `（${errors}件エラー）` : ''}`,
      },
    });
  } catch (error) {
    console.error('[Drive Intake Batch] エラー:', error);
    return NextResponse.json(
      { success: false, error: '一括承認処理に失敗しました' },
      { status: 500 }
    );
  }
}
