// Phase 26: AI スパム/メルマガ自動判定API
// メッセージ取得時にバックグラウンドで呼び出し、怪しいメールにフラグを立てる
import { NextResponse, NextRequest } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// スパム/メルマガ判定のルールベースロジック（AI呼び出し前のプレフィルタ）
function ruleBasedSpamCheck(msg: {
  from_address: string;
  from_name: string;
  subject: string;
  body: string;
}): { isSpam: boolean; reason: string; confidence: number } {
  const addr = (msg.from_address || '').toLowerCase();
  const name = (msg.from_name || '').toLowerCase();
  const subject = (msg.subject || '').toLowerCase();
  const body = (msg.body || '').toLowerCase();

  // 1. no-reply / noreply 送信者
  if (addr.includes('noreply') || addr.includes('no-reply') || addr.includes('do-not-reply')) {
    return { isSpam: true, reason: '自動送信アドレス（noreply）', confidence: 0.85 };
  }

  // 2. メルマガ系キーワード（Subject）
  const newsletterKeywords = [
    'ニュースレター', 'newsletter', 'メルマガ', 'メールマガジン',
    '配信停止', 'unsubscribe', '購読解除', 'お知らせメール',
    '定期配信', 'weekly digest', 'daily digest',
  ];
  for (const kw of newsletterKeywords) {
    if (subject.includes(kw) || body.slice(0, 500).includes(kw)) {
      return { isSpam: true, reason: `メルマガキーワード検出: "${kw}"`, confidence: 0.8 };
    }
  }

  // 3. 配信停止リンクの存在
  const unsubPatterns = [
    'unsubscribe', '配信停止', '配信解除', 'opt-out', 'optout',
    'メール配信を停止', '購読を解除',
  ];
  for (const pat of unsubPatterns) {
    if (body.includes(pat)) {
      return { isSpam: true, reason: '配信停止リンクを検出', confidence: 0.75 };
    }
  }

  // 4. 大量送信サービスのドメイン
  const bulkDomains = [
    'sendgrid.net', 'mailchimp.com', 'constantcontact.com',
    'hubspot.com', 'marketing.', 'promo.', 'info@', 'news@',
    'campaign.', 'mail.', 'bulk.', 'auto.',
  ];
  for (const domain of bulkDomains) {
    if (addr.includes(domain)) {
      return { isSpam: true, reason: `一括送信サービスのドメイン: ${domain}`, confidence: 0.7 };
    }
  }

  // 5. 広告/プロモーション系
  const promoKeywords = [
    'セール', 'sale', 'キャンペーン', 'campaign', 'クーポン', 'coupon',
    '期間限定', '今だけ', '特別価格', 'limited time', '割引',
    'discount', '無料', 'free trial',
  ];
  let promoCount = 0;
  for (const kw of promoKeywords) {
    if (subject.includes(kw) || body.slice(0, 300).includes(kw)) promoCount++;
  }
  if (promoCount >= 2) {
    return { isSpam: true, reason: `プロモーション系キーワード(${promoCount}個)`, confidence: 0.7 };
  }

  return { isSpam: false, reason: '', confidence: 0 };
}

// ========================================
// POST: 複数メッセージをバッチでスパム判定
// ========================================
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ success: false, error: 'messages配列が必要です' }, { status: 400 });
    }

    // ルールベースでスパム判定
    const results: Record<string, { isSpam: boolean; reason: string; confidence: number }> = {};
    for (const msg of messages) {
      // メールのみ判定対象（Slack/Chatworkはスパムが少ない）
      if (msg.channel !== 'email') continue;

      const check = ruleBasedSpamCheck({
        from_address: msg.from_address || msg.from?.address || '',
        from_name: msg.from_name || msg.from?.name || '',
        subject: msg.subject || '',
        body: msg.body || '',
      });

      if (check.isSpam) {
        results[msg.id] = check;
      }
    }

    // DB: spam_flags テーブルに保存（inbox_messagesのmetadataを更新）
    if (isSupabaseConfigured() && Object.keys(results).length > 0) {
      const supabase = createServerClient();
      if (supabase) {
        for (const [msgId, flag] of Object.entries(results)) {
          try {
            // inbox_messagesのmetadataにspam_flagを追加
            const { data: existing } = await supabase
              .from('inbox_messages')
              .select('metadata')
              .eq('id', msgId)
              .single();

            const metadata = existing?.metadata || {};
            metadata.spam_flag = {
              isSpam: flag.isSpam,
              reason: flag.reason,
              confidence: flag.confidence,
              checkedAt: new Date().toISOString(),
            };

            await supabase
              .from('inbox_messages')
              .update({ metadata })
              .eq('id', msgId);
          } catch {
            // 個別のメッセージ更新失敗は無視
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      checkedCount: messages.length,
      flaggedCount: Object.keys(results).length,
    });
  } catch (error) {
    console.error('[SpamCheck API] エラー:', error);
    return NextResponse.json({ success: false, error: 'スパム判定に失敗しました' }, { status: 500 });
  }
}
