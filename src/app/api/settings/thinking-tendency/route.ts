import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { ThinkingTendencyService } from '@/services/analytics/thinkingTendency.service';

export const dynamic = 'force-dynamic';

// GET: 自分の最新傾向テキスト取得
export async function GET() {
  try {
    const userId = await getServerUserId();
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

    const { data } = await sb.from('user_thinking_tendencies')
      .select('*').eq('user_id', userId)
      .order('analysis_date', { ascending: false }).limit(1).single();

    const isOwner = userId === (process.env.ENV_TOKEN_OWNER_ID || '');

    // オーナー方針（チームメンバー用の読み取り）
    let ownerPolicy = null;
    if (!isOwner) {
      const ownerId = process.env.ENV_TOKEN_OWNER_ID || '';
      if (ownerId) {
        const { data: op } = await sb.from('user_thinking_tendencies')
          .select('owner_policy_text').eq('user_id', ownerId)
          .not('owner_policy_text', 'is', null)
          .order('analysis_date', { ascending: false }).limit(1).single();
        ownerPolicy = op?.owner_policy_text || null;
      }
    }

    return NextResponse.json({ success: true, data: { tendency: data || null, isOwner, ownerPolicy } });
  } catch (error) {
    console.error('[ThinkingTendency API] GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST: 今すぐ分析トリガー
export async function POST() {
  try {
    const userId = await getServerUserId();
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

    const analysis = await ThinkingTendencyService.analyzeUser(userId);
    const isOwner = userId === (process.env.ENV_TOKEN_OWNER_ID || '');
    const today = new Date().toISOString().split('T')[0];

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

    return NextResponse.json({ success: true, data: analysis });
  } catch (error) {
    console.error('[ThinkingTendency API] POST error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

// PUT: オーナーの方針テキスト手動更新
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const isOwner = userId === (process.env.ENV_TOKEN_OWNER_ID || '');
    if (!isOwner) return NextResponse.json({ error: 'Owner only' }, { status: 403 });

    const { ownerPolicyText } = await request.json();
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

    const today = new Date().toISOString().split('T')[0];
    await sb.from('user_thinking_tendencies').upsert({
      user_id: userId,
      analysis_date: today,
      owner_policy_text: ownerPolicyText,
    }, { onConflict: 'user_id,analysis_date' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ThinkingTendency API] PUT error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
