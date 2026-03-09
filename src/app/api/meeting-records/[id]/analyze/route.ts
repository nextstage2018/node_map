// V2-D: 会議録AI解析エンドポイント
// 会議録テキストをAIに送り、要約・検討ツリー素材・マイルストーンフィードバックを同時抽出
// V2-G: milestone_feedbackから自動学習抽出を追加
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { extractLearningsFromMeetingFeedback } from '@/lib/services/evaluationLearning.service';

export const dynamic = 'force-dynamic';

interface AnalysisTopic {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface MilestoneFeedback {
  milestone_title: string;
  human_judgment: string;
  reasoning: string;
}

interface AnalysisResult {
  summary: string;
  topics: AnalysisTopic[];
  milestone_feedback: MilestoneFeedback[] | null;
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

    // 1. 会議録を取得
    const { data: record, error: fetchError } = await supabase
      .from('meeting_records')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !record) {
      console.error('[MeetingRecords Analyze] 取得エラー:', fetchError);
      return NextResponse.json({ success: false, error: '会議録が見つかりません' }, { status: 404 });
    }

    // 2. AI解析の実行
    let analysisResult: AnalysisResult;
    try {
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        system: `あなたは会議録を構造化するアシスタントです。以下の会議録から3つの情報を抽出してください。

必ず以下のJSON形式で返してください（JSONのみ、他のテキストは不要）:
{
  "summary": "会議の要点を200-400文字で要約したテキスト",
  "topics": [
    {
      "title": "議題のタイトル",
      "options": ["選択肢1", "選択肢2"],
      "decision": "決定事項（未決定ならnull）",
      "status": "active または completed または cancelled"
    }
  ],
  "milestone_feedback": [
    {
      "milestone_title": "言及されたマイルストーン名",
      "human_judgment": "人間の判定（achieved / partially / missed など）",
      "reasoning": "判定理由"
    }
  ]
}

注意:
- topicsは会議で議論された全ての議題を抽出してください
- 決定に至った議題のstatusは "completed"、まだ検討中なら "active"、取り消しなら "cancelled"
- マイルストーンに関する言及がなければ milestone_feedback は null にしてください
- 必ず有効なJSONを返してください`,
        messages: [
          {
            role: 'user',
            content: `会議タイトル: ${record.title}\n会議日: ${record.meeting_date}\n\n会議内容:\n${record.content}`,
          },
        ],
      });

      // レスポンスからJSONを解析
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      // JSONブロック抽出（```json ... ``` や 直接JSON）
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AIレスポンスからJSONを解析できませんでした');
      }
      analysisResult = JSON.parse(jsonMatch[0]) as AnalysisResult;
    } catch (aiError) {
      console.error('[MeetingRecords Analyze] AI解析エラー:', aiError);
      // フォールバック: 空のsummaryで保存し、メイン処理をブロックしない
      analysisResult = {
        summary: '',
        topics: [],
        milestone_feedback: null,
      };
    }

    // 3. 会議録を更新（ai_summary + processed フラグ）
    const { data: updatedRecord, error: updateError } = await supabase
      .from('meeting_records')
      .update({
        ai_summary: analysisResult.summary || null,
        processed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[MeetingRecords Analyze] 更新エラー:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // 4. ビジネスイベント自動登録
    try {
      await supabase.from('business_events').insert({
        user_id: userId,
        project_id: record.project_id,
        event_type: 'meeting',
        title: `会議: ${record.title}`,
        description: analysisResult.summary || record.title,
        event_date: record.meeting_date,
        meeting_record_id: record.id,
        ai_generated: true,
      });
    } catch (eventError) {
      // ビジネスイベント登録失敗してもメイン処理はブロックしない
      console.error('[MeetingRecords Analyze] ビジネスイベント登録エラー:', eventError);
    }

    // 5. V2-G: milestone_feedbackから自動学習抽出
    let learningsInserted = 0;
    if (analysisResult.milestone_feedback && analysisResult.milestone_feedback.length > 0) {
      try {
        learningsInserted = await extractLearningsFromMeetingFeedback(
          record.project_id,
          id,
          analysisResult.milestone_feedback
        );
        if (learningsInserted > 0) {
          console.log(`[MeetingRecords Analyze] ${learningsInserted}件の学習データを抽出しました`);
        }
      } catch (learningError) {
        // 学習抽出失敗してもメイン処理はブロックしない
        console.error('[MeetingRecords Analyze] 学習抽出エラー:', learningError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        record: updatedRecord,
        analysis: analysisResult,
        learnings_inserted: learningsInserted,
      },
    });
  } catch (error) {
    console.error('[MeetingRecords Analyze] エラー:', error);
    return NextResponse.json({ success: false, error: '会議録の解析に失敗しました' }, { status: 500 });
  }
}
