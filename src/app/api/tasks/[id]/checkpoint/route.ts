// v9.0: タスクチェックポイント評価API
// 会話履歴をAIが評価し、BOSS観点＋伸二メソッド観点でスコアリング
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

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

    const { id: taskId } = await params;
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB未設定' }, { status: 400 });
    }

    // タスク情報取得
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, description, status, due_date, project_id, milestone_id')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ success: false, error: 'タスクが見つかりません' }, { status: 404 });
    }

    // 会話履歴取得
    const { data: conversations } = await supabase
      .from('task_conversations')
      .select('role, content, phase, created_at')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!conversations || conversations.length < 2) {
      return NextResponse.json({
        success: false,
        error: 'チェックポイント評価にはAIとの会話が必要です。まず壁打ちを行ってください。',
      }, { status: 400 });
    }

    // プロジェクト・組織情報
    let projectContext = '';
    if (task.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('name, description, organization_id, organizations(name, memo)')
        .eq('id', task.project_id)
        .single();
      if (project) {
        const org = project.organizations as any;
        projectContext = `プロジェクト: ${project.name}${project.description ? `（${project.description}）` : ''}`;
        if (org) projectContext += `\n組織: ${org.name}${org.memo ? `（${org.memo}）` : ''}`;
      }
    }

    // ボスフィードバック学習を取得
    let bossFeedbackContext = '';
    if (task.project_id) {
      try {
        const { getBossFeedbackContext } = await import('@/services/v71/bossFeedbackLearning.service');
        const fbCtx = await getBossFeedbackContext(task.project_id);
        if (fbCtx) bossFeedbackContext = fbCtx;
      } catch { /* ignore */ }
    }

    // 意思決定ログ取得
    let decisionContext = '';
    if (task.project_id) {
      const { data: decisions } = await supabase
        .from('decision_log')
        .select('title, content, status')
        .eq('project_id', task.project_id)
        .in('status', ['active', 'on_hold'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (decisions && decisions.length > 0) {
        decisionContext = '\n直近の意思決定:\n' + decisions.map((d: any) =>
          `- ${d.title}: ${d.content || ''}`
        ).join('\n');
      }
    }

    // 会話テキストを構築
    const conversationText = conversations.map((c: any) =>
      `[${c.role === 'user' ? 'ユーザー' : 'AI'}] ${c.content}`
    ).join('\n\n');

    // Claude APIでチェックポイント評価
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

    const evaluationPrompt = `あなたはビジネスタスクの品質評価エージェントです。以下の観点でタスクの進行品質を100点満点で評価してください。

## 評価対象
タスク: ${task.title}
${task.description ? `説明: ${task.description}` : ''}
${task.due_date ? `期限: ${task.due_date}` : ''}
${projectContext}
${decisionContext}
${bossFeedbackContext}

## 会話履歴
${conversationText}

## 評価の5観点（各20点）

### 1. ゴール明確度（20点）
- 完了条件が具体的に定義されているか
- 成果物のイメージが関係者と共有できるレベルか
- 曖昧な「やっておきます」で終わっていないか

### 2. 思考の深度（20点）— 伸二メソッド観点
- 「そもそも」の問いが立てられているか（Why×5層）
- 表面的な作業指示の遂行だけで止まっていないか
- 横方向の連想（飛び地思考）で別の視点を検討したか
- ストーリーとして構造化されているか

### 3. 先回り・視座の高さ（20点）— BOSS観点
- タスク単体ではなく、プロジェクト全体の中での位置づけを意識しているか
- 「このタスクの先にある目的」まで考えが及んでいるか
- 上長や関係者が気にするであろうポイントを先に押さえているか
- 過去の意思決定との整合性を確認しているか
${bossFeedbackContext ? '- 上長の過去の指摘パターンを踏まえた対応ができているか' : ''}

### 4. リスク・懸念の洗い出し（20点）
- 失敗シナリオや障害要因を検討しているか
- 依存関係（他タスク・他者・外部要因）を認識しているか
- 「最悪の場合どうなるか」を想定しているか

### 5. 練度・精度（20点）
- アウトプットの品質を上げる余地を検討しているか
- 「とりあえず」ではなく根拠に基づいた判断をしているか
- 改善サイクル（仮説→検証→修正）の意識があるか

## 出力形式（必ずこのJSON形式で返してください）
{
  "total_score": 数値（0-100）,
  "breakdown": {
    "goal_clarity": { "score": 数値, "comment": "1文コメント" },
    "thinking_depth": { "score": 数値, "comment": "1文コメント" },
    "proactive_vision": { "score": 数値, "comment": "1文コメント" },
    "risk_awareness": { "score": 数値, "comment": "1文コメント" },
    "quality_precision": { "score": 数値, "comment": "1文コメント" }
  },
  "overall_feedback": "全体的なフィードバック（2-3文）",
  "improvement_hints": ["改善のヒント1", "改善のヒント2"]
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: evaluationPrompt }],
    });

    // レスポンスからJSONを抽出
    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // JSON部分を抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, error: '評価結果の解析に失敗しました' }, { status: 500 });
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      data: {
        ...evaluation,
        can_complete: evaluation.total_score >= 85,
        evaluated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Checkpoint API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'チェックポイント評価に失敗しました' },
      { status: 500 }
    );
  }
}
