// v6.0: Gemini会議メモパーサー
// Google Meet「メモを取る」機能が生成する構造化テキストを
// NodeMapのAnalysisResult形式に変換する（AI不要、テキストパースのみ）

export interface AnalysisTopic {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

export interface ActionItem {
  title: string;
  assignee: string;
  context: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  related_topics: string[];
}

export interface AIDetectedOpenIssue {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface AIResolvedIssue {
  issue_title: string;
  resolution_note: string;
}

export interface AIDetectedDecision {
  title: string;
  decision_content: string;
  rationale: string;
}

export interface GeminiAnalysisResult {
  summary: string;
  topics: AnalysisTopic[];
  milestone_feedback: null;
  action_items: ActionItem[];
  new_open_issues: AIDetectedOpenIssue[];
  resolved_issues: AIResolvedIssue[];
  new_decisions: AIDetectedDecision[];
  goal_suggestions: [];
}

// ---- メインパーサー ----

export function parseGeminiNotes(rawText: string): GeminiAnalysisResult {
  const result: GeminiAnalysisResult = {
    summary: '',
    topics: [],
    milestone_feedback: null,
    action_items: [],
    new_open_issues: [],
    resolved_issues: [],
    new_decisions: [],
    goal_suggestions: [],
  };

  // v7.0: Gemini Docsの垂直タブ(\u000b)や特殊空白を通常の改行に正規化
  const text = rawText
    .replace(/\u000b/g, '\n')        // 垂直タブ → 改行
    .replace(/\u000c/g, '\n')        // フォームフィード → 改行
    .replace(/\r\n/g, '\n')          // Windows改行 → Unix改行
    .replace(/\r/g, '\n')            // CR → LF
    .replace(/\n{3,}/g, '\n\n');     // 3つ以上の連続改行を2つに圧縮

  // セクション分割
  const sections = splitSections(text);

  // 1. まとめ → summary
  if (sections.summary) {
    result.summary = sections.summary.trim();
  }

  // 2. 詳細 → topics + decisions + open_issues
  if (sections.details) {
    const { topics, decisions, openIssues } = parseDetails(sections.details);
    result.topics = topics;
    result.new_decisions = decisions;
    result.new_open_issues = openIssues;
  }

  // 3. 推奨される次のステップ → action_items
  if (sections.nextSteps) {
    result.action_items = parseNextSteps(sections.nextSteps);
  }

  return result;
}

// ---- セクション分割 ----

interface GeminiSections {
  summary: string;
  details: string;
  nextSteps: string;
  raw: string;
}

function splitSections(text: string): GeminiSections {
  const sections: GeminiSections = {
    summary: '',
    details: '',
    nextSteps: '',
    raw: text,
  };

  // セクション見出しパターン（Gemini出力のバリエーション対応）
  const summaryPattern = /(?:^|\n)(?:まとめ|要約|サマリー|Summary)\s*\n/i;
  const detailsPattern = /(?:^|\n)(?:詳細|Details|詳細メモ)\s*\n/i;
  const nextStepsPattern = /(?:^|\n)(?:推奨される次のステップ|次のステップ|アクションアイテム|Next Steps|Action Items)\s*\n/i;

  const summaryMatch = text.match(summaryPattern);
  const detailsMatch = text.match(detailsPattern);
  const nextStepsMatch = text.match(nextStepsPattern);

  // 各セクションの開始位置を特定
  const positions: { name: keyof GeminiSections; index: number }[] = [];
  if (summaryMatch?.index !== undefined) positions.push({ name: 'summary', index: summaryMatch.index + summaryMatch[0].length });
  if (detailsMatch?.index !== undefined) positions.push({ name: 'details', index: detailsMatch.index + detailsMatch[0].length });
  if (nextStepsMatch?.index !== undefined) positions.push({ name: 'nextSteps', index: nextStepsMatch.index + nextStepsMatch[0].length });

  // 位置順にソート
  positions.sort((a, b) => a.index - b.index);

  // 各セクションのテキストを抽出
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = i + 1 < positions.length
      ? text.lastIndexOf('\n', positions[i + 1].index - 1)
      : text.length;
    sections[positions[i].name] = text.slice(start, end).trim();
  }

  // セクション見出しがない場合のフォールバック
  if (!sections.summary && !sections.details && !sections.nextSteps) {
    // テキスト全体をsummaryとして扱う
    sections.summary = text.trim();
  }

  return sections;
}

// ---- 詳細セクションのパース ----

function parseDetails(text: string): {
  topics: AnalysisTopic[];
  decisions: AIDetectedDecision[];
  openIssues: AIDetectedOpenIssue[];
} {
  const topics: AnalysisTopic[] = [];
  const decisions: AIDetectedDecision[] = [];
  const openIssues: AIDetectedOpenIssue[] = [];

  // 箇条書き項目を分割（* または - で始まる行をグルーピング）
  const items = splitBulletItems(text);

  for (const item of items) {
    // タイムスタンプを除去して本文を取得
    const cleanText = item.replace(/\(__\d{2}:\d{2}:\d{2}__\)/g, '').trim();
    if (!cleanText) continue;

    // トピックタイトルを抽出（最初の文 or コロン前）
    const titleMatch = cleanText.match(/^(.+?)[:：。]/);
    const title = titleMatch ? titleMatch[1].trim() : cleanText.slice(0, 80);
    const body = titleMatch ? cleanText.slice(titleMatch[0].length).trim() : '';

    // 決定事項の検出キーワード
    const decisionKeywords = ['決定', '合意', '方針', '決まった', '採用', '進める', '確定'];
    const isDecision = decisionKeywords.some(kw => cleanText.includes(kw));

    // 未確定事項の検出キーワード
    const openIssueKeywords = ['検討', '未定', '課題', '要確認', '今後', '懸念', '懐疑'];
    const isOpenIssue = openIssueKeywords.some(kw => cleanText.includes(kw)) && !isDecision;

    // トピックとして登録
    topics.push({
      title,
      options: [],
      decision: isDecision ? body || cleanText : null,
      status: isDecision ? 'completed' : 'active',
    });

    // 決定事項としても登録
    if (isDecision) {
      decisions.push({
        title,
        decision_content: body || cleanText,
        rationale: extractRationale(cleanText),
      });
    }

    // 未確定事項としても登録
    if (isOpenIssue) {
      openIssues.push({
        title,
        description: body || cleanText,
        priority: 'medium',
      });
    }
  }

  return { topics, decisions, openIssues };
}

// ---- 次のステップのパース ----

function parseNextSteps(text: string): ActionItem[] {
  const items = splitBulletItems(text);
  const actionItems: ActionItem[] = [];

  for (const item of items) {
    const cleanText = item.trim();
    if (!cleanText) continue;

    // [担当者名] タスク内容 のパターン
    // Geminiの形式: "* [伸二鈴木] バナーLP担当: ..."
    const assigneeMatch = cleanText.match(/^\[(.+?)\]\s*(.+)/);

    let assignee = '';
    let taskText = cleanText;

    if (assigneeMatch) {
      assignee = assigneeMatch[1].trim();
      taskText = assigneeMatch[2].trim();
    } else {
      // 「担当者名:」形式
      const colonMatch = cleanText.match(/^(.+?)[：:]\s*(.+)/);
      if (colonMatch) {
        // 最初の部分が名前っぽいか判定（短い文字列 = 名前の可能性）
        if (colonMatch[1].length <= 20) {
          assignee = colonMatch[1].trim();
          taskText = colonMatch[2].trim();
        }
      }
    }

    // 複数の担当者をカンマで分割（例: "[Ayaka Taniguchi, 福田遼太郎]"）
    const assignees = assignee.includes(',')
      ? assignee.split(',').map(a => a.trim())
      : [assignee];

    // 期限の検出
    const dueDate = extractDueDate(taskText);

    // 優先度の推定
    const priority = estimatePriority(taskText);

    // 担当者ごとにアクションアイテムを作成
    for (const a of assignees) {
      actionItems.push({
        title: taskText.replace(/[:：].*$/, '').trim().slice(0, 100) || taskText.slice(0, 100),
        assignee: a,
        context: taskText,
        due_date: dueDate,
        priority,
        related_topics: [],
      });
    }
  }

  // 同じ担当者のタスクを集約
  return mergeByAssignee(actionItems);
}

// ---- ユーティリティ ----

function splitBulletItems(text: string): string[] {
  // * または - で始まる箇条書きを分割
  const lines = text.split('\n');
  const items: string[] = [];
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[*\-•]\s/.test(trimmed)) {
      if (current) items.push(current);
      current = trimmed.replace(/^[*\-•]\s+/, '');
    } else if (trimmed && current) {
      current += ' ' + trimmed;
    }
  }
  if (current) items.push(current);

  return items;
}

function extractRationale(text: string): string {
  // 「ため」「から」「により」等の理由表現を含む部分を抽出
  const patterns = [/(?:ため|から|により|に基づき|を踏まえ|の観点から)(.{0,100})/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return '';
}

function extractDueDate(text: string): string | null {
  // 日付パターン: YYYY-MM-DD, MM/DD, M月D日, 水曜日まで, 来週, 1週間後
  const now = new Date();

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // M月D日
  const jpMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (jpMatch) {
    const month = parseInt(jpMatch[1]);
    const day = parseInt(jpMatch[2]);
    const year = month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 曜日まで（水曜日まで → 次の水曜日）
  const dayOfWeekMap: Record<string, number> = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0 };
  const dowMatch = text.match(/(月|火|水|木|金|土|日)曜(?:日)?(?:まで|の夜まで)/);
  if (dowMatch) {
    const targetDay = dayOfWeekMap[dowMatch[1]];
    const diff = (targetDay - now.getDay() + 7) % 7 || 7;
    const target = new Date(now);
    target.setDate(target.getDate() + diff);
    return target.toISOString().split('T')[0];
  }

  // N日後、N日以内
  const daysMatch = text.match(/(\d+)日(?:後|以内)/);
  if (daysMatch) {
    const target = new Date(now);
    target.setDate(target.getDate() + parseInt(daysMatch[1]));
    return target.toISOString().split('T')[0];
  }

  // 1週間後、来週
  if (text.includes('1週間後') || text.includes('来週')) {
    const target = new Date(now);
    target.setDate(target.getDate() + 7);
    return target.toISOString().split('T')[0];
  }

  return null;
}

function estimatePriority(text: string): 'high' | 'medium' | 'low' {
  const highKeywords = ['急', '至急', '最優先', '早急', 'ASAP', '重要', '必須', 'まず'];
  const lowKeywords = ['余裕', '時間がある時', '可能であれば', 'いつか'];

  if (highKeywords.some(kw => text.includes(kw))) return 'high';
  if (lowKeywords.some(kw => text.includes(kw))) return 'low';
  return 'medium';
}

function mergeByAssignee(items: ActionItem[]): ActionItem[] {
  const byAssignee = new Map<string, ActionItem[]>();
  for (const item of items) {
    const key = item.assignee || '__unassigned__';
    const list = byAssignee.get(key) || [];
    list.push(item);
    byAssignee.set(key, list);
  }

  const merged: ActionItem[] = [];
  for (const [, group] of byAssignee) {
    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      // 同じ担当者の複数タスクを集約
      const titles = group.map(g => g.title);
      const contexts = group.map(g => g.context);
      const topics = group.flatMap(g => g.related_topics);
      const dates = group.map(g => g.due_date).filter(Boolean) as string[];
      const priorities = group.map(g => g.priority);

      merged.push({
        title: titles.join('、').slice(0, 100),
        assignee: group[0].assignee,
        context: contexts.join('\n'),
        due_date: dates.length > 0 ? dates.sort()[0] : null,
        priority: priorities.includes('high') ? 'high' : priorities.includes('medium') ? 'medium' : 'low',
        related_topics: [...new Set(topics)],
      });
    }
  }

  return merged;
}
