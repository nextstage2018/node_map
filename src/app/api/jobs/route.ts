import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { CreateJobRequest, JobStatus } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';

// ジョブ一覧取得（Phase 22: 認証ユーザーIDでフィルタリング）
export async function GET() {
  try {
    const userId = await getServerUserId();
    const jobs = await TaskService.getJobs(userId);
    return NextResponse.json({ success: true, data: jobs });
  } catch (error) {
    console.error('ジョブ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ジョブの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// ジョブ作成（Phase 22: 認証ユーザーIDを付与）
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body: CreateJobRequest = await request.json();
    if (!body.title) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
        { status: 400 }
      );
    }
    const job = await TaskService.createJob({ ...body, userId });
    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error('ジョブ作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ジョブの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// ジョブステータス更新
export async function PUT(request: NextRequest) {
  try {
    const body: { id: string; status: JobStatus } = await request.json();
    if (!body.id || !body.status) {
      return NextResponse.json(
        { success: false, error: 'IDとステータスは必須です' },
        { status: 400 }
      );
    }
    const job = await TaskService.updateJobStatus(body.id, body.status);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'ジョブが見つかりません' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error('ジョブ更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ジョブの更新に失敗しました' },
      { status: 500 }
    );
  }
}
