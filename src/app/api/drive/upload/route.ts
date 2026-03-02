// Phase 48: 秘書チャットからのファイルアップロードAPI
// ファイルをプロジェクトフォルダにアップロードし、drive_documentsに記録
import { NextResponse, NextRequest } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import {
  isDriveConnected,
  uploadFile,
  getOrCreateOrgFolder,
  getOrCreateProjectFolder,
  ensureFinalFolder,
} from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

// 書類種別の定義
const DOCUMENT_TYPES = [
  '提案書', '見積書', '契約書', '請求書', '発注書',
  '納品書', '仕様書', '議事録', '報告書', '企画書', 'その他',
];

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    // Drive接続チェック
    const connected = await isDriveConnected(userId);
    if (!connected) {
      return NextResponse.json({
        success: false,
        error: 'Google Driveが接続されていません。設定画面からGmail連携を再設定してください。',
      }, { status: 400 });
    }

    // multipart/form-data を解析
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;
    const documentType = formData.get('documentType') as string || 'その他';
    const direction = (formData.get('direction') as string) || 'submitted';
    const memo = formData.get('memo') as string || '';

    if (!file) {
      return NextResponse.json({ success: false, error: 'ファイルが選択されていません' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'プロジェクトを選択してください' }, { status: 400 });
    }

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // プロジェクト情報取得
    const { data: project } = await sb
      .from('projects')
      .select('id, name, organization_id, organizations(id, name)')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // 組織情報
    const org = project.organizations as { id: string; name: string } | null;
    const orgId = project.organization_id || '';
    const orgName = org?.name || '未分類';

    // 命名規則: YYYY-MM-DD_種別_元ファイル名
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const yearMonth = now.toISOString().slice(0, 7);
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const baseName = file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name;
    const renamedFileName = `${dateStr}_${documentType}_${baseName}${ext}`;

    // ファイルをBufferに変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let targetFolderId: string | null = null;

    if (orgId) {
      // 4階層フォルダ取得（組織/プロジェクト/方向/年月）
      targetFolderId = await ensureFinalFolder(
        userId, orgId, orgName, projectId, project.name,
        direction as 'received' | 'submitted', yearMonth
      );
    }

    if (!targetFolderId) {
      // フォールバック: プロジェクトフォルダに直接配置
      if (orgId) {
        targetFolderId = await getOrCreateProjectFolder(userId, orgId, projectId, project.name);
      }
    }

    if (!targetFolderId) {
      // 最終フォールバック: 組織フォルダ作成を試みる
      if (orgId) {
        targetFolderId = await getOrCreateOrgFolder(userId, orgId, orgName);
      }
    }

    if (!targetFolderId) {
      return NextResponse.json({
        success: false,
        error: 'Driveフォルダの作成に失敗しました。組織がプロジェクトに紐づいているか確認してください。',
      }, { status: 500 });
    }

    // Google Driveにアップロード
    const driveFile = await uploadFile(
      userId, buffer, renamedFileName, file.type || 'application/octet-stream', targetFolderId
    );

    if (!driveFile) {
      return NextResponse.json({ success: false, error: 'Driveへのアップロードに失敗しました' }, { status: 500 });
    }

    // drive_documents にレコード登録
    const docId = `dd_upload_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await sb.from('drive_documents').insert({
      id: docId,
      user_id: userId,
      organization_id: orgId || null,
      project_id: projectId,
      drive_file_id: driveFile.id,
      file_name: renamedFileName,
      original_file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size: buffer.length,
      direction: direction,
      document_type: documentType,
      year_month: yearMonth,
      drive_url: driveFile.webViewLink,
      memo: memo || null,
    });

    // ビジネスイベントに記録
    const eventType = direction === 'received' ? 'document_received' : 'document_submitted';
    await sb.from('business_events').insert({
      user_id: userId,
      project_id: projectId,
      title: `${documentType}をアップロード: ${file.name}`,
      content: memo || null,
      event_type: eventType,
      ai_generated: false,
      event_date: now.toISOString(),
      source_document_id: docId,
    });

    return NextResponse.json({
      success: true,
      data: {
        fileId: driveFile.id,
        fileName: renamedFileName,
        originalFileName: file.name,
        driveUrl: driveFile.webViewLink,
        documentType,
        direction,
        projectName: project.name,
        memo,
      },
    });
  } catch (error) {
    console.error('[Drive Upload] エラー:', error);
    return NextResponse.json({
      success: false,
      error: 'ファイルのアップロードに失敗しました',
    }, { status: 500 });
  }
}

// プロジェクト一覧取得（アップロードフォーム用）
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: true, data: { projects: [], documentTypes: DOCUMENT_TYPES } });
    }

    const { data: projects } = await sb
      .from('projects')
      .select('id, name, organization_id, organizations(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('name');

    return NextResponse.json({
      success: true,
      data: {
        projects: (projects || []).map(p => ({
          id: p.id,
          name: p.name,
          organizationId: p.organization_id,
          organizationName: (p.organizations as { name: string } | null)?.name || null,
        })),
        documentTypes: DOCUMENT_TYPES,
      },
    });
  } catch (error) {
    console.error('[Drive Upload] GET エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
