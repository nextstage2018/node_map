// v6.0: Gemini会議メモ取得サービス
// Google Calendar イベントの添付ファイル（Google Docs）から会議メモを取得
// Google Docs API でドキュメント構造を取得し、プレーンテキストに変換する
// （Drive API export は他ユーザー所有ファイルで403/404になるため、Docs APIを使用）

import { getValidAccessToken } from '@/services/calendar/calendarClient.service';
import type { CalendarEvent, CalendarAttachment } from '@/services/calendar/calendarClient.service';

const DOCS_API_BASE = 'https://docs.googleapis.com/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

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
 * 方法1: Google Docs API（共有ドキュメントも読み取り可能）
 * 方法2: Drive API export（フォールバック）
 */
export async function fetchDocContent(userId: string, fileId: string): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    console.error('[MeetingNoteFetcher] アクセストークン取得失敗');
    return null;
  }

  // 方法1: Google Docs API でドキュメント構造を取得 → プレーンテキスト変換
  try {
    const docsUrl = `${DOCS_API_BASE}/documents/${fileId}`;
    console.log('[MeetingNoteFetcher] Docs API呼び出し:', docsUrl);

    const docsRes = await fetch(docsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (docsRes.ok) {
      const doc = await docsRes.json();
      console.log('[MeetingNoteFetcher] Docs API成功: title=', doc.title);
      const text = extractTextFromDocsBody(doc.body);
      if (text && text.trim().length > 0) {
        return text;
      }
      console.warn('[MeetingNoteFetcher] Docs APIからテキスト抽出結果が空');
    } else {
      const errText = await docsRes.text().catch(() => '');
      console.warn('[MeetingNoteFetcher] Docs API失敗:', docsRes.status, errText.substring(0, 300));
    }
  } catch (docsError) {
    console.warn('[MeetingNoteFetcher] Docs APIエラー:', docsError);
  }

  // 方法2: Drive API export（フォールバック）
  try {
    console.log('[MeetingNoteFetcher] Drive API exportにフォールバック');
    const exportUrl = `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent('text/plain')}`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const text = await res.text();
      console.log('[MeetingNoteFetcher] Drive API export成功:', text.length, '文字');
      return text;
    } else {
      console.error('[MeetingNoteFetcher] Drive API export失敗:', res.status, await res.text().catch(() => ''));
    }
  } catch (driveError) {
    console.error('[MeetingNoteFetcher] Drive API exportエラー:', driveError);
  }

  return null;
}

/**
 * Google Docs API のレスポンスボディからプレーンテキストを抽出
 * ドキュメント構造: body.content[] → paragraph.elements[] → textRun.content
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromDocsBody(body: any): string {
  if (!body || !body.content) return '';

  const parts: string[] = [];

  for (const element of body.content) {
    if (element.paragraph) {
      const paragraphText = extractTextFromParagraph(element.paragraph);
      parts.push(paragraphText);
    } else if (element.table) {
      // テーブル内のセルも処理
      const tableText = extractTextFromTable(element.table);
      if (tableText) parts.push(tableText);
    }
  }

  return parts.join('\n');
}

/**
 * パラグラフ要素からテキストを抽出
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromParagraph(paragraph: any): string {
  if (!paragraph.elements) return '';

  const texts: string[] = [];
  for (const elem of paragraph.elements) {
    if (elem.textRun && elem.textRun.content) {
      texts.push(elem.textRun.content);
    }
  }
  return texts.join('');
}

/**
 * テーブル要素からテキストを抽出
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromTable(table: any): string {
  if (!table.tableRows) return '';

  const rows: string[] = [];
  for (const row of table.tableRows) {
    if (!row.tableCells) continue;
    const cells: string[] = [];
    for (const cell of row.tableCells) {
      if (cell.content) {
        const cellText = cell.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((c: any) => c.paragraph ? extractTextFromParagraph(c.paragraph) : '')
          .join('')
          .trim();
        if (cellText) cells.push(cellText);
      }
    }
    if (cells.length > 0) rows.push(cells.join(' | '));
  }
  return rows.join('\n');
}

/**
 * Google Docs のメタデータを取得（タイトル等）
 * Docs API → Drive API のフォールバック
 */
export async function fetchDocMetadata(userId: string, fileId: string): Promise<{ title: string; webViewLink: string } | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  // 方法1: Google Docs API（タイトルを取得）
  try {
    const docsRes = await fetch(`${DOCS_API_BASE}/documents/${fileId}?fields=title,documentId`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (docsRes.ok) {
      const doc = await docsRes.json();
      return {
        title: doc.title || '',
        webViewLink: `https://docs.google.com/document/d/${fileId}/edit`,
      };
    }
  } catch {
    // Docs API失敗 → Drive APIにフォールバック
  }

  // 方法2: Drive API（フォールバック）
  try {
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=name,webViewLink`, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
 * 2. 添付がない場合、Drive APIでGemini Docsをタイトル+日付で検索（フォールバック）
 * 3. Google Docs API でテキスト取得
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
  let fileId: string | null = null;
  let attachmentTitle = '';

  const noteAttachment = findMeetingNoteAttachment(event);
  if (noteAttachment) {
    fileId = noteAttachment.fileId || extractFileIdFromUrl(noteAttachment.fileUrl);
    attachmentTitle = noteAttachment.title;
    if (!fileId) {
      console.warn('[MeetingNoteFetcher] fileId取得失敗:', noteAttachment.fileUrl);
    }
  }

  // 2. 添付がない場合、Drive APIでGemini Docsを検索（フォールバック）
  if (!fileId) {
    console.log(`[MeetingNoteFetcher] 添付なし → Drive検索フォールバック: "${event.summary}"`);
    const searchResult = await searchGeminiDocByEvent(userId, event);
    if (searchResult) {
      fileId = searchResult.fileId;
      attachmentTitle = searchResult.title;
      console.log(`[MeetingNoteFetcher] Drive検索で発見: "${searchResult.title}" (${searchResult.fileId})`);
    } else {
      console.log(`[MeetingNoteFetcher] Drive検索でも未検出: "${event.summary}"`);
      return baseResult;
    }
  }

  if (!fileId) return baseResult;

  // 3. テキストコンテンツを取得
  const textContent = await fetchDocContent(userId, fileId);
  if (!textContent) {
    return { ...baseResult, docId: fileId };
  }

  // 4. メタデータ取得（タイトル・URL）
  const metadata = await fetchDocMetadata(userId, fileId);

  return {
    found: true,
    docId: fileId,
    docTitle: metadata?.title || attachmentTitle,
    docUrl: metadata?.webViewLink || `https://docs.google.com/document/d/${fileId}/edit`,
    textContent,
    calendarEventId: event.id,
    calendarEventTitle: event.summary,
    meetingStartTime: event.start,
    meetingEndTime: event.end,
    attendees: event.attendees?.map(a => a.email || a.displayName || '') || [],
  };
}

/**
 * Drive APIでGemini会議メモを検索（添付ファイルがない場合のフォールバック）
 * 「イベントタイトル - 日付 - Gemini によるメモ」の命名パターンで検索
 */
async function searchGeminiDocByEvent(
  userId: string,
  event: CalendarEvent
): Promise<{ fileId: string; title: string } | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  try {
    // イベントタイトルでDrive内のGoogle Docsを検索
    const eventTitle = event.summary || '';
    // Gemini会議メモの命名パターン: 「タイトル - 日付 - Gemini によるメモ」
    const query = `name contains '${eventTitle.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.document'`;
    const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=createdTime desc`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn('[MeetingNoteFetcher] Drive検索失敗:', res.status);
      return null;
    }

    const data = await res.json();
    const files = data.files || [];

    if (files.length === 0) return null;

    // 「Gemini によるメモ」を含むものを優先
    const geminiDoc = files.find((f: { name: string }) =>
      f.name.includes('Gemini') || f.name.includes('メモ')
    );

    if (geminiDoc) {
      return { fileId: geminiDoc.id, title: geminiDoc.name };
    }

    return null;
  } catch (error) {
    console.warn('[MeetingNoteFetcher] Drive検索エラー:', error);
    return null;
  }
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
