// V2-F: チェックポイント評価エージェント
// マイルストーンの到達度をAIが構造的・客観的に評価する
// V2-G: 学習データの取得・注入・applied_countインクリメントを追加
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { getLearningPointsWithIds, incrementAppliedCount } from '@/lib/services/evaluationLearning.service';
import { getTodayJST } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

interface EvaluationResult {
  achievement_level: 'achieved' | 'partially' | 'missed';
  ai_analysis: string;
  deviation_summary: string;
  correction_suggestion: string;
  presentation_summary: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id } = await params;

    // 1. マイルストーン取得
    const { data: milestone, error: msError } = await supabase
      .from('milestones')
      .select('*, projects(id, name, description, organization_id)')
      .eq('id', id)
      .single();

    if (msError || !milestone) {
      console.error('[Milestone Evaluate] マイルストーン取得エラー:', msError);
      return NextResponse.json({ success: false, error: 'マイルストーンが見つかりません' }, { status: 404 });
    }

    // 2. マイルストーン配下のタスク取得
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, status, priority, phase, due_date, created_at, updated_at')
      .eq('milestone_id', id)
      .order('sort_order', { ascending: true });

    const completedTasks = (tasks || []).filter((t: { status: string }) => t.status === 'done');
    const totalTasks = (tasks || []).length;
    const taskSummary = (tasks || []).map((t: { title: string; status: string; phase: string }) =>
      `- ${t.title} [${t.status}] (フェーズ: ${t.phase})`
    ).join('\n');

    // 3. 思考ログ取得（milestone_idで絞り込み）
    const { data: thoughtNodes } = await supabase
      .from('thought_task_nodes')
      .select('node_id, node_label, created_at')
      .eq('milestone_id', id)
      .order('created_at', { ascending: true });

    const { data: thoughtEdges } = await supabase
      .from('thought_edges')
      .select('from_node_id, to_node_id, edge_type, label')
      .eq('milestone_id', id);

    const thoughtLogSummary = (thoughtNodes || []).length > 0
      ? `思考ノード: ${(thoughtNodes || []).map((n: { node_label: string }) => n.node_label).join(' → ')}`
      : '思考ログなし';

    // 4. V2-G: 過去の学習データ取得（サービス経由、IDも取得してapplied_count用）
    const learningsWithIds = await getLearningPointsWithIds(milestone.project_id, 5);
    const learningPoints = learningsWithIds.map(l => l.learning_point);
    const usedLearningIds = learningsWithIds.map(l => l.id);

    // 5. AI評価エージェント実行
    let evaluationResult: EvaluationResult;
    try {
      const anthropic = new Anthropic();

      const learningSection = learningPoints.length > 0
        ? `\n【過去の学習ポイント】\n${learningPoints.join('\n')}\n`
        : '';

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        system: `あなたはプロジェクトの評価エージェントです。
構造的かつ客観的に、マイルストーンの到達度を評価してください。
ズレがある場合は正直に指摘し、軌道修正の提案をしてください。

壁打ちパートナーではありません。協力的な姿勢ではなく、事実に基づいた客観的な評価をしてください。
${learningSection}
必ず以下のJSON形式で返してください（JSONのみ、他のテキストは不要）:
{
  "achievement_level": "achieved | partially | missed",
  "ai_analysis": "総合分析（200-400文字）",
  "deviation_summary": "当初ゴールとのズレの要約（100-200文字）",
  "correction_suggestion": "軌道修正の具体的な提案（100-200文字）",
  "presentation_summary": "会議で報告できる簡潔なサマリー（100文字以内）"
}

評価基準:
- achieved: ゴールの80%以上を達成し、主要な成果物が揃っている
- partially: 50-80%の進捗、または一部の重要タスクが未完了
- missed: 50%未満の進捗、または方向性のズレが大きい`,
        messages: [
          {
            role: 'user',
            content: `【マイルストーン評価依頼】

マイルストーン: ${milestone.title}
ゴール: ${milestone.description || '(未設定)'}
スタート地点: ${milestone.start_context || '(未設定)'}
目標日: ${milestone.target_date || '(未設定)'}
ステータス: ${milestone.status}

タスク進捗: ${completedTasks.length}/${totalTasks} 完了
${taskSummary || 'タスクなし'}

${thoughtLogSummary}

プロジェクト: ${milestone.projects?.name || '不明'}
プロジェクト説明: ${milestone.projects?.description || '(なし)'}`,
          },
        ],
      });

      // レスポンスからJSON解析
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AIレスポンスからJSONを解析できませんでした');
      }
      evaluationResult = JSON.parse(jsonMatch[0]) as EvaluationResult;

      // achievement_levelのバリデーション
      if (!['achieved', 'partially', 'missed'].includes(evaluationResult.achievement_level)) {
        evaluationResult.achievement_level = 'partially';
      }
    } catch (aiError) {
      console.error('[Milestone Evaluate] AI評価エラー:', aiError);
      return NextResponse.json({
        success: false,
        error: 'AI評価の実行に失敗しました。再試行してください。',
      }, { status: 500 });
    }

    // 6. 評価結果を保存
    const { data: evaluation, error: insertError } = await supabase
      .from('milestone_evaluations')
      .insert({
        milestone_id: id,
        evaluation_type: 'manual',
        achievement_level: evaluationResult.achievement_level,
        ai_analysis: evaluationResult.ai_analysis,
        deviation_summary: evaluationResult.deviation_summary,
        correction_suggestion: evaluationResult.correction_suggestion,
        presentation_summary: evaluationResult.presentation_summary,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Milestone Evaluate] 評価保存エラー:', insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    // 7. V2-G: 使用した学習データのapplied_countをインクリメント
    if (usedLearningIds.length > 0) {
      try {
        await incrementAppliedCount(usedLearningIds);
      } catch (incError) {
        // インクリメント失敗してもメイン処理はブロックしない
        console.error('[Milestone Evaluate] applied_countインクリメントエラー:', incError);
      }
    }

    // 8. マイルストーンのステータスを自動更新
    const statusUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (evaluationResult.achievement_level === 'achieved') {
      statusUpdate.status = 'achieved';
      statusUpdate.achieved_date = getTodayJST();
    } else if (evaluationResult.achievement_level === 'missed') {
      statusUpdate.status = 'missed';
    }
    // partially → ステータス変更なし（in_progress維持）

    if (Object.keys(statusUpdate).length > 1) {
      const { error: updateError } = await supabase
        .from('milestones')
        .update(statusUpdate)
        .eq('id', id);

      if (updateError) {
        console.error('[Milestone Evaluate] ステータス更新エラー:', updateError);
        // ステータス更新失敗してもメイン処理はブロックしない
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        evaluation,
        milestone_status: evaluationResult.achievement_level === 'achieved'
          ? 'achieved'
          : evaluationResult.achievement_level === 'missed'
            ? 'missed'
            : milestone.status,
      },
    });
  } catch (error) {
    console.error('[Milestone Evaluate] エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーン評価に失敗しました' }, { status: 500 });
  }
}
