// Phase 26: コンタクト自動エンリッチAPI
// Slack/Chatworkプロフィール取得 + メール署名解析 + AIコンテキスト生成
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// ========================================
// Slack プロフィール取得
// ========================================
async function fetchSlackProfiles(token: string): Promise<Map<string, {
  realName: string;
  email: string;
  title: string;
  image: string;
}>> {
  const profiles = new Map<string, { realName: string; email: string; title: string; image: string }>();

  try {
    // users.list でワークスペースの全ユーザーを取得
    let cursor = '';
    do {
      const params = new URLSearchParams({ limit: '200' });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`https://slack.com/api/users.list?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.ok) {
        console.error('[Enrich] Slack users.list エラー:', data.error);
        break;
      }

      for (const user of data.members || []) {
        if (user.deleted || user.is_bot) continue;
        const profile = user.profile || {};
        profiles.set(user.real_name || user.name, {
          realName: user.real_name || user.name || '',
          email: profile.email || '',
          title: profile.title || '', // 役職
          image: profile.image_72 || profile.image_48 || '',
        });
        // display_name でもマッピング
        if (profile.display_name && profile.display_name !== user.real_name) {
          profiles.set(profile.display_name, {
            realName: user.real_name || user.name || '',
            email: profile.email || '',
            title: profile.title || '',
            image: profile.image_72 || profile.image_48 || '',
          });
        }
      }

      cursor = data.response_metadata?.next_cursor || '';
    } while (cursor);

    console.log(`[Enrich] Slack: ${profiles.size}件のプロフィール取得`);
  } catch (err) {
    console.error('[Enrich] Slack プロフィール取得エラー:', err);
  }

  return profiles;
}

// ========================================
// Chatwork プロフィール取得
// ========================================
async function fetchChatworkProfiles(apiToken: string): Promise<Map<string, {
  name: string;
  email: string;
  organization: string;
  department: string;
  title: string;
  avatarUrl: string;
}>> {
  const profiles = new Map<string, { name: string; email: string; organization: string; department: string; title: string; avatarUrl: string }>();

  try {
    // /contacts で自分のコンタクト一覧を取得
    const res = await fetch('https://api.chatwork.com/v2/contacts', {
      headers: { 'X-ChatWorkToken': apiToken },
    });

    if (!res.ok) {
      console.error('[Enrich] Chatwork contacts エラー:', res.status);
      return profiles;
    }

    const contacts = await res.json();
    for (const c of contacts) {
      profiles.set(c.name || '', {
        name: c.name || '',
        email: c.chatwork_id || '', // Chatwork ID（メールは直接取れない）
        organization: c.organization_name || '',
        department: c.department || '',
        title: c.title || '',
        avatarUrl: c.avatar_image_url || '',
      });
    }

    console.log(`[Enrich] Chatwork: ${profiles.size}件のプロフィール取得`);
  } catch (err) {
    console.error('[Enrich] Chatwork プロフィール取得エラー:', err);
  }

  return profiles;
}

// ========================================
// メール署名から会社名・部署名を抽出
// ========================================
function extractFromSignature(bodyFull: string): { company: string; department: string } {
  if (!bodyFull) return { company: '', department: '' };

  // 署名ブロックを検出（一般的な区切り線パターン）
  const signaturePatterns = [
    /[-─━]{3,}/,       // --- や ───
    /[=＝]{3,}/,       // === や ＝＝＝
    /_{3,}/,           // ___
    /\*{3,}/,          // ***
    /^--\s*$/m,        // -- （メール署名の標準区切り）
  ];

  let signatureBlock = '';
  const lines = bodyFull.split('\n');

  // 後ろから署名ブロックを探す
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
    const line = lines[i].trim();
    for (const pattern of signaturePatterns) {
      if (pattern.test(line)) {
        signatureBlock = lines.slice(i).join('\n');
        break;
      }
    }
    if (signatureBlock) break;
  }

  // 署名ブロックが見つからない場合は末尾20行を使用
  if (!signatureBlock) {
    signatureBlock = lines.slice(-20).join('\n');
  }

  let company = '';
  let department = '';

  // 会社名パターン（株式会社〜、〜株式会社、〜Co.,Ltd. など）
  const companyPatterns = [
    /(?:株式会社|有限会社|合同会社|合資会社|一般社団法人|特定非営利活動法人)\s*[^\s\n\r<>()（）]{1,30}/,
    /[^\s\n\r<>()（）]{1,30}(?:株式会社|有限会社|合同会社)/,
    /[A-Z][A-Za-z\s&.]{2,30}(?:Co\.,?\s*Ltd\.?|Inc\.?|Corp\.?|LLC|Ltd\.?)/i,
  ];

  for (const pattern of companyPatterns) {
    const match = signatureBlock.match(pattern);
    if (match) {
      company = match[0].trim();
      break;
    }
  }

  // 部署名パターン
  const deptPatterns = [
    /(?:[\s　]|^)([^\s\n\r<>]{1,20}(?:部|課|室|チーム|グループ|センター|事業本部|本部|局|Division|Department|Dept\.))/im,
  ];

  for (const pattern of deptPatterns) {
    const match = signatureBlock.match(pattern);
    if (match) {
      department = (match[1] || match[0]).trim();
      break;
    }
  }

  return { company, department };
}

// ========================================
// 会話パターンからAIコンテキストを自動生成
// ========================================
function analyzeConversationTone(
  myMessages: string[],
  theirMessages: string[]
): string {
  if (myMessages.length < 3) return '';

  const allMyText = myMessages.join('\n');

  // 敬語レベル判定
  const formalMarkers = (allMyText.match(/です|ます|ございます|いたします|させていただ|お願い|ご確認|ご連絡|恐れ入り|恐縮/g) || []).length;
  const casualMarkers = (allMyText.match(/だね|だよ|よろしく！|ありがとう！|OK|了解|りょ|おけ|www|笑/gi) || []).length;

  let toneDescription = '';
  if (casualMarkers > formalMarkers) {
    toneDescription = 'カジュアルな口調でやり取り。';
  } else if (formalMarkers > casualMarkers * 3) {
    toneDescription = '丁寧な敬語でやり取り。';
  } else {
    toneDescription = '適度な敬語でやり取り。';
  }

  // 絵文字・感嘆符の使用傾向
  const emojiCount = (allMyText.match(/[😀-🙏🌀-🗿🚀-🛿🤀-🧿]/gu) || []).length;
  const exclamationCount = (allMyText.match(/！|!/g) || []).length;

  if (emojiCount > myMessages.length) {
    toneDescription += '絵文字を多用。';
  }
  if (exclamationCount > myMessages.length * 2) {
    toneDescription += '感嘆符を多く使う傾向。';
  }

  // レスポンスの長さ傾向
  const avgLength = allMyText.length / myMessages.length;
  if (avgLength > 200) {
    toneDescription += '詳細に説明する傾向。';
  } else if (avgLength < 50) {
    toneDescription += '簡潔に返信する傾向。';
  }

  // 話題の傾向（技術系キーワード）
  const techKeywords = (allMyText.match(/API|実装|デプロイ|バグ|コード|サーバー|DB|テスト|リリース|設計|仕様/g) || []).length;
  if (techKeywords > 5) {
    toneDescription += '技術的な話題が多い。';
  }

  return toneDescription;
}

// ========================================
// POST: コンタクトエンリッチ実行
// ========================================
export async function POST() {
  try {
    const userId = await getServerUserId();
    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    // 1. トークンを取得
    const { data: tokens } = await supabase
      .from('user_service_tokens')
      .select('service_name, token_data')
      .eq('is_active', true);

    const slackToken = tokens?.find((t) => t.service_name === 'slack')?.token_data?.access_token
      || tokens?.find((t) => t.service_name === 'slack')?.token_data?.bot_token || '';
    const chatworkToken = tokens?.find((t) => t.service_name === 'chatwork')?.token_data?.api_token
      || tokens?.find((t) => t.service_name === 'chatwork')?.token_data?.access_token || '';

    // 2. 外部プロフィール取得（並列実行）
    const [slackProfiles, chatworkProfiles] = await Promise.all([
      slackToken ? fetchSlackProfiles(slackToken) : Promise.resolve(new Map()),
      chatworkToken ? fetchChatworkProfiles(chatworkToken) : Promise.resolve(new Map()),
    ]);

    // 3. 既存コンタクト + メッセージを取得
    const { data: existingContacts } = await supabase
      .from('contact_persons')
      .select('id, name, company_name, department, notes, main_channel');

    // まだcontact_personsに登録されていないコンタクトも含めてinbox_messagesから集計
    const { data: allMessages } = await supabase
      .from('inbox_messages')
      .select('from_name, from_address, channel, body, body_full, metadata')
      .neq('from_name', 'あなた')
      .neq('from_name', '')
      .order('timestamp', { ascending: false })
      .limit(2000);

    // 自分の送信メッセージも取得（トーン分析用）
    const { data: myMessages } = await supabase
      .from('inbox_messages')
      .select('from_name, body, metadata')
      .eq('from_name', 'あなた')
      .order('timestamp', { ascending: false })
      .limit(500);

    // 4. 送信先ごとにメッセージをグループ化
    const senderGroups = new Map<string, {
      name: string;
      address: string;
      channel: string;
      theirMessages: string[];
      myMessagesInThread: string[];
      bodyFullSample: string;
    }>();

    if (allMessages) {
      for (const msg of allMessages) {
        const key = msg.from_address?.toLowerCase() || msg.from_name;
        if (!key) continue;
        const existing = senderGroups.get(key);
        if (existing) {
          existing.theirMessages.push(msg.body || '');
          if (!existing.bodyFullSample && msg.body_full) {
            existing.bodyFullSample = msg.body_full;
          }
        } else {
          senderGroups.set(key, {
            name: msg.from_name || '',
            address: msg.from_address || '',
            channel: msg.channel,
            theirMessages: [msg.body || ''],
            myMessagesInThread: [],
            bodyFullSample: msg.body_full || '',
          });
        }
      }
    }

    // 自分のメッセージを対応するグループに振り分け（簡易的にチャネルで紐付け）
    // 注: 正確にはthread_idで紐付けるべきだが、まずは簡易版
    if (myMessages) {
      for (const msg of myMessages) {
        const meta = msg.metadata || {};
        // Chatworkの場合はroomIdで紐付け
        if (meta.chatworkRoomId) {
          for (const [, group] of senderGroups) {
            if (group.channel === 'chatwork') {
              group.myMessagesInThread.push(msg.body || '');
              break;
            }
          }
        }
        // Slackの場合はchannelで紐付け
        if (meta.slackChannel) {
          for (const [, group] of senderGroups) {
            if (group.channel === 'slack') {
              group.myMessagesInThread.push(msg.body || '');
              break;
            }
          }
        }
      }
    }

    // 5. エンリッチ実行
    // Phase 35: contact_channels の (channel, address) で既存コンタクトを照合し差分のみ処理
    let enrichedCount = 0;
    const results: { name: string; updates: string[] }[] = [];

    // 既存contact_personsをnameでマッピング
    const existingByName = new Map<string, typeof existingContacts extends (infer T)[] ? T : never>();
    if (existingContacts) {
      for (const c of existingContacts) {
        existingByName.set(c.name?.toLowerCase() || '', c);
      }
    }

    // Phase 35: contact_channels の (channel, address) → contact_id マッピングを構築
    const { data: allChannels } = await supabase
      .from('contact_channels')
      .select('contact_id, channel, address');
    const channelToContactId = new Map<string, string>();
    if (allChannels) {
      for (const ch of allChannels) {
        channelToContactId.set(`${ch.channel}::${ch.address?.toLowerCase()}`, ch.contact_id);
      }
    }

    for (const [key, group] of senderGroups) {
      // Phase 35: まず contact_channels で (channel, address) を照合
      const channelKey = group.address ? `${group.channel}::${group.address.toLowerCase()}` : '';
      const existingContactIdByChannel = channelKey ? channelToContactId.get(channelKey) : undefined;

      // チャンネル照合 → name照合 の優先順位で既存コンタクトを特定
      let existingContact: (typeof existingContacts extends (infer T)[] ? T : never) | undefined;
      if (existingContactIdByChannel && existingContacts) {
        existingContact = existingContacts.find((c) => c.id === existingContactIdByChannel);
      }
      if (!existingContact) {
        existingContact = existingByName.get(group.name?.toLowerCase() || '') || existingByName.get(key);
      }

      const updates: Record<string, unknown> = {};
      const updateLabels: string[] = [];

      // --- Slack プロフィールからエンリッチ ---
      if (group.channel === 'slack') {
        const slackProfile = slackProfiles.get(group.name);
        if (slackProfile) {
          if (slackProfile.title && !existingContact?.department) {
            updates.department = slackProfile.title;
            updateLabels.push(`部署/役職: ${slackProfile.title}`);
          }
        }
      }

      // --- Chatwork プロフィールからエンリッチ ---
      if (group.channel === 'chatwork') {
        const cwProfile = chatworkProfiles.get(group.name);
        if (cwProfile) {
          if (cwProfile.organization && !existingContact?.company_name) {
            updates.company_name = cwProfile.organization;
            updateLabels.push(`会社名: ${cwProfile.organization}`);
          }
          if (cwProfile.department && !existingContact?.department) {
            updates.department = cwProfile.department;
            updateLabels.push(`部署: ${cwProfile.department}`);
          }
        }
      }

      // --- メール署名からエンリッチ ---
      if (group.channel === 'email' && group.bodyFullSample) {
        const sig = extractFromSignature(group.bodyFullSample);
        if (sig.company && !existingContact?.company_name) {
          updates.company_name = sig.company;
          updateLabels.push(`会社名(署名): ${sig.company}`);
        }
        if (sig.department && !existingContact?.department) {
          updates.department = sig.department;
          updateLabels.push(`部署(署名): ${sig.department}`);
        }
      }

      // --- 会話トーン分析 ---
      if (group.myMessagesInThread.length >= 3 && !existingContact?.notes) {
        const tone = analyzeConversationTone(group.myMessagesInThread, group.theirMessages);
        if (tone) {
          updates.notes = tone;
          updateLabels.push(`トーン: ${tone}`);
        }
      }

      // --- DB更新 ---
      if (existingContact?.id) {
        // Phase 35: 既存コンタクトがある場合 → 差分のみ更新（重複作成しない）
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('contact_persons')
            .update(updates)
            .eq('id', existingContact.id);
          enrichedCount++;
          results.push({ name: group.name, updates: updateLabels });
        }
      } else if (Object.keys(updates).length > 0) {
        // Phase 35: 未登録 → contact_channels にも存在しない場合のみ新規作成
        const visibility = (group.channel === 'slack' || group.channel === 'chatwork') ? 'shared' : 'private';
        const newId = crypto.randomUUID();
        await supabase
          .from('contact_persons')
          .insert({
            id: newId,
            name: group.name,
            main_channel: group.channel,
            relationship_type: 'unknown',
            confidence: 0.5,
            confirmed: false,
            visibility,
            owner_user_id: visibility === 'private' ? userId : null,
            ...updates,
          });

        // contact_channels にも登録（upsert で重複回避）
        if (group.address) {
          await supabase.from('contact_channels').upsert(
            {
              contact_id: newId,
              channel: group.channel,
              address: group.address,
              frequency: group.theirMessages.length,
            },
            { onConflict: 'contact_id,channel,address' }
          );
        }

        // 新規追加したチャンネルをマップに記録（同一ループ内の重複防止）
        if (channelKey) {
          channelToContactId.set(channelKey, newId);
        }

        enrichedCount++;
        results.push({ name: group.name, updates: updateLabels });
      }
    }

    console.log(`[Enrich] ${enrichedCount}件のコンタクトをエンリッチ`);

    return NextResponse.json({
      success: true,
      enriched: enrichedCount,
      slackProfilesFound: slackProfiles.size,
      chatworkProfilesFound: chatworkProfiles.size,
      details: results,
    });
  } catch (error) {
    console.error('[Enrich] エラー:', error);
    return NextResponse.json({ success: false, error: 'エンリッチ処理に失敗しました' }, { status: 500 });
  }
}
