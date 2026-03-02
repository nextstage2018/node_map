// Phase 44c+45c: ファイル取り込み承認API
// ステージングファイルを承認 → 最終フォルダに移動+リネーム → ビジネスイベント記録
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id: stagingId } = await params;
    const body = await request.json();
    const {
      documentType,
      direction,
      yearMonth,
      fileName,
    } = body;

    if (!documentType || !direction || !yearMonth) {
      return NextResponse.json(
        { success: false, error: 'documentType, direction, yearMonth は必須です' },
        { status: 400 }
      );
    }

    const result = await DriveService.approveStagingFile({
      stagingId,
      userId,
      documentType,
      direction,
      yearMonth,
      fileName: fileName || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '承認処理に失敗しました' },
        { status: 500 }
      );
    }

    // ビジネスイベントに記録（Phase 45c）
    try {
      const supabase = createServerClient();
      if (supabase) {
        const dirLabel = direction === 'received' ? '受領' : '提出';
        await supabase
          .from('business_events')
          .insert({
            title: `[書類${dirLabel}] ${documentType}: ${fileName || stagingId}`,
            content: `ファイル: ${fileName || '不明'}\n種別: ${documentType}\n方向: ${dirLabel}\n年月: ${yearMonth}`,
            event_type: direction === 'received' ? 'document_received' : 'document_submitted',
            user_id: userId,
            source_document_id: stagingId,
            source_channel: 'drive',
            event_date: new Date().toISOString(),
          });
      }
    } catch (eventError) {
      console.error('[Drive Intake Approve] ビジネスイベント記録エラー:', eventError);
      // イベント記録失敗は承認結果に影響しない
    }

    return NextResponse.json({
      success: true,
      data: {
        driveUrl: result.driveUrl,
        message: 'ファイルを保存しました',
      },
    });
  } catch (error) {
    console.error('[Drive Intake Approve] エラー:', error);
    return NextResponse.json(
      { success: false, error: '承認処理に失敗しました' },
      { status: 500 }
    );
  }
}
