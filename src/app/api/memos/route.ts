// アイデアメモ CRUD API
// Phase Restructure: どこにも依存しない断片的なメモ

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

function mapMemoFromDb(row: Record<string, unknown>) {
  return {
    id: row.id,
    content: row.content,
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET: メモ一覧取得
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = getServerSupabase() || getSupabase();
    const { data, error } = await sb
      .from('idea_memos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('メモ一覧取得エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: (data || []).map(mapMemoFromDb) });
  } catch (error) {
    console.error('メモ一覧取得エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: メモ作成
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, tags } = body;

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const insertData: Record<string, unknown> = {
      user_id: userId,
      content,
    };
    if (tags && tags.length > 0) insertData.tags = tags;

    const { data, error } = await sb
      .from('idea_memos')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('メモ作成エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: mapMemoFromDb(data) });
  } catch (error) {
    console.error('メモ作成エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: メモ更新
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, content, tags } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (content !== undefined) updateData.content = content;
    if (tags !== undefined) updateData.tags = tags;

    const { data, error } = await sb
      .from('idea_memos')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('メモ更新エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: mapMemoFromDb(data) });
  } catch (error) {
    console.error('メモ更新エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: メモ削除
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const { error } = await sb
      .from('idea_memos')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('メモ削除エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('メモ削除エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
