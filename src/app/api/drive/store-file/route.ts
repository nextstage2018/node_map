// Phase 45b: ファイル格納API
// 秘書に「格納して」と指示された際にURLリンク or ファイル参照をdrive_documentsに記録
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase未設定' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      fileUrl,
      organizationId,
      projectId,
      documentType,
      direction,
      yearMonth,
    } = body;

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl は必須です' }, { status: 400 });
    }

    // URLからリンク情報を抽出
    const extractedUrls = DriveService.extractUrlsFromText(fileUrl);

    if (extractedUrls.length === 0) {
      // URLパターンにマッチしない場合は汎用URLとして記録
      const sb = createServerClient();
      if (!sb) {
        return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
      }

      const { data, error } = await sb
        .from('drive_documents')
        .insert({
          user_id: userId,
          file_name: fileUrl.split('/').pop() || fileUrl,
          link_type: 'drive',
          link_url: fileUrl,
          organization_id: organizationId || null,
          project_id: projectId || null,
          document_type: documentType || 'その他',
          direction: direction || 'received',
          year_month: yearMonth || new Date().toISOString().slice(0, 7),
          source_channel: 'manual',
          uploaded_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        console.error('[StoreFile] 記録エラー:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: { documentId: data?.id, count: 1 },
      });
    }

    // Google Docs/Sheets/Drive URLの場合
    const results: string[] = [];

    for (const urlInfo of extractedUrls) {
      try {
        const docId = await DriveService.recordDocumentLink({
          userId,
          url: urlInfo.url,
          linkType: urlInfo.linkType,
          documentId: urlInfo.documentId,
          title: urlInfo.title,
          organizationId: organizationId || undefined,
          projectId: projectId || undefined,
          documentType: documentType || undefined,
          direction: direction || undefined,
          yearMonth: yearMonth || undefined,
        });
        if (docId) results.push(docId);
      } catch (err) {
        console.error('[StoreFile] URL記録エラー:', urlInfo.url, err);
      }
    }

    return NextResponse.json({
      success: true,
      data: { documentIds: results, count: results.length },
    });
  } catch (error) {
    console.error('[StoreFile] エラー:', error);
    return NextResponse.json(
      { error: 'ファイル格納に失敗しました' },
      { status: 500 }
    );
  }
}
