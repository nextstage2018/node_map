/**
 * Phase 61: AIパーソナライズコンテキスト構築サービス
 * 全AIエンドポイントから呼ばれ、ユーザーの性格・応答スタイル・思考傾向・オーナー方針を
 * プロンプト注入用テキストとして返す
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';

const PERSONALITY_DESCRIPTIONS: Record<string, string> = {
  INTJ: '戦略的・論理的思考。効率性を重視し、直接的なコミュニケーションを好む',
  INTP: '分析的・理論重視。複雑な問題を抽象化して解くことを好む',
  ENTJ: '決断力があり目標指向。組織化・効率化を推進する',
  ENTP: '革新的・討論好き。新しいアイデアや可能性を探求する',
  INFJ: '洞察力が強く理想主義的。人の成長と調和を重視する',
  INFP: '価値観重視・創造的。個人の信念に基づいて行動する',
  ENFJ: '共感力が高くリーダーシップがある。チームの成長を支援する',
  ENFP: '熱意があり社交的。可能性を見出し人を巻き込む',
  ISTJ: '責任感が強く実務的。ルールと手順を重視する',
  ISFJ: '献身的で協力的。安定と調和を大切にする',
  ESTJ: '組織的で実行力がある。効率と秩序を重視する',
  ESFJ: '社交的で協調性が高い。チームワークを大切にする',
  ISTP: '実践的で分析的。問題解決に手を動かして取り組む',
  ISFP: '柔軟で感受性が豊か。美的センスと実用性を兼ね備える',
  ESTP: '行動派でエネルギッシュ。現実的な判断を素早く下す',
  ESFP: '社交的で楽観的。現在を楽しみ周囲を活気づける',
};

const RESPONSE_STYLE_INSTRUCTIONS: Record<string, { label: string; instruction: string }> = {
  concise: {
    label: '端的重視',
    instruction: '結論ファーストで、要点のみ簡潔に回答してください。冗長な説明は避け、核心を突いた短い応答を心がけてください。',
  },
  normal: {
    label: '通常',
    instruction: 'バランスの取れた応答をしてください。要点を押さえつつ、必要に応じて補足説明も加えてください。',
  },
  detailed: {
    label: '補足説明重視',
    instruction: '背景情報や理由も含めて丁寧に説明してください。選択肢のメリット・デメリットや具体例も提示してください。',
  },
};

export async function buildPersonalizedContext(
  userId: string,
  options?: { includeOwnerPolicy?: boolean }
): Promise<string> {
  const includeOwnerPolicy = options?.includeOwnerPolicy !== false;
  const parts: string[] = [];

  try {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return '';

    // --- 1. プロフィール情報（性格タイプ・応答スタイル）---
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      );
      const { data: { user } } = await adminClient.auth.admin.getUserById(userId);
      if (user) {
        const meta = user.user_metadata || {};
        const personalityType = meta.personality_type as string | undefined;
        const aiResponseStyle = meta.ai_response_style as string | undefined;

        if (personalityType && PERSONALITY_DESCRIPTIONS[personalityType]) {
          parts.push(`### 性格タイプ: ${personalityType}\n${PERSONALITY_DESCRIPTIONS[personalityType]}`);
        }
        if (aiResponseStyle && RESPONSE_STYLE_INSTRUCTIONS[aiResponseStyle]) {
          const style = RESPONSE_STYLE_INSTRUCTIONS[aiResponseStyle];
          parts.push(`### 応答スタイル: ${style.label}\n${style.instruction}`);
        }
      }
    } catch (profileErr) {
      console.error('[PersonalizedContext] プロフィール取得エラー:', profileErr);
    }

    // --- 2. 思考傾向（最新の分析結果）---
    try {
      const { data: tendency } = await sb
        .from('user_thinking_tendencies')
        .select('tendency_summary')
        .eq('user_id', userId)
        .order('analysis_date', { ascending: false })
        .limit(1)
        .single();

      if (tendency?.tendency_summary) {
        parts.push(`### あなたの思考傾向\n${tendency.tendency_summary}`);
      }
    } catch {
      // テーブル未作成 or データなしは無視
    }

    // --- 3. オーナー方針（自分がオーナーでない場合に注入）---
    if (includeOwnerPolicy) {
      const ownerUserId = process.env.ENV_TOKEN_OWNER_ID || '';
      if (ownerUserId && ownerUserId !== userId) {
        try {
          const { data: ownerTendency } = await sb
            .from('user_thinking_tendencies')
            .select('owner_policy_text')
            .eq('user_id', ownerUserId)
            .not('owner_policy_text', 'is', null)
            .order('analysis_date', { ascending: false })
            .limit(1)
            .single();

          if (ownerTendency?.owner_policy_text) {
            parts.push(`### マネジャーの方針・判断基準\n${ownerTendency.owner_policy_text}`);
          }
        } catch {
          // オーナーデータなしは無視
        }
      }
    }
  } catch (err) {
    console.error('[PersonalizedContext] 構築エラー:', err);
  }

  if (parts.length === 0) return '';
  return `\n\n## パーソナライズコンテキスト（この情報を踏まえて応答を調整すること）\n\n${parts.join('\n\n')}`;
}
