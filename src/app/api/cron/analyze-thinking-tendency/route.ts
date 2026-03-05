import { NextRequest, NextResponse } from 'next/server';
import { ThinkingTendencyService } from '@/services/analytics/thinkingTendency.service';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getISODateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

    const { data: users } = await sb
      .from('thought_task_nodes')
      .select('user_id');

    if (!users?.length) {
      return NextResponse.json({ success: true, message: 'No users with data', analyzedCount: 0 });
    }

    const userIds = [...new Set(users.map((u: any) => u.user_id))];
    let successCount = 0;
    let failCount = 0;
    const today = getISODateStr(new Date());

    for (const userId of userIds) {
      try {
        const analysis = await ThinkingTendencyService.analyzeUser(userId);
        const isOwner = userId === (process.env.ENV_TOKEN_OWNER_ID || '');

        await sb.from('user_thinking_tendencies').upsert({
          user_id: userId,
          analysis_date: today,
          tendency_summary: analysis.tendencySummary,
          thinking_patterns: analysis.thinkingPatterns,
          decision_style: analysis.decisionStyle,
          risk_tolerance: analysis.riskTolerance,
          collaboration_style: analysis.collaborationStyle,
          owner_policy_text: isOwner ? (analysis.ownerPolicyText || null) : null,
          ai_analysis_raw: analysis,
          source_stats: analysis.sourceStats,
        }, { onConflict: 'user_id,analysis_date' });

        successCount++;
        console.log(`[ThinkingTendency] Analyzed: ${userId}${isOwner ? ' (owner)' : ''}`);
      } catch (err) {
        console.error(`[ThinkingTendency] Error for ${userId}:`, err);
        failCount++;
      }
    }

    return NextResponse.json({ success: true, analyzedCount: successCount, failedCount: failCount });
  } catch (error) {
    console.error('[ThinkingTendency] Cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
