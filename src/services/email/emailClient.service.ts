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
 * メール受信メッセージを取得し、UnifiedMessage形式に変換
 */
export async function fetchEmails(limit: number = 50): Promise<UnifiedMessage[]> {
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
      const fetchRange = `${Math.max(1, exists - limit + 1)}:*`;
      for await (const message of client.fetch(fetchRange, {
        envelope: true,
        source: true,
      })) {
        const envelope = message.envelope!;
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
          body: message.source?.toString() || '',
          timestamp: envelope.date?.toISOString() || new Date().toISOString(),
          isRead: false,
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
      metadata: { messageId: 'demo-msg-1@example.com' },
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
      metadata: { messageId: 'demo-msg-2@example.com' },
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
      metadata: { messageId: 'demo-msg-3@client.co.jp' },
    },
  ];
}
