import { NextResponse } from 'next/server';

// インメモリプロフィール
let profile = {
  displayName: 'テストユーザー',
  email: 'test@example.com',
  timezone: 'Asia/Tokyo',
  language: 'ja',
};

// PUT: プロフィール更新
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    profile = { ...profile, ...body };
    return NextResponse.json({ success: true, data: profile });
  } catch {
    return NextResponse.json(
      { success: false, error: 'プロフィールの保存に失敗しました' },
      { status: 500 }
    );
  }
}
