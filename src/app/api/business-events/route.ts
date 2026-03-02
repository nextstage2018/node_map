// Phase 30d+: ビジネスイベント API（GET / POST）— contact_id 自動検出対応
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured, getServerSupabase } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// ビジネスイベント一覧取得（コンタクト名を含む）
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = getServerSupabase() || createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const eventType = searchParams.get('event_type');

    let query = supabase
      .from('business_events')
      .select('*, contact_persons(id, name, company_name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[BusinessEvents API] 取得エラー:', error);
      // JOINエラー時はフォールバック（contact_personsが外部キーでない場合）
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('business_events')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fallbackError) {
        return NextResponse.json(
          { success: false, error: fallbackError.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, data: fallbackData || [] });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[BusinessEvents API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネスイベントの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// アドレスからコンタクトIDを自動検出
async function detectContactId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fromAddress?: string,
  fromName?: string
): Promise<string | null> {
  if (!fromAddress && !fromName) return null;

  // (1) contact_channels のアドレスで検索
  if (fromAddress) {
    const { data: channelData } = await supabase
      .from('contact_channels')
      .select('contact_id')
      .eq('address', fromAddress)
      .limit(1);
    if (channelData && channelData.length > 0) {
      return channelData[0].contact_id;
    }
  }

  // (2) contact_persons の名前で検索（完全一致）
  if (fromName) {
    const { data: contactData } = await supabase
      .from('contact_persons')
      .select('id')
      .eq('name', fromName)
      .limit(1);
    if (contactData && contactData.length > 0) {
      return contactData[0].id;
    }
  }

  return null;
}

// ビジネスイベント作成（contact_id 自動検出対応）
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = getServerSupabase() || createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, content, eventType, projectId, groupId, contactId, fromAddress, fromName } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
        { status: 400 }
      );
    }

    // contact_id が明示的に渡されていない場合、fromAddress/fromName から自動検出
    let resolvedContactId = contactId || null;
    if (!resolvedContactId && (fromAddress || fromName)) {
      try {
        resolvedContactId = await detectContactId(supabase, fromAddress, fromName);
      } catch (detectError) {
        console.error('[BusinessEvents API] コンタクト自動検出エラー:', detectError);
      }
    }

    const { data, error } = await supabase
      .from('business_events')
      .insert({
        title: title.trim(),
        content: content?.trim() || null,
        event_type: eventType || 'note',
        project_id: projectId || null,
        group_id: groupId || null,
        contact_id: resolvedContactId,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[BusinessEvents API] 作成エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[BusinessEvents API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネスイベントの作成に失敗しました' },
      { status: 500 }
    );
  }
}
