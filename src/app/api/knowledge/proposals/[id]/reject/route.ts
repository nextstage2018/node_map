// Phase 47: ナレッジ提案却下API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { KnowledgeClusteringService } from '@/services/nodemap/knowledgeClustering.service';

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

    const { id } = await params;

    await KnowledgeClusteringService.rejectProposal(id, userId);

    return NextResponse.json({
      success: true,
      message: '提案を却下しました。次回のクラスタリングで別の構造が提案されます。',
    });
  } catch (error) {
    console.error('[Knowledge Proposal Reject API] Error:', error);
    return NextResponse.json(
      { success: false, error: '提案の却下に失敗しました' },
      { status: 500 }
    );
  }
}
