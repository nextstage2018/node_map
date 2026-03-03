// Phase 51a: コンタクトに関連するタスク取得API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: contactId } = await params;
    const sb = getServerSupabase() || getSupabase();

    // 1. コンタクトのアドレス一覧を取得
    const { data: channels } = await sb
      .from('contact_channels')
      .select('address')
      .eq('contact_id', contactId);

    if (!channels || channels.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const addresses = channels.map(c => c.address).filter(Boolean);
    if (addresses.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 2. コンタクトのアドレスから送られたメッセージIDを取得
    const { data: messages } = await sb
      .from('inbox_messages')
      .select('id')
      .in('from_address', addresses)
      .limit(100);

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const messageIds = messages.map(m => m.id);

    // 3. source_message_idでタスクを検索（直接 or 種経由）
    // 3a. 直接タスクにリンクされたもの
    const { data: directTasks } = await sb
      .from('tasks')
      .select('id, title, status, priority, created_at')
      .eq('user_id', userId)
      .in('source_message_id', messageIds)
      .order('created_at', { ascending: false })
      .limit(10);

    // 3b. 種経由でタスクになったもの
    const { data: seeds } = await sb
      .from('seeds')
      .select('id')
      .in('source_message_id', messageIds)
      .limit(50);

    let seedTasks: any[] = [];
    if (seeds && seeds.length > 0) {
      const seedIds = seeds.map(s => s.id);
      const { data } = await sb
        .from('tasks')
        .select('id, title, status, priority, created_at')
        .eq('user_id', userId)
        .in('seed_id', seedIds)
        .order('created_at', { ascending: false })
        .limit(10);
      seedTasks = data || [];
    }

    // 4. 重複排除して結合
    const taskMap = new Map();
    [...(directTasks || []), ...seedTasks].forEach(t => {
      if (!taskMap.has(t.id)) taskMap.set(t.id, t);
    });

    const tasks = Array.from(taskMap.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error('[Contact Tasks] エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
