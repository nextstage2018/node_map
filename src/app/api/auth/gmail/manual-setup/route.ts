// Gmail OAuth 手動セットアップページ
// OAuth Playgroundを使ってrefresh_tokenを取得し、DBに保存するガイド付きHTML。
// GET /api/auth/gmail/manual-setup?secret=CRON_SECRET
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function getAppUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  // 認証
  const cronSecret = process.env.CRON_SECRET;
  const urlSecret = request.nextUrl.searchParams.get('secret');
  if (cronSecret && urlSecret !== cronSecret) {
    return new Response('Unauthorized. Add ?secret=CRON_SECRET', { status: 401 });
  }

  const appUrl = getAppUrl(request);
  const clientId = process.env.GMAIL_CLIENT_ID || '';
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || '';

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gmail OAuth 手動セットアップ</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; color: #1e293b; line-height: 1.6; padding: 2rem; }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #0f172a; }
    .card { background: white; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { font-size: 1.1rem; margin-bottom: 1rem; color: #1e40af; }
    .step { margin-bottom: 1rem; padding-left: 1.5rem; position: relative; }
    .step::before { content: attr(data-num); position: absolute; left: 0; font-weight: 700; color: #2563eb; }
    .step p { margin-bottom: 0.5rem; }
    .code-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; font-family: 'SF Mono', Monaco, monospace; font-size: 0.85rem; word-break: break-all; margin: 0.5rem 0; user-select: all; }
    .code-inline { background: #f1f5f9; padding: 0.15rem 0.4rem; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .highlight { background: #fef3c7; padding: 0.75rem; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 0.75rem 0; font-size: 0.9rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; }
    input[type="text"], textarea { width: 100%; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.95rem; font-family: monospace; }
    textarea { height: 80px; resize: vertical; }
    button { background: #2563eb; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 0.75rem; }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #94a3b8; cursor: not-allowed; }
    .result { margin-top: 1rem; padding: 1rem; border-radius: 8px; display: none; }
    .result.success { display: block; background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
    .result.error { display: block; background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
    .scopes { font-size: 0.8rem; color: #64748b; }
    a { color: #2563eb; }
    .copy-btn { background: #e2e8f0; color: #475569; padding: 0.3rem 0.7rem; font-size: 0.8rem; border-radius: 6px; margin-left: 0.5rem; cursor: pointer; border: none; }
    .copy-btn:hover { background: #cbd5e1; }
    img { max-width: 100%; border-radius: 8px; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Gmail OAuth 手動セットアップ</h1>
    <p style="margin-bottom:1.5rem; color:#64748b;">
      ネットワーク環境の影響で通常のOAuth認証フローが使えない場合、<br>
      Google OAuth Playground で手動でリフレッシュトークンを取得してDBに保存します。
    </p>

    <!-- Step 1 -->
    <div class="card">
      <h2>Step 1: OAuth Playground を開く</h2>
      <div class="step" data-num="①">
        <p>下のリンクをクリックして Google OAuth 2.0 Playground を開いてください：</p>
        <p><a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener">
          https://developers.google.com/oauthplayground
        </a></p>
      </div>
    </div>

    <!-- Step 2 -->
    <div class="card">
      <h2>Step 2: 独自の OAuth 認証情報を設定</h2>
      <div class="step" data-num="②">
        <p>画面<strong>右上の歯車アイコン ⚙️</strong> をクリックします。</p>
      </div>
      <div class="step" data-num="③">
        <p><strong>「Use your own OAuth credentials」</strong> にチェックを入れます。</p>
      </div>
      <div class="step" data-num="④">
        <p><strong>OAuth Client ID</strong> に以下をコピーして貼り付け：</p>
        <div class="code-block" id="clientId">${clientId}</div>
        <button class="copy-btn" onclick="copyText('clientId')">コピー</button>
      </div>
      <div class="step" data-num="⑤">
        <p><strong>OAuth Client secret</strong> に以下をコピーして貼り付け：</p>
        <div class="code-block" id="clientSecret">${clientSecret}</div>
        <button class="copy-btn" onclick="copyText('clientSecret')">コピー</button>
      </div>
      <div class="highlight">
        ⚠️ 必ず「Use your own OAuth credentials」にチェックを入れてから ID と Secret を入力してください。
        チェックを入れないと入力欄が表示されません。
      </div>
    </div>

    <!-- Step 3 -->
    <div class="card">
      <h2>Step 3: スコープを選択して認証</h2>
      <div class="step" data-num="⑥">
        <p>左側の <strong>「Step 1: Select & authorize APIs」</strong> セクションで、<br>
        下の入力欄（<strong>Input your own scopes</strong>）に以下を<strong>1行ずつ</strong>入力して「Add」ボタンで追加してください：</p>
        <div class="code-block" id="scopes">https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/drive.file</div>
        <button class="copy-btn" onclick="copyText('scopes')">全スコープをコピー</button>
        <p class="scopes" style="margin-top:0.5rem;">
          ※ リストから選ぶ場合: Gmail API v1 → readonly, send, modify を選択、<br>
          Calendar API v3 → calendar.readonly, calendar.events を選択、<br>
          Drive API v3 → drive.file を選択
        </p>
      </div>
      <div class="step" data-num="⑦">
        <p><strong>「Authorize APIs」</strong> ボタンをクリック → Googleアカウントでログインして許可します。</p>
        <p style="color:#dc2626; font-size:0.9rem;">
          「このアプリは確認されていません」と表示されたら → 「詳細」→「（安全でない）に移動」で進んでください。
        </p>
      </div>
    </div>

    <!-- Step 4 -->
    <div class="card">
      <h2>Step 4: トークンを交換</h2>
      <div class="step" data-num="⑧">
        <p>認証後、<strong>「Step 2: Exchange authorization code for tokens」</strong> セクションが表示されます。</p>
        <p><strong>「Exchange authorization code for tokens」</strong> ボタンをクリックします。</p>
      </div>
      <div class="step" data-num="⑨">
        <p>右側のレスポンスに <code class="code-inline">refresh_token</code> が表示されます。<br>
        この値を<strong>まるごとコピー</strong>してください（ダブルクオート内の文字列）。</p>
      </div>
      <div class="highlight">
        💡 <code class="code-inline">refresh_token</code> は <code class="code-inline">1//...</code> で始まる長い文字列です。
        <code class="code-inline">access_token</code> ではなく <code class="code-inline">refresh_token</code> をコピーしてください。
      </div>
    </div>

    <!-- Step 5 -->
    <div class="card">
      <h2>Step 5: リフレッシュトークンを保存</h2>
      <div class="step" data-num="⑩">
        <p>コピーした <code class="code-inline">refresh_token</code> を下に貼り付けて「保存」ボタンを押してください。</p>
      </div>
      <form id="tokenForm" onsubmit="saveToken(event)">
        <label for="refreshToken">Refresh Token</label>
        <textarea id="refreshToken" placeholder="1//0eXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..." required></textarea>
        <button type="submit" id="submitBtn">トークンを保存</button>
      </form>
      <div id="result" class="result"></div>
    </div>
  </div>

  <script>
    function copyText(elementId) {
      const el = document.getElementById(elementId);
      const text = el.textContent || el.innerText;
      navigator.clipboard.writeText(text.trim()).then(() => {
        const btn = el.nextElementSibling;
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = 'コピーしました！';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      });
    }

    async function saveToken(e) {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const resultEl = document.getElementById('result');
      const refreshToken = document.getElementById('refreshToken').value.trim();

      if (!refreshToken) {
        resultEl.className = 'result error';
        resultEl.textContent = 'refresh_tokenを入力してください。';
        return;
      }

      btn.disabled = true;
      btn.textContent = '保存中...';
      resultEl.className = 'result';
      resultEl.style.display = 'none';

      try {
        const res = await fetch('${appUrl}/api/auth/gmail/manual-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: refreshToken,
            secret: '${cronSecret || ''}',
          }),
        });

        const data = await res.json();

        if (data.success) {
          resultEl.className = 'result success';
          resultEl.innerHTML = '<strong>✅ ' + data.message + '</strong>'
            + (data.email ? '<br>メール: ' + data.email : '')
            + '<br>Calendar API: ' + (data.calendarOk ? '✅ 正常' : '❌ 失敗')
            + '<br><br><a href="${appUrl}/settings">設定画面に戻る →</a>';
        } else {
          resultEl.className = 'result error';
          resultEl.innerHTML = '<strong>❌ エラー: ' + data.error + '</strong>'
            + (data.detail ? '<br><pre style="font-size:0.8rem;white-space:pre-wrap;margin-top:0.5rem">' + data.detail + '</pre>' : '');
        }
      } catch (err) {
        resultEl.className = 'result error';
        resultEl.textContent = '通信エラー: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'トークンを保存';
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
