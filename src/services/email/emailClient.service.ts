import { UnifiedMessage } from '@/lib/types';

/**
 * メール連携サービス
 * IMAP/SMTPを使用してメールの取得・送信を行う
 */

interface EmailConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  password: string;
}

function getConfig(): EmailConfig {
  return {
    imapHost: process.env.EMAIL_HOST || 'imap.gmail.com',
    imapPort: Number(process.env.EMAIL_PORT) || 993,
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
  };
}

/**
 * 生メールソースから本文を抽出する
 * MIME構造を解析してテキスト部分のみを取り出す
 */
function parseEmailBody(rawSource: string): string {
  if (!rawSource) return '';

  // ヘッダーと本文を分離（最初の空行で区切る）
  const headerBodySplit = rawSource.indexOf('\r\n\r\n');
  if (headerBodySplit === -1) {
    // \n\nで試す
    const altSplit = rawSource.indexOf('\n\n');
    if (altSplit === -1) return rawSource.substring(0, 500);
    return decodeEmailContent(rawSource.substring(altSplit + 2), rawSource.substring(0, altSplit));
  }

  const headers = rawSource.substring(0, headerBodySplit);
  const body = rawSource.substring(headerBodySplit + 4);

  return decodeEmailContent(body, headers);
}

/**
 * メール本文をデコードする
 */
function decodeEmailContent(body: string, headers: string): string {
  // Content-Typeヘッダーを解析
  const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n;]+)/i);
  const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : 'text/plain';

  // Transfer-Encodingを取得
  const encodingMatch = headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
  const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : '7bit';

  // multipart の場合
  if (contentType.startsWith('multipart/')) {
    const boundaryMatch = headers.match(/boundary="?([^"\r\n;]+)"?/i);
    if (boundaryMatch) {
      return extractFromMultipart(body, boundaryMatch[1]);
    }
  }

  // base64 デコード
  if (encoding === 'base64') {
    try {
      const cleaned = body.replace(/[\r\n\s]/g, '');
      const decoded = Buffer.from(cleaned, 'base64').toString('utf-8');
      if (contentType === 'text/html') {
        return stripHtmlTags(decoded);
      }
      return decoded;
    } catch {
      return '[デコードできませんでした]';
    }
  }

  // quoted-printable デコード
  if (encoding === 'quoted-printable') {
    const decoded = decodeQuotedPrintable(body);
    if (contentType === 'text/html') {
      return stripHtmlTags(decoded);
    }
    return decoded;
  }

  // text/html の場合、HTMLタグを除去
  if (contentType === 'text/html') {
    return stripHtmlTags(body);
  }

  // text/plain はそのまま
  return body.trim();
}

/**
 * multipartメールからテキスト部分を抽出
 */
function extractFromMultipart(body: string, boundary: string): string {
  const parts = body.split(`--${boundary}`);

  let textPlainContent = '';
  let textHtmlContent = '';

  for (const part of parts) {
    if (part.trim() === '--' || part.trim() === '') continue;

    // パートのヘッダーと本文を分離
    const partSplit = part.indexOf('\r\n\r\n');
    const altPartSplit = part.indexOf('\n\n');
    const splitPos = partSplit !== -1 ? partSplit : altPartSplit;
    const splitLen = partSplit !== -1 ? 4 : 2;

    if (splitPos === -1) continue;

    const partHeaders = part.substring(0, splitPos);
    const partBody = part.substring(splitPos + splitLen);

    const partContentType = partHeaders.match(/Content-Type:\s*([^\r\n;]+)/i);
    const partType = partContentType ? partContentType[1].trim().toLowerCase() : '';

    // ネストされたmultipartの場合
    if (partType.startsWith('multipart/')) {
      const nestedBoundary = partHeaders.match(/boundary="?([^"\r\n;]+)"?/i);
      if (nestedBoundary) {
        const nested = extractFromMultipart(partBody, nestedBoundary[1]);
        if (nested) return nested;
      }
      continue;
    }

    if (partType === 'text/plain') {
      textPlainContent = decodeEmailContent(partBody, partHeaders);
    } else if (partType === 'text/html') {
      textHtmlContent = decodeEmailContent(partBody, partHeaders);
    }
  }

  // text/plainを優先、なければHTMLから抽出
  return textPlainContent || textHtmlContent || '[本文を取得できませんでした]';
}

/**
 * Quoted-Printableデコード（UTF-8対応）
 */
function decodeQuotedPrintable(input: string): string {
  // soft line breaksを除去
  const cleaned = input.replace(/=\r?\n/g, '');

  // =XX をバイト値に変換し、UTF-8としてデコード
  const bytes: number[] = [];
  let i = 0;
  while (i < cleaned.length) {
    if (cleaned[i] === '=' && i + 2 < cleaned.length) {
      const hex = cleaned.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    // 通常のASCII文字
    bytes.push(cleaned.charCodeAt(i));
    i++;
  }

  // Uint8ArrayからUTF-8文字列にデコード
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    // フォールバック: 元の方法で試す
    return cleaned.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }
}

/**
 * HTMLタグを除去してプレーンテキストにする
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // style要素を除去
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // script要素を除去
    .replace(/<br\s*\/?>/gi, '\n') // br→改行
    .replace(/<\/p>/gi, '\n\n') // p閉じ→改行
    .replace(/<\/div>/gi, '\n') // div閉じ→改行
    .replace(/<\/tr>/gi, '\n') // tr閉じ→改行
    .replace(/<\/li>/gi, '\n') // li閉じ→改行
    .replace(/<[^>]+>/g, '') // 残りのタグを除去
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n') // 連続改行を整理
    .trim();
}

/**
 * メール受信メッセージを取得し、UnifiedMessage形式に変換
 * @param limit 取得件数
 * @param page ページ番号（1始まり）。古いメールを取得するために使用
 */
export async function fetchEmails(limit: number = 50, page: number = 1): Promise<UnifiedMessage[]> {
  const config = getConfig();

  // APIキー未設定時はデモデータを返す
  if (!config.user || !config.password) {
    return getDemoEmails();
  }

  try {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: true,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    const messages: UnifiedMessage[] = [];

    try {
      const mailbox = client.mailbox;
      const exists = mailbox ? (mailbox as { exists: number }).exists : 0;

      // ページネーション対応: page=1は最新、page=2はその前...
      const endSeq = Math.max(1, exists - (page - 1) * limit);
      const startSeq = Math.max(1, endSeq - limit + 1);

      if (endSeq < 1) {
        // これ以上古いメールがない
        return [];
      }

      const fetchRange = `${startSeq}:${endSeq}`;

      for await (const message of client.fetch(fetchRange, {
        envelope: true,
        source: true,
      })) {
        const envelope = message.envelope!;

        // 生ソースから本文を抽出・パース
        const rawSource = message.source?.toString() || '';
        const parsedBody = parseEmailBody(rawSource);

        messages.push({
          id: `email-${envelope.messageId || message.uid}`,
          channel: 'email',
          channelIcon: '📧',
          from: {
            name: envelope.from?.[0]?.name || envelope.from?.[0]?.address || '不明',
            address: envelope.from?.[0]?.address || '',
          },
          to: envelope.to?.map((t: { name?: string; address?: string }) => ({
            name: t.name || t.address || '',
            address: t.address || '',
          })),
          subject: envelope.subject || '(件名なし)',
          body: parsedBody,
          timestamp: envelope.date?.toISOString() || new Date().toISOString(),
          isRead: false,
          status: 'unread' as const,
          threadId: envelope.inReplyTo || undefined,
          metadata: {
            messageId: envelope.messageId || undefined,
          },
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return messages.reverse(); // 新しい順
  } catch (error) {
    console.error('メール取得エラー:', error);
    return getDemoEmails();
  }
}

/**
 * メールを送信（返信）
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string
): Promise<boolean> {
  const config = getConfig();

  if (!config.user || !config.password) {
    console.log('[デモモード] メール送信:', { to, subject, body });
    return true;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: false,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });

    await transporter.sendMail({
      from: config.user,
      to,
      subject,
      text: body,
      inReplyTo: inReplyTo || undefined,
    });

    return true;
  } catch (error) {
    console.error('メール送信エラー:', error);
    return false;
  }
}

/**
 * デモ用メールデータ
 */
function getDemoEmails(): UnifiedMessage[] {
  const now = new Date();
  return [
    {
      id: 'email-demo-1',
      channel: 'email',
      channelIcon: '📧',
      from: { name: '田中太郎', address: 'tanaka@example.com' },
      to: [{ name: 'あなた', address: 'you@example.com' }],
      subject: '来週の打ち合わせについて',
      body: 'お疲れ様です。来週火曜日の打ち合わせですが、14時からに変更可能でしょうか？会議室Aを押さえております。ご確認よろしくお願いいたします。',
      timestamp: new Date(now.getTime() - 30 * 60000).toISOString(),
      isRead: false,
      status: 'unread' as const,
      metadata: { messageId: 'demo-msg-1@example.com' },
      threadMessages: [
        {
          id: 'email-thread-1a',
          from: { name: 'あなた', address: 'you@example.com' },
          body: '田中さん\nお疲れ様です。来週の打ち合わせの件、了解しました。\n火曜日であれば午前中が都合が良いです。',
          timestamp: new Date(now.getTime() - 2 * 86400000).toISOString(),
          isOwn: true,
        },
        {
          id: 'email-thread-1b',
          from: { name: '田中太郎', address: 'tanaka@example.com' },
          body: 'ありがとうございます。\nでは火曜日の10時ではいかがでしょうか？\n会議室を押さえておきます。',
          timestamp: new Date(now.getTime() - 1.5 * 86400000).toISOString(),
          isOwn: false,
        },
        {
          id: 'email-thread-1c',
          from: { name: 'あなた', address: 'you@example.com' },
          body: '10時で問題ありません。よろしくお願いします。',
          timestamp: new Date(now.getTime() - 86400000).toISOString(),
          isOwn: true,
        },
      ],
    },
    {
      id: 'email-demo-2',
      channel: 'email',
      channelIcon: '📧',
      from: { name: '佐藤花子', address: 'sato@example.com' },
      to: [{ name: 'あなた', address: 'you@example.com' }],
      subject: 'Re: プロジェクトA 進捗報告',
      body: 'お疲れ様です。プロジェクトAの進捗ですが、予定通り今週末までにデザインが完成します。来週からコーディングに入る予定です。添付の資料もご確認ください。',
      timestamp: new Date(now.getTime() - 2 * 3600000).toISOString(),
      isRead: true,
      status: 'replied' as const,
      metadata: { messageId: 'demo-msg-2@example.com' },
      threadMessages: [
        {
          id: 'email-thread-2a',
          from: { name: 'あなた', address: 'you@example.com' },
          body: '佐藤さん\nプロジェクトAの進捗報告をお願いできますでしょうか。\n今週末の状況を共有いただけると助かります。',
          timestamp: new Date(now.getTime() - 3 * 86400000).toISOString(),
          isOwn: true,
        },
      ],
    },
    {
      id: 'email-demo-3',
      channel: 'email',
      channelIcon: '📧',
      from: { name: '鈴木一郎', address: 'suzuki@client.co.jp' },
      to: [{ name: 'あなた', address: 'you@example.com' }],
      subject: '見積書のご確認のお願い',
      body: '平素よりお世話になっております。先日お送りいただいた見積書について、2点確認事項がございます。お手すきの際にご連絡いただけますと幸いです。',
      timestamp: new Date(now.getTime() - 5 * 3600000).toISOString(),
      isRead: false,
      status: 'unread' as const,
      metadata: { messageId: 'demo-msg-3@client.co.jp' },
    },
  ];
}
