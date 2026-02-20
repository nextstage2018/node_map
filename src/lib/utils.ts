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
 * メッセージのグループキーを生成
 * 同一スレッド/ルーム/チャンネルのメッセージをまとめるためのキー
 */
export function getMessageGroupKey(message: { channel: string; threadId?: string; metadata: { chatworkRoomId?: string; chatworkRoomName?: string; slackChannel?: string; slackChannelName?: string; slackThreadTs?: string; } }): string {
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
    case 'email':
      // Email: threadIdでグループ化。なければ個別
      return message.threadId
        ? `email-thread-${message.threadId}`
        : `email-solo-${Math.random()}`;
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
    case 'email':
      return message.subject || 'メール';
    default:
      return '';
  }
}
