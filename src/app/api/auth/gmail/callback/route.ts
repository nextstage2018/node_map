// Phase 24: Gmail OAuth 2.0 コールバック（クライアントサイド中継方式）
// Vercelエッジネットワークがrequest.urlのクエリパラメータを難読化する問題に対応。
// HTMLページを返し、ブラウザ側のwindow.location.searchからcodeを取得して
// /api/auth/gmail/exchange に送信する。
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// リクエストURLからアプリのベースURLを取得
function getAppUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(request);

  // サーバー側でのURL解析を完全にスキップ。
  // 代わりにHTMLページを返し、ブラウザのJavaScriptでURLパラメータを読み取る。
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google認証処理中...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e2e8f0; border-top: 3px solid #2563eb; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { color: #dc2626; margin-top: 1rem; }
    .debug { font-size: 0.75rem; color: #94a3b8; margin-top: 1rem; text-align: left; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" id="spinner"></div>
    <p id="status">Google認証を処理しています...</p>
    <div id="error" class="error" style="display:none"></div>
    <div id="debug" class="debug" style="display:none"></div>
  </div>
  <script>
    (async function() {
      const statusEl = document.getElementById('status');
      const errorEl = document.getElementById('error');
      const debugEl = document.getElementById('debug');
      const spinnerEl = document.getElementById('spinner');

      try {
        // ブラウザ側でURLパラメータを読み取る（サーバー側の難読化問題を回避）
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');

        // デバッグ情報
        debugEl.style.display = 'block';
        debugEl.textContent = 'code prefix: ' + (code ? code.substring(0, 8) + '...' : '(null)')
          + ' | state: ' + (state ? state.substring(0, 12) + '...' : '(null)')
          + ' | error: ' + (error || 'none');

        if (error) {
          throw new Error('Google認証が拒否されました: ' + error);
        }
        if (!code) {
          throw new Error('認証コードが見つかりません');
        }

        statusEl.textContent = 'トークンを取得しています...';

        // サーバーAPIにコードを送信してトークン交換
        const res = await fetch('${appUrl}/api/auth/gmail/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        const result = await res.json();

        if (result.success) {
          statusEl.textContent = '認証成功！リダイレクトしています...';
          spinnerEl.style.display = 'none';
          window.location.href = '${appUrl}/settings?auth=success&service=Gmail';
        } else {
          throw new Error(result.error || 'トークン取得に失敗しました');
        }
      } catch (err) {
        spinnerEl.style.display = 'none';
        statusEl.textContent = '認証に失敗しました';
        errorEl.style.display = 'block';
        errorEl.textContent = err.message;
        // 5秒後に設定画面に戻る
        setTimeout(() => {
          window.location.href = '${appUrl}/settings?error=gmail_callback_failed';
        }, 5000);
      }
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
