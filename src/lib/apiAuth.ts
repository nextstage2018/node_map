/**
 * Phase 22.5: API認証エラーハンドリングヘルパー
 * APIルートのcatchブロックでAuthenticationErrorを401として返す
 */

import { NextResponse } from 'next/server';
import { AuthenticationError } from './serverAuth';

/**
 * APIルートのcatchブロックで使用するエラーハンドラー
 * AuthenticationError の場合は 401、それ以外は 500 を返す
 *
 * 使い方:
 *   catch (error) {
 *     return handleApiError(error, 'データ取得に失敗しました');
 *   }
 */
export function handleApiError(error: unknown, defaultMessage: string): NextResponse {
  console.error(defaultMessage, error);

  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { success: false, error: defaultMessage },
    { status: 500 }
  );
}
