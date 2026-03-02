// Phase 47: ナレッジ提案承認API
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

    const result = await KnowledgeClusteringService.applyProposal(id, userId);

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.createdDomains}個の領域、${result.createdFields}個の分野を作成し、${result.confirmedEntries}個のキーワードを確定しました`,
    });
  } catch (error) {
    console.error('[Knowledge Proposal Apply API] Error:', error);
    const message = error instanceof Error ? error.message : '提案の適用に失敗しました';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
