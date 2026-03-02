// Phase 47: ナレッジクラスタリング提案API（GET: 一覧取得 / POST: 手動トリガー）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { KnowledgeClusteringService } from '@/services/nodemap/knowledgeClustering.service';

export const dynamic = 'force-dynamic';

// 待機中の提案一覧取得
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const proposals = await KnowledgeClusteringService.getPendingProposals(userId);

    return NextResponse.json({ success: true, data: proposals });
  } catch (error) {
    console.error('[Knowledge Proposals API] Error:', error);
    return NextResponse.json(
      { success: false, error: '提案の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 手動でクラスタリング提案を生成
export async function POST() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const proposal = await KnowledgeClusteringService.proposeWeeklyClustering(userId);

    if (!proposal) {
      return NextResponse.json({
        success: true,
        data: null,
        message: '提案を生成できませんでした（未確認キーワードが5個未満、または今週の提案が既にあります）',
      });
    }

    return NextResponse.json({ success: true, data: proposal });
  } catch (error) {
    console.error('[Knowledge Proposals API] Error:', error);
    return NextResponse.json(
      { success: false, error: '提案の生成に失敗しました' },
      { status: 500 }
    );
  }
}
