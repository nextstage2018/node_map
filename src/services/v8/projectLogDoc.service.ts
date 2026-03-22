// v8.0: プロジェクトログ Google Docs サービス
// 1プロジェクト＝1ドキュメント（正史）。最新の会議セクションが常にドキュメント先頭に来る。
// Google Docs API で作成・更新。Google Drive API でプロジェクトフォルダ内に配置。

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { getValidAccessToken } from '@/services/calendar/calendarClient.service';

const DOCS_API_BASE = 'https://docs.googleapis.com/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

// ========================================
// 型定義
// ========================================

export interface ProjectLogDocInfo {
  documentId: string;
  documentUrl: string;
}

interface AgendaData {
  projectName: string;
  meetingDate: string;        // YYYY-MM-DD
  meetingTitle: string;
  // 意思決定ログ
  decisions: { title: string; decision_content: string; created_at: string }[];
  // 未対応リスト
  openIssues: { title: string; description: string | null; priority_level: string; days_stagnant: number }[];
  // MS進捗
  milestones: {
    title: string;
    status: string;
    target_date: string | null;
    tasks: {
      title: string;
      status: string;
      assignee_name: string | null;
      progress_summary: string | null;  // タスク会話からAI要約
      related_docs: { title: string; url: string }[];
    }[];
  }[];
  // 前回会議からの持ち越し議題サマリ
  previousMeetingSummary: string | null;
}

interface PostMeetingData {
  meetingDate: string;
  meetingTitle: string;
  summary: string;
  decisions: { title: string; decision_content: string; rationale: string }[];
  openIssues: { title: string; description: string; priority: string }[];
  taskSuggestions: { title: string; assignee: string; due_date: string | null; priority: string }[];
  milestoneSuggestions: { title: string; target_date: string | null; success_criteria: string }[];
}

// ========================================
// Google Docs API ヘルパー
// ========================================

async function docsFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!accessToken) {
    console.error('[ProjectLogDoc] docsFetch: accessToken が未設定です');
    throw new Error('Google OAuth トークンが未設定です');
  }

  const res = await fetch(`${DOCS_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // 403/401 エラー時に詳細ログを出力（デバッグ用）
  if (res.status === 403) {
    const errText = await res.clone().text().catch(() => '');
    console.error(`[ProjectLogDoc] 403 Forbidden: ${path}`, errText.substring(0, 500));
    console.error('[ProjectLogDoc] → Google Docs API がCloud Consoleで有効化されているか確認してください');
    console.error('[ProjectLogDoc] → https://console.developers.google.com/apis/api/docs.googleapis.com/overview?project=849962099484');
  } else if (res.status === 401) {
    console.error(`[ProjectLogDoc] 401 Unauthorized: ${path} — トークンが無効または期限切れです`);
  }

  return res;
}

async function driveFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!accessToken) {
    console.error('[ProjectLogDoc] driveFetch: accessToken が未設定です');
    throw new Error('Google OAuth トークンが未設定です');
  }

  const res = await fetch(`${DRIVE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 403) {
    const errText = await res.clone().text().catch(() => '');
    console.error(`[ProjectLogDoc] Drive API 403 Forbidden: ${path}`, errText.substring(0, 500));
  } else if (res.status === 401) {
    console.error(`[ProjectLogDoc] Drive API 401 Unauthorized: ${path}`);
  }

  return res;
}

// ========================================
// ドキュメント作成
// ========================================

/**
 * プロジェクト用のログドキュメントを作成
 * Drive APIで指定フォルダ内にGoogle Docを作成し、初期タイトルを設定
 */
export async function createProjectLogDoc(
  userId: string,
  projectId: string,
  projectName: string,
  parentFolderId?: string
): Promise<ProjectLogDocInfo | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    console.error('[ProjectLogDoc] アクセストークン取得失敗');
    return null;
  }

  try {
    // Drive API でプロジェクトフォルダ内にGoogle Docを作成
    const metadata: Record<string, unknown> = {
      name: `${projectName} - プロジェクトログ`,
      mimeType: 'application/vnd.google-apps.document',
      parents: parentFolderId ? [parentFolderId] : undefined,
    };

    const createRes = await driveFetch(accessToken, '/files', {
      method: 'POST',
      body: JSON.stringify(metadata),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      console.error('[ProjectLogDoc] Doc作成失敗:', createRes.status, errText);
      return null;
    }

    const fileData = await createRes.json();
    const documentId = fileData.id;
    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    // 初期コンテンツを書き込み（タイトル + 説明）
    const initContent = buildInitialContent(projectName);
    await batchUpdateDoc(accessToken, documentId, initContent);

    // DBにドキュメントIDを保存
    const supabase = getServerSupabase() || getSupabase();
    if (supabase) {
      await supabase
        .from('projects')
        .update({
          log_document_id: documentId,
          log_document_url: documentUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    }

    console.log(`[ProjectLogDoc] 作成完了: ${projectName} (${documentId})`);
    return { documentId, documentUrl };
  } catch (error) {
    console.error('[ProjectLogDoc] 作成エラー:', error);
    return null;
  }
}

/**
 * 既存のログドキュメントIDを取得。なければ新規作成
 * v9.0fix: フォルダが未作成の場合、ルール通りのDriveフォルダ構造を自動作成してからDoc配置
 */
export async function getOrCreateProjectLogDoc(
  userId: string,
  projectId: string
): Promise<ProjectLogDocInfo | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  // 既存チェック
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, log_document_id, log_document_url, organization_id')
    .eq('id', projectId)
    .single();

  if (!project) return null;

  if (project.log_document_id && project.log_document_url) {
    // 書き込み権限があるか確認（別ユーザーが作成したDocの場合403になる）
    try {
      const accessToken = await getValidAccessToken(userId);
      if (accessToken) {
        const checkRes = await fetch(
          `${DOCS_API_BASE}/documents/${project.log_document_id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (checkRes.ok) {
          return {
            documentId: project.log_document_id,
            documentUrl: project.log_document_url,
          };
        }
        // 403/404 → Docにアクセスできない → 再作成にフォールバック
        console.warn(`[ProjectLogDoc] 既存Doc(${project.log_document_id})にアクセス不可(${checkRes.status})。再作成します`);
      } else {
        console.warn(`[ProjectLogDoc] userId=${userId} のGoogleトークン未取得。Doc書き込みスキップ`);
        return null;
      }
    } catch (err) {
      console.warn('[ProjectLogDoc] Doc権限チェックエラー:', err);
      // チェック失敗時はそのまま返す（Docs API自体が無効化されている可能性）
      return {
        documentId: project.log_document_id,
        documentUrl: project.log_document_url,
      };
    }
  }

  // プロジェクトフォルダを取得 or 自動作成
  let parentFolderId: string | undefined;
  try {
    // まずDBから既存フォルダを検索
    const { data: folder } = await supabase
      .from('drive_folders')
      .select('drive_folder_id')
      .eq('project_id', projectId)
      .eq('hierarchy_level', 2)
      .limit(1)
      .single();

    if (folder) {
      parentFolderId = folder.drive_folder_id;
    } else if (project.organization_id) {
      // フォルダが存在しない → ルール通りの構造を自動作成
      // [NodeMap] 組織名/ → プロジェクト名/ の順で作成
      const { getOrCreateOrgFolder, getOrCreateProjectFolder } = await import('@/services/drive/driveClient.service');

      // 組織名を取得
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', project.organization_id)
        .single();

      if (org) {
        // L1: [NodeMap] 組織名/
        const orgFolderId = await getOrCreateOrgFolder(userId, project.organization_id, org.name);
        if (orgFolderId) {
          // L2: プロジェクト名/
          const projFolderId = await getOrCreateProjectFolder(userId, project.organization_id, projectId, project.name);
          if (projFolderId) {
            parentFolderId = projFolderId;
            console.log(`[ProjectLogDoc] Driveフォルダ自動作成: [NodeMap] ${org.name}/${project.name}/`);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ProjectLogDoc] フォルダ取得/作成でエラー（Docはルートに配置）:', err);
  }

  return createProjectLogDoc(userId, projectId, project.name, parentFolderId);
}

// ========================================
// 事前アジェンダ セクション生成
// ========================================

/**
 * 会議当日の事前アジェンダをドキュメント先頭に挿入
 */
export async function insertPreMeetingAgenda(
  userId: string,
  documentId: string,
  data: AgendaData
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;

  try {
    // 重複チェック: 同日セクションが既に存在するか確認
    const docRes = await docsFetch(accessToken, `/documents/${documentId}`);
    if (docRes.ok) {
      const doc = await docRes.json();
      const dateMarker = `━━ ${data.meetingDate}`;
      if (findTextPosition(doc, dateMarker) !== -1) {
        console.log(`[ProjectLogDoc] 事前アジェンダ既存のためスキップ: ${data.meetingDate}`);
        return true; // 既に存在するので成功扱い
      }
    }

    const content = buildPreMeetingAgendaContent(data);
    await batchUpdateDoc(accessToken, documentId, content);
    console.log(`[ProjectLogDoc] 事前アジェンダ挿入: ${data.meetingDate}`);
    return true;
  } catch (error) {
    console.error('[ProjectLogDoc] 事前アジェンダ挿入エラー:', error);
    return false;
  }
}

// ========================================
// 会議後 AI解析結果追記
// ========================================

/**
 * AI解析完了後、同日セクションに会議メモ・解析結果を追記
 */
export async function appendPostMeetingResults(
  userId: string,
  documentId: string,
  data: PostMeetingData
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;

  try {
    // まずドキュメントの現在の内容を取得して、該当日セクションの位置を特定
    const docRes = await docsFetch(accessToken, `/documents/${documentId}`);
    if (!docRes.ok) return false;
    const doc = await docRes.json();

    // 該当日のセクションマーカーを検索
    const dateMarker = `━━ ${data.meetingDate}`;
    const insertIndex = findTextPosition(doc, dateMarker);

    if (insertIndex === -1) {
      // 事前アジェンダが未生成の場合、先頭に新セクションごと挿入
      const content = buildFullMeetingSection(data);
      await batchUpdateDoc(accessToken, documentId, content);
    } else {
      // 同日セクション内の既存「AI解析結果」を検出
      const nextSeparator = findTextPosition(doc, '────────────────', insertIndex + dateMarker.length);
      const sectionEnd = nextSeparator > 0 ? nextSeparator : getDocEndIndex(doc);

      // 既存のAI解析結果があれば削除してから挿入（重複防止）
      const existingAiMarker = findTextPosition(doc, '▶ AI解析結果', insertIndex + dateMarker.length);
      if (existingAiMarker !== -1 && existingAiMarker < sectionEnd) {
        // 既存AI解析結果を削除（AI解析マーカーからセパレータまで）
        try {
          const deleteRequests = [
            {
              deleteContentRange: {
                range: {
                  startIndex: existingAiMarker,
                  endIndex: sectionEnd,
                },
              },
            },
          ];
          await docsFetch(accessToken, `/documents/${documentId}:batchUpdate`, {
            method: 'POST',
            body: JSON.stringify({ requests: deleteRequests }),
          });

          // 削除後にドキュメントを再読み込みして正しい位置を取得
          const docRes2 = await docsFetch(accessToken, `/documents/${documentId}`);
          if (docRes2.ok) {
            const doc2 = await docRes2.json();
            const newSeparator = findTextPosition(doc2, '────────────────', insertIndex);
            const appendAt = newSeparator > 0 ? newSeparator : getDocEndIndex(doc2);
            const content = buildPostMeetingContent(data);
            await insertTextAtPosition(accessToken, documentId, appendAt, content);
          }
        } catch (delErr) {
          console.warn('[ProjectLogDoc] 既存AI解析結果の削除失敗、上書き追記:', delErr);
          // フォールバック: そのまま末尾に追記
          const content = buildPostMeetingContent(data);
          await insertTextAtPosition(accessToken, documentId, sectionEnd, content);
        }
      } else {
        // AI解析結果がまだない場合、セパレータ前に追記
        const content = buildPostMeetingContent(data);
        await insertTextAtPosition(accessToken, documentId, sectionEnd, content);
      }
    }

    console.log(`[ProjectLogDoc] 会議後結果追記: ${data.meetingDate}`);
    return true;
  } catch (error) {
    console.error('[ProjectLogDoc] 会議後結果追記エラー:', error);
    return false;
  }
}

// ========================================
// テキストビルダー
// ========================================

function buildInitialContent(projectName: string): string {
  const now = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  return `${projectName} - プロジェクトログ\n\n作成日: ${now}\nこのドキュメントはNodeMapが自動管理するプロジェクトの正史です。\n会議ごとにアジェンダ・議事録・決定事項が記録されます。\n\n${'═'.repeat(50)}\n\n`;
}

function buildPreMeetingAgendaContent(data: AgendaData): string {
  const lines: string[] = [];
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(data.meetingDate + 'T00:00:00+09:00');
  const dayName = dayNames[d.getDay()];

  lines.push(`━━ ${data.meetingDate}（${dayName}）${data.meetingTitle} ━━`);
  lines.push('');

  // ▶ 事前アジェンダ
  lines.push('▶ 事前アジェンダ（自動生成）');
  lines.push('');

  // 意思決定ログ
  lines.push('【意思決定ログ】');
  if (data.decisions.length > 0) {
    for (const dec of data.decisions) {
      lines.push(`${dec.title}: ${dec.decision_content}（${dec.created_at.slice(0, 10)}）`);
      lines.push('');
    }
  } else {
    lines.push('（なし）');
    lines.push('');
  }

  // 未対応リスト（ネイティブチェックボックス対応: 行頭に優先度アイコン、インデントなし）
  lines.push('【未対応事項】');
  if (data.openIssues.length > 0) {
    for (const issue of data.openIssues) {
      const priorityIcon = issue.priority_level === 'critical' ? '🔴' : issue.priority_level === 'high' ? '🟠' : '⚪';
      lines.push(`${priorityIcon} ${issue.title}（${issue.days_stagnant}日経過）`);
      if (issue.description) lines.push(`  → ${issue.description}`);
      lines.push('');
    }
  } else {
    lines.push('（なし）');
    lines.push('');
  }

  // MS進捗
  lines.push('【マイルストーン進捗】');
  if (data.milestones.length > 0) {
    for (const ms of data.milestones) {
      const statusLabel = ms.status === 'achieved' ? '✅達成' : ms.status === 'missed' ? '❌未達' : ms.status === 'in_progress' ? '🔄進行中' : '⏳未開始';
      const dueDateStr = ms.target_date ? `期限: ${ms.target_date}` : '';
      const doneTasks = ms.tasks.filter(t => t.status === 'done').length;
      const totalTasks = ms.tasks.length;
      lines.push(`${statusLabel} ${ms.title} (${doneTasks}/${totalTasks}完了) ${dueDateStr}`);

      for (const task of ms.tasks) {
        const taskIcon = task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🔄' : '⬜';
        const assignee = task.assignee_name ? `[${task.assignee_name}]` : '';
        lines.push(`  ${taskIcon} ${assignee} ${task.title}`);
        if (task.progress_summary) {
          lines.push(`    💬 ${task.progress_summary}`);
        }
        for (const doc of task.related_docs) {
          lines.push(`    📎 ${doc.title}: ${doc.url}`);
        }
      }
      lines.push('');
    }
  } else {
    lines.push('（マイルストーンなし）');
    lines.push('');
  }

  // 前回会議からの持ち越し議題
  lines.push('【前回からの持ち越し議題】');
  if (data.previousMeetingSummary) {
    lines.push(data.previousMeetingSummary);
  } else {
    lines.push('（なし）');
  }
  lines.push('');

  // 会議メモ（手動記入欄）
  lines.push('▶ 会議メモ（参加者が直接記入）');
  lines.push('');
  lines.push('（ここに会議中のメモを記入してください）');
  lines.push('');
  lines.push('');

  // ★ 会議後追記エリア（AI解析結果が入る場所のプレースホルダ）
  // analyze後に appendPostMeetingResults で追記される

  lines.push('────────────────────────────────────');
  lines.push('');

  return lines.join('\n');
}

function buildPostMeetingContent(data: PostMeetingData): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('▶ AI解析結果（自動生成）');
  lines.push('');

  // 要約
  if (data.summary) {
    lines.push('【要約】');
    lines.push(data.summary);
    lines.push('');
  }

  // 決定事項
  lines.push('【決定事項】');
  if (data.decisions.length > 0) {
    for (const dec of data.decisions) {
      lines.push(`✅ ${dec.title}: ${dec.decision_content}`);
      if (dec.rationale) lines.push(`  理由: ${dec.rationale}`);
      lines.push('');
    }
  } else {
    lines.push('（なし）');
    lines.push('');
  }

  // タスク提案
  lines.push('【タスク提案】');
  if (data.taskSuggestions.length > 0) {
    for (const task of data.taskSuggestions) {
      const assignee = task.assignee ? `[${task.assignee}]` : '';
      const due = task.due_date ? `期限: ${task.due_date}` : '';
      const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '⚪';
      lines.push(`${priority} ${assignee} ${task.title} ${due}`);
      lines.push('');
    }
  } else {
    lines.push('（なし）');
    lines.push('');
  }

  // MS提案
  if (data.milestoneSuggestions.length > 0) {
    lines.push('【マイルストーン提案】');
    for (const ms of data.milestoneSuggestions) {
      lines.push(`🎯 ${ms.title}${ms.target_date ? ` (${ms.target_date})` : ''}`);
      if (ms.success_criteria) lines.push(`  達成条件: ${ms.success_criteria}`);
      lines.push('');
    }
  }

  // 未確定事項（ネイティブチェックボックス対応: 行頭に優先度アイコン、インデントなし）
  lines.push('【未確定事項】');
  if (data.openIssues.length > 0) {
    for (const issue of data.openIssues) {
      const priority = issue.priority === 'critical' ? '🔴' : issue.priority === 'high' ? '🟠' : '⚪';
      lines.push(`${priority} ${issue.title}`);
      if (issue.description) lines.push(`  ${issue.description}`);
      lines.push('');
    }
  } else {
    lines.push('（なし）');
    lines.push('');
  }

  return lines.join('\n');
}

function buildFullMeetingSection(data: PostMeetingData): string {
  const lines: string[] = [];
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(data.meetingDate + 'T00:00:00+09:00');
  const dayName = dayNames[d.getDay()];

  lines.push(`━━ ${data.meetingDate}（${dayName}）${data.meetingTitle} ━━`);
  // buildPostMeetingContent は先頭に空行を含むため、ここでは追加不要
  lines.push(buildPostMeetingContent(data));
  lines.push('────────────────────────────────────');
  lines.push('');

  return lines.join('\n');
}

// ========================================
// Google Docs API 操作
// ========================================

/**
 * 挿入テキストに対する書式リクエストを生成
 * insertIndex: テキスト挿入開始位置、text: 挿入テキスト全体
 */
function buildFormattingRequests(insertIndex: number, text: string): Array<Record<string, unknown>> {
  const requests: Array<Record<string, unknown>> = [];
  const checkboxRequests: Array<Record<string, unknown>> = [];
  const lines = text.split('\n');
  let currentIndex = insertIndex;
  let inOpenIssuesSection = false;

  // 見出し4 対象の行頭絵文字（未確定事項セクション以外）
  const HEADING4_PREFIXES = ['✅', '🔴', '🟡', '⚪', '🎯'];
  // チェックボックス対象の行頭絵文字（未確定事項セクション内）
  const ISSUE_PREFIXES = ['🔴', '🟠', '⚪'];

  for (const line of lines) {
    const lineLen = line.length;
    if (lineLen > 0) {
      const trimmed = line.trimStart();

      // 未確定事項/未対応事項セクションの追跡
      if (trimmed.startsWith('【未確定事項】') || trimmed.startsWith('【未対応事項】')) {
        inOpenIssuesSection = true;
      } else if (trimmed.startsWith('【') && !trimmed.startsWith('【未確定') && !trimmed.startsWith('【未対応')) {
        inOpenIssuesSection = false;
      }

      // 日付ヘッダー: ━━ で始まる行 → 見出し1
      if (line.startsWith('━━ ')) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: currentIndex, endIndex: currentIndex + lineLen },
            paragraphStyle: { namedStyleType: 'HEADING_1' },
            fields: 'namedStyleType',
          },
        });
      }
      // セクション見出し: ▶ で始まる行 → 12pt 太字（見出しではなくテキストスタイル維持）
      else if (line.startsWith('▶ ')) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: currentIndex, endIndex: currentIndex + lineLen },
            textStyle: { bold: true, fontSize: { magnitude: 12, unit: 'PT' } },
            fields: 'bold,fontSize',
          },
        });
      }
      // カテゴリ見出し: 【...】で始まる行 → 見出し2
      else if (trimmed.startsWith('【')) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: currentIndex, endIndex: currentIndex + lineLen },
            paragraphStyle: { namedStyleType: 'HEADING_2' },
            fields: 'namedStyleType',
          },
        });
      }
      // 未確定事項セクション内: 優先度アイコンで始まるインデントなし行 → ネイティブチェックボックス
      else if (inOpenIssuesSection && line === trimmed && ISSUE_PREFIXES.some(p => line.startsWith(p))) {
        checkboxRequests.push({
          createParagraphBullets: {
            range: { startIndex: currentIndex, endIndex: currentIndex + lineLen + 1 },
            bulletPreset: 'BULLET_CHECKBOX',
          },
        });
      }
      // アイテム行（✅ 🔴 🟡 ⚪ 🎯）: 未確定事項以外 → 見出し4
      else if (!inOpenIssuesSection && line === trimmed && HEADING4_PREFIXES.some(p => line.startsWith(p))) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: currentIndex, endIndex: currentIndex + lineLen },
            paragraphStyle: { namedStyleType: 'HEADING_4' },
            fields: 'namedStyleType',
          },
        });
      }
      // セパレータ: ──── → グレー色
      else if (line.startsWith('────')) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: currentIndex, endIndex: currentIndex + lineLen },
            textStyle: {
              foregroundColor: { color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } },
            },
            fields: 'foregroundColor',
          },
        });
      }
    }
    currentIndex += lineLen + 1; // +1 for \n
  }

  // チェックボックスリクエストは他の書式設定の後に追加（段落スタイルとの競合回避）
  requests.push(...checkboxRequests);

  return requests;
}

/**
 * ドキュメントの先頭（タイトルの次）にテキストを挿入 + 書式適用
 */
async function batchUpdateDoc(
  accessToken: string,
  documentId: string,
  text: string
): Promise<boolean> {
  try {
    // まずドキュメントの現在の内容を取得
    const docRes = await docsFetch(accessToken, `/documents/${documentId}`);
    if (!docRes.ok) return false;
    const doc = await docRes.json();

    // タイトルの後の挿入位置を特定
    // ドキュメントの最初のセパレータ（═）の後、または本文の先頭
    let insertIndex = 1; // デフォルト: ドキュメント先頭
    const body = doc.body?.content || [];

    for (const element of body) {
      if (element.paragraph) {
        const paraText = element.paragraph.elements
          ?.map((e: { textRun?: { content?: string } }) => e.textRun?.content || '')
          .join('') || '';

        if (paraText.includes('═')) {
          // セパレータの次の位置に挿入
          insertIndex = element.endIndex;
          break;
        }
      }
    }

    // テキスト挿入リクエスト
    const requests: Array<Record<string, unknown>> = [
      {
        insertText: {
          location: { index: insertIndex },
          text: text,
        },
      },
    ];

    // 書式設定リクエストを追加
    const formattingRequests = buildFormattingRequests(insertIndex, text);
    requests.push(...formattingRequests);

    const updateRes = await docsFetch(accessToken, `/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '');
      console.error('[ProjectLogDoc] batchUpdate失敗:', updateRes.status, errText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[ProjectLogDoc] batchUpdate エラー:', error);
    return false;
  }
}

/**
 * 指定位置にテキストを挿入
 */
async function insertTextAtPosition(
  accessToken: string,
  documentId: string,
  index: number,
  text: string
): Promise<boolean> {
  try {
    const requests: Array<Record<string, unknown>> = [
      {
        insertText: {
          location: { index },
          text,
        },
      },
    ];

    // 書式設定リクエストを追加
    const formattingRequests = buildFormattingRequests(index, text);
    requests.push(...formattingRequests);

    const updateRes = await docsFetch(accessToken, `/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });

    return updateRes.ok;
  } catch (error) {
    console.error('[ProjectLogDoc] insertTextAtPosition エラー:', error);
    return false;
  }
}

/**
 * ドキュメント内のテキスト位置を検索
 */
function findTextPosition(doc: Record<string, unknown>, searchText: string, startFrom = 0): number {
  const body = (doc.body as { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> }; startIndex?: number }> })?.content || [];

  for (const element of body) {
    if (element.paragraph && (element.startIndex || 0) >= startFrom) {
      const paraText = element.paragraph.elements
        ?.map((e: { textRun?: { content?: string } }) => e.textRun?.content || '')
        .join('') || '';

      const pos = paraText.indexOf(searchText);
      if (pos >= 0) {
        return (element.startIndex || 0) + pos;
      }
    }
  }

  return -1;
}

/**
 * ドキュメント末尾のインデックスを取得
 */
function getDocEndIndex(doc: Record<string, unknown>): number {
  const body = (doc.body as { content?: Array<{ endIndex?: number }> })?.content || [];
  if (body.length === 0) return 1;
  return (body[body.length - 1].endIndex || 1) - 1;
}

// ========================================
// データ収集ヘルパー（アジェンダ生成用）
// ========================================

/**
 * プロジェクトの事前アジェンダに必要な全データを収集
 */
export async function collectAgendaData(
  projectId: string,
  meetingDate: string,
  userId: string
): Promise<AgendaData | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  try {
    // プロジェクト情報
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();
    if (!project) return null;

    // 並列取得
    const [
      decisionsResult,
      openIssuesResult,
      milestonesResult,
      previousMeetingResult,
    ] = await Promise.all([
      // 意思決定ログ（active、直近10件）
      supabase
        .from('decision_log')
        .select('title, decision_content, created_at')
        .eq('project_id', projectId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10),

      // 未対応リスト（open/stale）
      supabase
        .from('open_issues')
        .select('title, description, priority_level, days_stagnant')
        .eq('project_id', projectId)
        .in('status', ['open', 'stale'])
        .order('priority_score', { ascending: false })
        .limit(15),

      // マイルストーン（pending/in_progress）
      supabase
        .from('milestones')
        .select('id, title, status, target_date')
        .eq('project_id', projectId)
        .in('status', ['pending', 'in_progress'])
        .order('target_date', { ascending: true })
        .limit(5),

      // 前回の会議録（最新1件）
      supabase
        .from('meeting_records')
        .select('ai_summary, title, meeting_date')
        .eq('project_id', projectId)
        .eq('processed', true)
        .order('meeting_date', { ascending: false })
        .limit(1)
        .single(),
    ]);

    // マイルストーンごとのタスクを取得
    const milestones = milestonesResult.data || [];
    const msWithTasks = await Promise.all(
      milestones.map(async (ms) => {
        // タスク一覧
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, status, assigned_contact_id')
          .eq('milestone_id', ms.id)
          .neq('status', 'done')
          .order('due_date', { ascending: true })
          .limit(10);

        const taskDetails = await Promise.all(
          (tasks || []).map(async (task) => {
            // 担当者名
            let assigneeName: string | null = null;
            if (task.assigned_contact_id) {
              const { data: contact } = await supabase
                .from('contact_persons')
                .select('name')
                .eq('id', task.assigned_contact_id)
                .single();
              assigneeName = contact?.name || null;
            }

            // タスク会話からの最新進捗（直近3件の会話を要約として取得）
            let progressSummary: string | null = null;
            try {
              const { data: conversations } = await supabase
                .from('task_conversations')
                .select('message, role')
                .eq('task_id', task.id)
                .order('created_at', { ascending: false })
                .limit(3);

              if (conversations && conversations.length > 0) {
                // ユーザーの最新メッセージを進捗メモとして使用
                const userMessages = conversations
                  .filter((c: { role: string }) => c.role === 'user')
                  .map((c: { message: string }) => c.message);
                if (userMessages.length > 0) {
                  progressSummary = userMessages[0].slice(0, 200);
                }
              }
            } catch {
              // 会話取得失敗は無視
            }

            // 関連資料
            let relatedDocs: { title: string; url: string }[] = [];
            try {
              const { data: docs } = await supabase
                .from('drive_documents')
                .select('title, url')
                .eq('task_id', task.id)
                .limit(3);
              relatedDocs = (docs || []).map((d: { title: string; url: string }) => ({
                title: d.title || '資料',
                url: d.url || '',
              }));
            } catch {
              // 資料取得失敗は無視
            }

            return {
              title: task.title,
              status: task.status,
              assignee_name: assigneeName,
              progress_summary: progressSummary,
              related_docs: relatedDocs,
            };
          })
        );

        return {
          title: ms.title,
          status: ms.status,
          target_date: ms.target_date,
          tasks: taskDetails,
        };
      })
    );

    // 前回会議からの持ち越し議題
    let previousMeetingSummary: string | null = null;
    if (previousMeetingResult.data?.ai_summary) {
      previousMeetingSummary = `前回（${previousMeetingResult.data.meeting_date}）: ${previousMeetingResult.data.ai_summary.slice(0, 300)}`;
    }

    return {
      projectName: project.name,
      meetingDate,
      meetingTitle: '定例会議',
      decisions: decisionsResult.data || [],
      openIssues: openIssuesResult.data || [],
      milestones: msWithTasks,
      previousMeetingSummary,
    };
  } catch (error) {
    console.error('[ProjectLogDoc] データ収集エラー:', error);
    return null;
  }
}

// ========================================
// カレンダーイベントにDocリンクを貼付
// ========================================

/**
 * 会議イベントのdescriptionにプロジェクトログDocのリンクを追加
 */
export async function addDocLinkToCalendarEvent(
  userId: string,
  calendarEventId: string,
  documentUrl: string,
  existingDescription?: string
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;

  try {
    const docLink = `\n\n📋 プロジェクトログ: ${documentUrl}`;
    const description = existingDescription
      ? (existingDescription.includes('プロジェクトログ') ? existingDescription : existingDescription + docLink)
      : docLink.trim();

    const updateRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description }),
      }
    );

    return updateRes.ok;
  } catch (error) {
    console.error('[ProjectLogDoc] カレンダーリンク貼付エラー:', error);
    return false;
  }
}
