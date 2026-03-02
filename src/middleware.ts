import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 全APIルートを動的レンダリングに強制する
// Next.js 14のビルド時静的レンダリングを防止
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
