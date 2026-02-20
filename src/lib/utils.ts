// ユーティリティ関数

/**
 * 日時を相対表示にフォーマット（例：「3分前」「昨日」）
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;

  return date.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * テキストを指定文字数で切り詰め
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

/**
 * HTMLタグを除去してプレーンテキストに
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * クラス名を結合（falsy値を除外）
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * メール本文から引用部分と署名を除去し、最新の返信本文のみを抽出
 */
export function cleanEmailBody(body: string): { main: string; hasQuote: boolean } {
  if (!body) return { main: '', hasQuote: false };
  const parsed = parseEmailThread(body);
  if (parsed.length <= 1) {
    return { main: parsed[0]?.body || body.trim(), hasQuote: false };
  }
  return { main: parsed[0].body, hasQuote: true };
}

/**
 * メール署名の開始位置を検出
 * 「ーーー」「---」「__」等の区切り線以降を署名とみなす
 */
function findSignatureStart(lines: string[]): number {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
    const line = lines[i].trim();
    if (/^[ー]{5,}$/.test(line) || /^[-]{5,}$/.test(line) || /^[_]{5,}$/.test(line) || /^[=]{5,}$/.test(line)) {
      if (i > 2) return i;
    }
    if (/^>{2,}.*<{2,}$/.test(line)) return i;
  }
  return -1;
}

/**
 * 署名を除去するヘルパー
 */
function removeSignature(text: string): string {
  const lines = text.split('\n');
  const sigIndex = findSignatureStart(lines);
  if (sigIndex >= 0) {
    return lines.slice(0, sigIndex).join('\n').trim();
  }
  return text.trim();
}

/** 引用ヘッダーのパターン（日本語・英語対応） */
const QUOTE_HEADER_PATTERNS = [
  // "2026年2月19日(木) 15:47 福田遼太郎 <fukuda@next-stage.biz>:"
  /^(\d{4}年\d{1,2}月\d{1,2}日\s*\(.+?\)\s*\d{1,2}:\d{2})\s+(.+?)\s*<([^>]+)>\s*:?\s*$/,
  // "On Feb 19, 2026, at 15:47, Name <email> wrote:"
  /^On\s+(.+?),?\s+(.+?)\s*<([^>]+)>\s*wrote:\s*$/i,
  // "On 2026/02/19 15:47, Name <email> wrote:"
  /^On\s+(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}),?\s+(.+?)\s*<([^>]+)>\s*wrote:\s*$/i,
];

/**
 * 引用ヘッダー行を解析して送信者情報を返す
 */
function parseQuoteHeader(line: string): { dateStr: string; name: string; email: string } | null {
  for (const pattern of QUOTE_HEADER_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return { dateStr: match[1], name: match[2].trim(), email: match[3] };
    }
  }
  return null;
}

/**
 * 引用レベル（行頭の > の数）を数え、引用プレフィックスを除去した本文を返す
 */
function stripQuotePrefix(line: string): { level: number; text: string } {
  let level = 0;
  let rest = line;
  while (rest.startsWith('>')) {
    level++;
    rest = rest.substring(1);
    if (rest.startsWith(' ')) rest = rest.substring(1);
  }
  return { level, text: rest };
}

/** 解析済みメール引用メッセージ */
export interface ParsedEmailMessage {
  sender: string;
  email: string;
  dateStr: string;
  body: string;
}

/**
 * Gmail形式のメール引用チェーンを解析し、個別メッセージの配列に変換
 *
 * Gmail引用形式：
 *   [最新の返信本文]
 *   2026年2月19日(木) 15:47 福田遼太郎 <fukuda@next-stage.biz>:
 *   > [前の返信本文]
 *   > 2026年2月18日(水) 10:30 鈴木次郎 <suzuki@next-stage.biz>:
 *   >> [さらに前の本文]
 *
 * @returns 古い順に並んだメッセージ配列
 */
export function parseEmailThread(body: string): ParsedEmailMessage[] {
  if (!body) return [];

  // --- 前処理: 改行正規化 & 折り返しヘッダーの結合 ---
  let normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Gmailが長いヘッダーを折り返すケースを結合:
  // "2026年2月20日(金) 8:00 名前 <\n email@example.com>:" → 1行に
  // また "On Feb 19, 2026, Name <\n email@example.com> wrote:" も同様
  normalized = normalized.replace(/<\n\s*/g, '<');

  const lines = normalized.split('\n');
  const messages: ParsedEmailMessage[] = [];

  // --- Step 1: 最新の返信（引用なし部分）を抽出 ---
  let firstQuoteHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (parseQuoteHeader(trimmed)) {
      firstQuoteHeaderIdx = i;
      break;
    }
    // > で始まる引用行が3行以上連続したら引用開始とみなす（ヘッダーなし引用）
    if (trimmed.startsWith('>')) {
      let count = 1;
      for (let j = i + 1; j < lines.length && j < i + 5; j++) {
        if (lines[j].trim().startsWith('>')) count++;
      }
      if (count >= 3 && firstQuoteHeaderIdx === -1) {
        firstQuoteHeaderIdx = i;
        break;
      }
    }
  }

  // 引用が全く無い場合はそのまま1メッセージとして返す
  if (firstQuoteHeaderIdx === -1) {
    const cleaned = removeSignature(body);
    if (cleaned) {
      messages.push({ sender: '', email: '', dateStr: '', body: cleaned });
    }
    return messages;
  }

  // 最新の返信本文
  const latestBody = removeSignature(lines.slice(0, firstQuoteHeaderIdx).join('\n'));
  if (latestBody) {
    messages.push({ sender: '', email: '', dateStr: '', body: latestBody });
  }

  // --- Step 2: 引用チェーンを再帰的にパース ---
  const quotedLines = lines.slice(firstQuoteHeaderIdx);
  parseQuotedSection(quotedLines, 0, messages);

  // 古い順に並べ替え（パース順は新しい→古いなので反転）
  messages.reverse();

  return messages;
}

/**
 * 引用セクションを再帰的にパースして個別メッセージを抽出
 */
function parseQuotedSection(
  lines: string[],
  expectedLevel: number,
  messages: ParsedEmailMessage[]
): void {
  let currentSender: { name: string; email: string; dateStr: string } | null = null;
  const bodyLines: string[] = [];
  let deeperQuoteStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 引用プレフィックスを除去
    const stripped = stripQuotePrefix(trimmed);

    // このレベルの引用ヘッダーを検出
    if (stripped.level === expectedLevel) {
      const header = parseQuoteHeader(stripped.text.trim());
      if (header) {
        // 前のメッセージがあれば保存
        if (currentSender) {
          const body = removeSignature(bodyLines.join('\n'));
          if (body) {
            messages.push({
              sender: currentSender.name,
              email: currentSender.email,
              dateStr: currentSender.dateStr,
              body,
            });
          }
          bodyLines.length = 0;
        }
        // より深い引用があれば先に処理
        if (deeperQuoteStart >= 0) {
          parseQuotedSection(lines.slice(deeperQuoteStart, i), expectedLevel + 1, messages);
          deeperQuoteStart = -1;
        }
        currentSender = { name: header.name, email: header.email, dateStr: header.dateStr };
        continue;
      }
    }

    // 本文行かより深い引用か判定
    if (stripped.level === expectedLevel && currentSender) {
      bodyLines.push(stripped.text);
    } else if (stripped.level > expectedLevel) {
      if (deeperQuoteStart === -1) deeperQuoteStart = i;
    } else if (stripped.level === expectedLevel && !currentSender) {
      // ヘッダーが見つかる前の行（スキップ）
    }
  }

  // 残りのメッセージを保存
  if (currentSender) {
    const body = removeSignature(bodyLines.join('\n'));
    if (body) {
      messages.push({
        sender: currentSender.name,
        email: currentSender.email,
        dateStr: currentSender.dateStr,
        body,
      });
    }
  }
  if (deeperQuoteStart >= 0) {
    parseQuotedSection(lines.slice(deeperQuoteStart), expectedLevel + 1, messages);
  }
}

/**
 * Chatwork内部タグを除去してきれいなテキストに整形
 * 対象: [rp aid=...], [To:...], [toall], [info]...[/info], [title]...[/title],
 *        [hr], [code]...[/code], [qt]...[/qt], [qtmeta ...], [piconname:...], [dtext:...]
 */
export function cleanChatworkBody(body: string): string {
  if (!body) return '';

  let cleaned = body;

  // [info][title]タイトル[/title]本文[/info] → 「■タイトル」＋本文
  cleaned = cleaned.replace(
    /\[info\]\[title\]([\s\S]*?)\[\/title\]([\s\S]*?)\[\/info\]/g,
    (_match, title, content) => {
      const t = (title as string).trim();
      const c = (content as string).trim();
      return t ? `■ ${t}\n${c}` : c;
    }
  );

  // [info]...[/info] タイトルなし
  cleaned = cleaned.replace(
    /\[info\]([\s\S]*?)\[\/info\]/g,
    (_match, content) => (content as string).trim()
  );

  // [qt][qtmeta ...]引用[/qt] → 引用表示
  cleaned = cleaned.replace(
    /\[qt\]\[qtmeta[^\]]*\]([\s\S]*?)\[\/qt\]/g,
    (_match, content) => `> ${(content as string).trim()}`
  );

  // [rp aid=... to=...] → 除去
  cleaned = cleaned.replace(/\[rp\s+aid=\d+[^\]]*\]/g, '');

  // [To:12345678]Name → @Name
  cleaned = cleaned.replace(/\[To:\d+\]\s*/g, '@');

  // [toall] → @全員
  cleaned = cleaned.replace(/\[toall\]/g, '@全員 ');

  // [code]...[/code] → コード部分のみ残す
  cleaned = cleaned.replace(/\[code\]([\s\S]*?)\[\/code\]/g, (_match, code) => (code as string).trim());

  // [hr] → 除去
  cleaned = cleaned.replace(/\[hr\]/g, '');

  // [title]...[/title] 単独
  cleaned = cleaned.replace(/\[title\]([\s\S]*?)\[\/title\]/g, (_match, title) => `■ ${(title as string).trim()}`);

  // [piconname:...], [dtext:...], [preview ...] → 除去
  cleaned = cleaned.replace(/\[piconname:[^\]]*\]/g, '');
  cleaned = cleaned.replace(/\[dtext:[^\]]*\]/g, '');
  cleaned = cleaned.replace(/\[preview[^\]]*\]/g, '');

  // 連続する空行を1つにまとめる
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * メール件名を正規化（Re:/Fwd:等を除去して同一スレッド判定に使う）
 */
export function normalizeEmailSubject(subject: string): string {
  if (!subject) return '';
  // Re:, RE:, Fwd:, FW:, Fw: 等を繰り返し除去（日本語の「件名:」にも対応）
  return subject
    .replace(/^(\s*(Re|RE|Fwd|FW|Fw|返信|転送)\s*[:：]\s*)+/g, '')
    .trim()
    .toLowerCase();
}

/**
 * メッセージのグループキーを生成
 * 同一スレッド/ルーム/チャンネルのメッセージをまとめるためのキー
 */
export function getMessageGroupKey(message: { channel: string; subject?: string; threadId?: string; metadata: { chatworkRoomId?: string; chatworkRoomName?: string; slackChannel?: string; slackChannelName?: string; slackThreadTs?: string; } }): string {
  switch (message.channel) {
    case 'chatwork':
      // Chatwork: 同一ルームでグループ化
      return message.metadata.chatworkRoomId
        ? `chatwork-room-${message.metadata.chatworkRoomId}`
        : `chatwork-solo-${Math.random()}`;
    case 'slack':
      // Slack: 同一チャンネルでグループ化（スレッドがあればスレッド単位）
      if (message.metadata.slackThreadTs) {
        return `slack-thread-${message.metadata.slackChannel}-${message.metadata.slackThreadTs}`;
      }
      return message.metadata.slackChannel
        ? `slack-channel-${message.metadata.slackChannel}`
        : `slack-solo-${Math.random()}`;
    case 'email': {
      // Email: threadIdがあればそれを使い、なければ件名で同一スレッド判定
      if (message.threadId) {
        return `email-thread-${message.threadId}`;
      }
      // 件名ベースのグループ化（Re:/Fwd:を除去して正規化）
      const normalized = normalizeEmailSubject(message.subject || '');
      if (normalized) {
        return `email-subject-${normalized}`;
      }
      return `email-solo-${Math.random()}`;
    }
    default:
      return `unknown-${Math.random()}`;
  }
}

/**
 * メッセージグループのラベルを取得
 */
export function getGroupLabel(message: { channel: string; subject?: string; metadata: { chatworkRoomName?: string; slackChannelName?: string; } }): string {
  switch (message.channel) {
    case 'chatwork':
      return message.metadata.chatworkRoomName || 'Chatwork';
    case 'slack':
      return message.metadata.slackChannelName ? `#${message.metadata.slackChannelName}` : 'Slack';
    case 'email': {
      // Re:/Fwd:を除去した件名をグループラベルに使う
      const subject = message.subject || '';
      const cleaned = subject.replace(/^(\s*(Re|RE|Fwd|FW|Fw|返信|転送)\s*[:：]\s*)+/g, '').trim();
      return cleaned || 'メール';
    }
    default:
      return '';
  }
}
