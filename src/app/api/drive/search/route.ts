// Google Drive ドキュメント検索API
// GET: ファイル名やDB情報で検索
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const organizationId = searchParams.get('organizationId') || '';
    const projectId = searchParams.get('projectId') || '';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query) {
      return NextResponse.json(
        { success: false, error: '検索クエリ q は必須です' },
        { status: 400 }
      );
    }

    // 1. DBから検索（ファイル名の部分一致）
    const sb = createServerClient();
    const dbResults: Record<string, unknown>[] = [];

    if (sb) {
      let dbQuery = sb
        .from('drive_documents')
        .select('*')
        .eq('user_id', userId)
        .ilike('file_name', `%${query}%`)
        .order('uploaded_at', { ascending: false })
        .limit(limit);

      if (organizationId) {
        dbQuery = dbQuery.eq('organization_id', organizationId);
      }
      if (projectId) {
        dbQuery = dbQuery.eq('project_id', projectId);
      }

      const { data } = await dbQuery;
      if (data) dbResults.push(...data);
    }

    // 2. Google Drive APIでも検索（DB未登録のファイルも拾える）
    let driveResults: DriveService.DriveFile[] = [];
    try {
      driveResults = await DriveService.searchFiles(userId, query, limit);
    } catch {
      // Drive API検索失敗は致命的ではない
    }

    // DB結果を優先し、Drive結果で補完
    const seenFileIds = new Set(dbResults.map(d => d.drive_file_id as string));
    const driveOnly = driveResults.filter(f => !seenFileIds.has(f.id));

    return NextResponse.json({
      success: true,
      data: {
        dbDocuments: dbResults,
        driveFiles: driveOnly,
        totalCount: dbResults.length + driveOnly.length,
      },
    });
  } catch (error) {
    console.error('[Drive Search API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ドキュメント検索に失敗しました' },
      { status: 500 }
    );
  }
}
