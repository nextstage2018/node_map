// v6.0: Gemini会議メモ取得サービス
// Google Calendar イベントの添付ファイル（Google Docs）から会議メモを取得
// Drive API export でプレーンテキストを取得し、geminiParser でパースする

import { getValidAccessToken } from '@/services/calendar/calendarClient.service';
import type { CalendarEvent, CalendarAttachment } from '@/services/calendar/calendarClient.service';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DOCS_EXPORT_MIME = 'text/plain'; // Google Docs → プレーンテキスト

// ========================================
// 型定義
// ========================================
export interface MeetingNoteResult {
  found: boolean;
  docId: string | null;
  docTitle: string | null;
  docUrl: string | null;
  textContent: string | null;
  calendarEventId: string;
  calendarEventTitle: string;
  meetingStartTime: string;
  meetingEndTime: string;
  attendees: string[];
}

// ========================================
// カレンダーイベントから会議メモを検出
// ========================================

/**
 * Google Meet 会議のイベントか判定
 */
export function isGoogleMeetEvent(event: CalendarEvent): boolean {
  // hangoutLink があれば Google Meet
  if (event.hangoutLink) return true;
  // conferenceData に Google Meet の情報があるか
  if (event.conferenceData?.conferenceSolution?.name?.includes('Google Meet')) return true;
  if (event.conferenceData?.entryPoints?.some(ep => ep.uri?.includes('meet.google.com'))) return true;
  return false;
}

/**
 * イベントの添付ファイルからGemini会議メモ（Google Docs）を検出
 * Gemini「メモを取る」はGoogle Docsとしてイベントに添付される
 */
export function findMeetingNoteAttachment(event: CalendarEvent): CalendarAttachment | null {
  if (!event.attachments || event.attachments.length === 0) return null;

  // Google Docs の MIME type でフィルタ
  const docsAttachments = event.attachments.filter(
    a => a.mimeType === 'application/vnd.google-apps.document'
  );

  if (docsAttachments.length === 0) return null;

  // 「会議メモ」「Meeting notes」等のキーワードを含むものを優先
  const noteKeywords = ['会議メモ', 'メモ', 'Meeting notes', 'Notes', 'meeting notes'];
  const noteDoc = docsAttachments.find(a =>
    noteKeywords.some(kw => a.title.toLowerCase().includes(kw.toLowerCase()))
  );

  // キーワードマッチがなければ最初のGoogle Docsを返す
  return noteDoc || docsAttachments[0];
}

// ========================================
// Google Docs コンテンツ取得
// ========================================

/**
 * Google Docs のファイルIDからプレーンテキストを取得
 * Drive API の export エンドポイントを使用
 */
export async function fetchDocContent(userId: string, fileId: string): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    console.error('[MeetingNoteFetcher] アクセストークン取得失敗');
    return null;
  }

  try {
    // まずDrive APIの基本アクセスをテスト（ファイル一覧）
    const listRes = await fetch(`${DRIVE_API_BASE}/files?pageSize=1&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log('[MeetingNoteFetcher] Drive API一覧テスト:', listRes.status, listRes.ok ? 'OK' : await listRes.text().catch(() => ''));

    // ファイルメタデータ取得テスト
    const metaRes = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,owners,permissions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log('[MeetingNoteFetcher] メタデータテスト:', metaRes.status, metaRes.ok ? JSON.stringify(await metaRes.json()) : await metaRes.text().catch(() => ''));

    // エクスポート
    const exportUrl = `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(DOCS_EXPORT_MIME)}`;
    const res = await fetch(exportUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      console.error('[MeetingNoteFetcher] Docs取得失敗:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const text = await res.text();
    return text;
  } catch (error) {
    console.error('[MeetingNoteFetcher] Docsエクスポートエラー:', error);
    return null;
  }
}

/**
 * Google Docs のメタデータを取得（タイトル等）
 */
export async function fetchDocMetadata(userId: string, fileId: string): Promise<{ title: string; webViewLink: string } | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  try {
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=name,webViewLink`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      console.error('[MeetingNoteFetcher] メタデータ取得失敗:', res.status);
      return null;
    }

    const data = await res.json();
    return {
      title: data.name || '',
      webViewLink: data.webViewLink || '',
    };
  } catch (error) {
    console.error('[MeetingNoteFetcher] メタデータエラー:', error);
    return null;
  }
}

// ========================================
// メイン: カレンダーイベントから会議メモを取得
// ========================================

/**
 * カレンダーイベントからGemini会議メモを取得
 * 1. イベントの添付ファイルからGoogle Docsを検出
 * 2. Drive API exportでテキスト取得
 */
export async function fetchMeetingNoteFromEvent(
  userId: string,
  event: CalendarEvent
): Promise<MeetingNoteResult> {
  const baseResult: MeetingNoteResult = {
    found: false,
    docId: null,
    docTitle: null,
    docUrl: null,
    textContent: null,
    calendarEventId: event.id,
    calendarEventTitle: event.summary,
    meetingStartTime: event.start,
    meetingEndTime: event.end,
    attendees: event.attendees?.map(a => a.email || a.displayName || '') || [],
  };

  // 1. 添付ファイルから会議メモを検出
  const noteAttachment = findMeetingNoteAttachment(event);
  if (!noteAttachment) {
    return baseResult;
  }

  // fileId を取得（attachmentから直接、またはURLから抽出）
  const fileId = noteAttachment.fileId || extractFileIdFromUrl(noteAttachment.fileUrl);
  if (!fileId) {
    console.warn('[MeetingNoteFetcher] fileId取得失敗:', noteAttachment.fileUrl);
    return baseResult;
  }

  // 2. テキストコンテンツを取得
  const textContent = await fetchDocContent(userId, fileId);
  if (!textContent) {
    return { ...baseResult, docId: fileId };
  }

  // 3. メタデータ取得（タイトル・URL）
  const metadata = await fetchDocMetadata(userId, fileId);

  return {
    found: true,
    docId: fileId,
    docTitle: metadata?.title || noteAttachment.title,
    docUrl: metadata?.webViewLink || noteAttachment.fileUrl,
    textContent,
    calendarEventId: event.id,
    calendarEventTitle: event.summary,
    meetingStartTime: event.start,
    meetingEndTime: event.end,
    attendees: event.attendees?.map(a => a.email || a.displayName || '') || [],
  };
}

// ========================================
// ユーティリティ
// ========================================

/**
 * Google Docs URL からファイルIDを抽出
 * 例: https://docs.google.com/document/d/FILE_ID/edit → FILE_ID
 */
function extractFileIdFromUrl(url: string): string | null {
  if (!url) return null;

  // /d/FILE_ID/ パターン
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // ?id=FILE_ID パターン
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  return null;
}
