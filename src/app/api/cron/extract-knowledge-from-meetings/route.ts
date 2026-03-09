// Cron: 会議録からナレッジ（キーワード）を抽出し、knowledge_master_entries に登録
// スケジュール: 毎日 02:00 UTC
// 対象: 過去24hに作成された会議録で、まだナレッジ抽出されていないもの
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    // Cron認証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase未設定' }, { status: 400 });
    }

    const stats = {
      meetingsProcessed: 0,
      keywordsExtracted: 0,
      keywordsLinked: 0,
      errors: 0,
    };

    // 1. 過去24hに作成/更新された会議録を取得（processed=trueでAI解析済みのもの）
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: meetings, error: fetchError } = await supabase
      .from('meeting_records')
      .select('id, title, content, project_id, user_id, ai_summary')
      .eq('processed', true)
      .gte('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('[ExtractKnowledgeFromMeetings] 会議録取得エラー:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!meetings || meetings.length === 0) {
      return NextResponse.json({ success: true, stats, message: '対象会議録なし' });
    }

    // 2. 各会議録に対してナレッジ抽出
    for (const meeting of meetings) {
      try {
        // 会議録の内容 + AI要約を結合して抽出対象とする
        const text = [meeting.content, meeting.ai_summary].filter(Boolean).join('\n\n');
        if (!text || text.trim().length < 20) continue;

        // 既にこの会議録からナレッジが抽出済みか簡易チェック
        // source_meeting_record_id で確認
        let alreadyExtracted = false;
        try {
          const { data: existing } = await supabase
            .from('knowledge_master_entries')
            .select('id')
            .eq('source_meeting_record_id', meeting.id)
            .limit(1);
          if (existing && existing.length > 0) {
            alreadyExtracted = true;
          }
        } catch {
          // 新カラムが未適用の場合は無視してそのまま続行
        }

        if (alreadyExtracted) continue;

        stats.meetingsProcessed++;

        const result = await ThoughtNodeService.extractAndLinkFromText({
          text,
          userId: meeting.user_id || '',
          sourceType: 'meeting_record',
          sourceId: meeting.id,
          projectId: meeting.project_id,
        });

        stats.keywordsExtracted += result.extractedCount;
        stats.keywordsLinked += result.linkedCount;
      } catch (meetingErr) {
        console.error(`[ExtractKnowledgeFromMeetings] 会議録 ${meeting.id} 処理エラー:`, meetingErr);
        stats.errors++;
      }
    }

    console.log(`[ExtractKnowledgeFromMeetings] 完了:`, stats);
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[ExtractKnowledgeFromMeetings] エラー:', error);
    return NextResponse.json({ error: '会議録ナレッジ抽出に失敗しました' }, { status: 500 });
  }
}
