// Phase 48: ファイルアップロード完了 → DB登録API
// クライアントがGoogle Driveに直接アップロードした後、このAPIでDB登録を行う
import { NextResponse, NextRequest } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const {
      docId,
      driveFileId,
      driveUrl,
      orgId,
      projectId,
      projectName,
      renamedFileName,
      originalFileName,
      mimeType,
      fileSize,
      direction,
      documentType,
      yearMonth,
      memo,
    } = body;

    if (!driveFileId || !projectId) {
      return NextResponse.json({ success: false, error: '必須パラメータが不足しています' }, { status: 400 });
    }

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    const finalDocId = docId || `dd_upload_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();

    // drive_documents にレコード登録
    await sb.from('drive_documents').insert({
      id: finalDocId,
      user_id: userId,
      organization_id: orgId || null,
      project_id: projectId,
      drive_file_id: driveFileId,
      file_name: renamedFileName || originalFileName,
      original_file_name: originalFileName,
      mime_type: mimeType || 'application/octet-stream',
      file_size: fileSize || 0,
      direction: direction || 'submitted',
      document_type: documentType || 'その他',
      year_month: yearMonth || now.toISOString().slice(0, 7),
      drive_url: driveUrl || `https://drive.google.com/file/d/${driveFileId}/view`,
      memo: memo || null,
    });

    // ビジネスイベントに記録
    const eventType = direction === 'received' ? 'document_received' : 'document_submitted';
    await sb.from('business_events').insert({
      user_id: userId,
      project_id: projectId,
      title: `${documentType || 'その他'}をアップロード: ${originalFileName}`,
      content: memo || null,
      event_type: eventType,
      ai_generated: false,
      event_date: now.toISOString(),
      source_document_id: finalDocId,
    });

    return NextResponse.json({
      success: true,
      data: {
        docId: finalDocId,
        driveFileId,
        fileName: renamedFileName || originalFileName,
        driveUrl: driveUrl || `https://drive.google.com/file/d/${driveFileId}/view`,
        projectName: projectName || '',
        documentType: documentType || 'その他',
      },
    });
  } catch (error) {
    console.error('[Drive Upload Complete] エラー:', error);
    return NextResponse.json({ success: false, error: 'DB登録に失敗しました' }, { status: 500 });
  }
}
