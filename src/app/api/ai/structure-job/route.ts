// Phase 58: ジョブ構造化API — 4タイプ別AI処理
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId, getServerUserDisplayName, getServerUserEmailSignature } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      channel, from, subject, body, jobType, messageId,
      consultQuestion, consultTargetName, consultTargetContactId,
    } = await request.json();

    if (!body) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 });
    }

    const messageContent = `チャネル: ${channel || '不明'}\n送信者: ${from || '不明'}\n件名: ${subject || 'なし'}\n本文:\n${body.slice(0, 1000)}`.trim();
    const senderName = from || '送信者';

    // ジョブタイプ別の処理
    switch (jobType) {
      case 'schedule':
        return await handleSchedule(userId, messageContent, senderName, subject, body, messageId, channel);
      case 'consult':
        return await handleConsult(userId, messageContent, senderName, subject, body, messageId, consultQuestion, consultTargetName);
      case 'save_to_drive':
        return await handleSaveToDrive(userId, messageContent, senderName, subject, body, messageId, channel);
      case 'todo':
        return await handleTodo(messageContent, senderName, subject, body);
      default:
        return await handleDefault(messageContent, senderName, subject, body, jobType);
    }
  } catch (error) {
    console.error('AIジョブ構造化エラー:', error);
    return NextResponse.json({ error: 'ジョブの構造化に失敗しました' }, { status: 500 });
  }
}

// ===== 日程調整 =====
async function handleSchedule(
  userId: string, messageContent: string, senderName: string,
  subject: string, body: string, messageId: string, channel?: string
) {
  // 1. カレンダー空き時間を取得（翌営業日〜1週間、10:00-19:00）
  let freeSlots: string[] = [];
  try {
    const { findFreeSlots: findSlots } = await import('@/services/calendar/calendarClient.service');

    // 翌営業日を計算
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() + 1);
    // 土日スキップ
    while (startDate.getDay() === 0 || startDate.getDay() === 6) {
      startDate.setDate(startDate.getDate() + 1);
    }
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);

    const slots = await findSlots(
      userId,
      startDate.toISOString(),
      endDate.toISOString(),
      60,   // slotDurationMinutes
      10,   // workingHoursStart
      19    // workingHoursEnd
    );

    if (slots && slots.length > 0) {
      // findFreeSlotsは連続空きブロック全体を1スロットで返す
      // 例: { start: "2026-03-05T13:00:00", end: "2026-03-05T19:00:00", durationMinutes: 360 }
      // → start と end の両方を使って「13:00-19:00」と表示する

      const slotsByDate = new Map<string, string[]>();
      for (const slot of slots) {
        const startDt = new Date(slot.start);
        const endDt = new Date(slot.end);
        const dateKey = startDt.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
        const startStr = `${startDt.getHours().toString().padStart(2, '0')}:${startDt.getMinutes().toString().padStart(2, '0')}`;
        const endStr = `${endDt.getHours().toString().padStart(2, '0')}:${endDt.getMinutes().toString().padStart(2, '0')}`;
        const rangeStr = `${startStr}-${endStr}`;
        if (!slotsByDate.has(dateKey)) slotsByDate.set(dateKey, []);
        slotsByDate.get(dateKey)!.push(rangeStr);
      }

      for (const [dateKey, ranges] of slotsByDate) {
        freeSlots.push(`${dateKey} ${ranges.join(', ')}`);
      }
    }
  } catch (calErr) {
    console.error('[StructureJob] カレンダー取得エラー:', calErr);
  }

  // 2. ユーザー名・署名・ライティングスタイルを取得
  const userName = await getServerUserDisplayName() || '';
  const emailSignature = await getServerUserEmailSignature();
  const isEmail = !channel || channel === 'email';

  // ライティングスタイル取得
  let writingStylePrompt = '';
  try {
    const { getUserWritingStyle } = await import('@/services/ai/aiClient.service');
    writingStylePrompt = await getUserWritingStyle(userId, channel || 'email');
  } catch { /* ignore */ }

  // 3. 空き日程テキストをコード側で組み立て（AIに絞り込ませない）
  const slotsListText = freeSlots.length > 0
    ? freeSlots.map(s => `・${s}`).join('\n')
    : '※カレンダー情報が取得できませんでした。手動で候補をご記入ください。';

  // 4. AIで挨拶文と締め文だけ生成（空き日程はコードで挿入する）
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: `あなたはビジネスの日程調整を支援するアシスタントです。

返信メッセージの「挨拶文」と「締め文」だけを生成してください。
空き日程の候補リストは別途挿入するので、あなたは日程を一切書かないでください。

返信者の名前は「${userName || '（名前）'}」です。
${isEmail && emailSignature ? '署名は別途自動付与されるので、締め文に名前や署名を含めないでください。' : !isEmail ? '末尾に名前や署名を書かないでください（チャットツールのため不要です）。' : ''}
${writingStylePrompt ? '\n【重要】以下のユーザーの過去の送信スタイルに合わせた文体で書いてください。' + writingStylePrompt : ''}

必ず以下のJSON形式で返してください:
{
  "title": "ジョブのタイトル（例: ○○さんと日程調整）",
  "description": "やるべきことの要約（50文字以内）",
  "greeting": "挨拶文（メッセージ内容を踏まえた丁寧なビジネス文面。日程候補は書かない。最後に「以下の日程でご都合はいかがでしょうか。」等の導入文で終わる）",
  "closing": "締め文（ご都合のよい日時をお選びください等の一文 + ご確認のほど〜${isEmail && !emailSignature ? ' + 署名「' + (userName || '名前') + '」' : ''}）",
  "purpose": "打ち合わせの目的（抽出結果）"
}`,
      messages: [{
        role: 'user',
        content: `以下のメッセージに対して日程調整の返信を作成してください:\n\n${messageContent}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const structured = JSON.parse(cleaned);

    // コード側で返信文面を組み立て（空き日程を強制挿入）
    const draftParts = [
      structured.greeting || `${senderName}様\n\nお世話になっております。${userName}でございます。`,
      '',
      '【候補日時】',
      slotsListText,
      '',
      structured.closing || `ご都合の良い日時をお選びいただけましたら幸いです。\nよろしくお願いいたします。${isEmail && !emailSignature ? '\n' + userName : ''}`,
    ];

    // メールで署名設定がある場合は自動付与
    if (isEmail && emailSignature) {
      draftParts.push('', emailSignature);
    }

    const aiDraft = draftParts.join('\n');

    return NextResponse.json({
      success: true,
      data: {
        title: structured.title || `${senderName}と日程調整`,
        description: structured.description || `${subject || 'メッセージ'}に対する日程調整`,
        aiDraft,
        purpose: structured.purpose,
        freeSlots,
      },
    });
  } catch {
    // フォールバック: AIなしでもテンプレートで返信文面を生成
    const fallbackParts = [
      `${senderName}様`,
      '',
      `お世話になっております。${userName || '（名前）'}でございます。`,
      'ご連絡ありがとうございます。',
      '以下の日程でご都合はいかがでしょうか。',
      '',
      '【候補日時】',
      slotsListText,
      '',
      'ご都合の良い日時をお選びいただけましたら幸いです。',
      'よろしくお願いいたします。',
    ];

    // メールで署名設定がある場合は自動付与、なければ名前のみ
    if (isEmail && emailSignature) {
      fallbackParts.push('', emailSignature);
    } else if (isEmail) {
      fallbackParts.push('', userName || '（名前）');
    }

    const aiDraft = fallbackParts.join('\n');

    return NextResponse.json({
      success: true,
      data: {
        title: `${senderName}と日程調整`,
        description: `${subject || 'メッセージ'}に対する日程調整`,
        aiDraft,
        freeSlots,
      },
    });
  }
}

// ===== 社内相談 =====
async function handleConsult(
  userId: string, messageContent: string, senderName: string,
  subject: string, body: string, messageId: string,
  consultQuestion: string, consultTargetName: string
) {
  // スレッド要約を生成（直近10件）
  let threadSummary = '';
  try {
    const sb = getServerSupabase() || getSupabase();
    if (sb && messageId) {
      // 同じスレッドの直近10件を取得
      const { data: sourceMsg } = await sb
        .from('inbox_messages')
        .select('thread_id, from_address, channel')
        .eq('id', messageId)
        .single();

      if (sourceMsg) {
        let query = sb
          .from('inbox_messages')
          .select('from_name, from_address, subject, body, direction, created_at')
          .order('created_at', { ascending: false })
          .limit(10);

        if (sourceMsg.thread_id) {
          query = query.eq('thread_id', sourceMsg.thread_id);
        } else if (sourceMsg.from_address) {
          query = query.or(`from_address.eq.${sourceMsg.from_address},to_address.eq.${sourceMsg.from_address}`);
        }

        const { data: threadMsgs } = await query;
        if (threadMsgs && threadMsgs.length > 0) {
          const summaryLines = threadMsgs.reverse().map((m: Record<string, unknown>, i: number) => {
            const dir = m.direction === 'sent' ? '→送信' : '←受信';
            const name = (m.from_name as string) || (m.from_address as string) || '不明';
            const bodyText = ((m.body as string) || '').slice(0, 150);
            return `${i + 1}. [${dir}] ${name}: ${bodyText}`;
          });

          // AI要約
          try {
            const anthropic = new Anthropic();
            const sumRes = await anthropic.messages.create({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: 512,
              system: 'メッセージのスレッド（やりとりの流れ）を簡潔に要約してください。箇条書きではなく、流れが分かる文章で200文字以内にまとめてください。',
              messages: [{ role: 'user', content: summaryLines.join('\n') }],
            });
            threadSummary = sumRes.content[0].type === 'text' ? sumRes.content[0].text : summaryLines.join('\n');
          } catch {
            threadSummary = summaryLines.join('\n');
          }
        }
      }
    }
  } catch (e) {
    console.error('[StructureJob] スレッド要約エラー:', e);
    threadSummary = `件名: ${subject || 'なし'}\n送信者: ${senderName}\n本文: ${body.slice(0, 200)}`;
  }

  if (!threadSummary) {
    threadSummary = `件名: ${subject || 'なし'}\n送信者: ${senderName}\n本文: ${body.slice(0, 200)}`;
  }

  return NextResponse.json({
    success: true,
    data: {
      title: `社内相談: ${consultTargetName || '未定'}`,
      description: (consultQuestion || '').slice(0, 100),
      threadSummary,
    },
  });
}

// ===== Driveに保存 =====
async function handleSaveToDrive(
  userId: string, messageContent: string, senderName: string,
  subject: string, body: string, messageId: string, channel: string
) {
  // チャネルから組織・プロジェクトを自動推定
  let orgName = '';
  let projectName = '';
  let projectId = '';

  try {
    const sb = getServerSupabase() || getSupabase();
    if (sb && messageId) {
      // メッセージのチャネル情報からproject_channels経由でプロジェクト推定
      const { data: msg } = await sb
        .from('inbox_messages')
        .select('from_address, metadata, channel')
        .eq('id', messageId)
        .single();

      if (msg) {
        const metadata = (msg.metadata || {}) as Record<string, unknown>;
        const channelId = (metadata.slackChannel as string) || (metadata.chatworkRoomId as string) || '';

        if (channelId) {
          const { data: projCh } = await sb
            .from('project_channels')
            .select('project_id, projects(id, name, organization_id, organizations(name))')
            .eq('channel_identifier', channelId)
            .limit(1)
            .single();

          if (projCh) {
            const proj = (projCh as Record<string, unknown>).projects as Record<string, unknown>;
            projectId = (proj?.id as string) || '';
            projectName = (proj?.name as string) || '';
            const org = proj?.organizations as Record<string, unknown>;
            orgName = (org?.name as string) || '';
          }
        }

        // メールの場合: from_addressのドメインから組織推定
        if (!projectId && msg.from_address && msg.channel === 'email') {
          const domain = (msg.from_address as string).split('@')[1];
          if (domain) {
            const { data: orgs } = await sb
              .from('organizations')
              .select('id, name')
              .eq('domain', domain)
              .limit(1);

            if (orgs && orgs.length > 0) {
              orgName = orgs[0].name;
              // 組織のプロジェクトを検索
              const { data: projs } = await sb
                .from('projects')
                .select('id, name')
                .eq('organization_id', orgs[0].id)
                .limit(1);

              if (projs && projs.length > 0) {
                projectId = projs[0].id;
                projectName = projs[0].name;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[StructureJob] Drive推定エラー:', e);
  }

  const locationInfo = projectName
    ? `${orgName} / ${projectName}`
    : orgName || '保存先未定（手動で選択）';

  return NextResponse.json({
    success: true,
    data: {
      title: `Drive保存: ${subject || senderName}`,
      description: `${locationInfo}に保存`,
      projectId,
      orgName,
      projectName,
    },
  });
}

// ===== 後でやる =====
async function handleTodo(
  messageContent: string, senderName: string, subject: string, body: string
) {
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 256,
      system: `メッセージからジョブのタイトルと説明を生成してください。
必ず以下のJSON形式で返してください:
{ "title": "やるべきことのタイトル（20文字以内）", "description": "概要（50文字以内）" }`,
      messages: [{ role: 'user', content: `以下のメッセージをジョブ化:\n\n${messageContent}` }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return NextResponse.json({ success: true, data: JSON.parse(cleaned) });
  } catch {
    return NextResponse.json({
      success: true,
      data: {
        title: subject || `${senderName}の件`,
        description: body.slice(0, 50),
      },
    });
  }
}

// ===== デフォルト =====
async function handleDefault(
  messageContent: string, senderName: string, subject: string, body: string, jobType: string
) {
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 256,
      system: `メッセージからジョブのタイトルと説明を生成してください。
必ず以下のJSON形式で返してください:
{ "title": "タイトル（20文字以内）", "description": "概要（50文字以内）" }`,
      messages: [{ role: 'user', content: `以下のメッセージをジョブ化:\n\n${messageContent}` }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return NextResponse.json({ success: true, data: JSON.parse(cleaned) });
  } catch {
    return NextResponse.json({
      success: true,
      data: {
        title: subject || body.slice(0, 20),
        description: body.slice(0, 50),
      },
    });
  }
}
