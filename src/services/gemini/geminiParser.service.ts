// v6.0: Gemini会議メモパーサー
// Google Meet「メモを取る」機能が生成する構造化テキストを
// NodeMapのAnalysisResult形式に変換する（AI不要、テキストパースのみ）

import { toJSTDateString } from '@/lib/dateUtils';

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

  // 1.5. まとめセクションからサブテーマを抽出（検討ツリーの親ノード用）
  const summaryThemes = extractSummaryThemes(sections.summary || '');

  // 2. 詳細 → topics + decisions + open_issues（サブテーマで階層化）
  if (sections.details) {
    const { topics, decisions, openIssues } = parseDetails(sections.details, summaryThemes);
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
  // \s*\n で見出し行末を検出（空行が複数ある場合も対応）
  const summaryPattern = /(?:^|\n)\s*(?:まとめ|要約|サマリー|Summary)\s*\n/i;
  const detailsPattern = /(?:^|\n)\s*(?:詳細|Details|詳細メモ)\s*\n/i;
  const nextStepsPattern = /(?:^|\n)\s*(?:推奨される次のステップ|次のステップ|アクションアイテム|Next Steps|Action Items)\s*\n/i;

  const summaryMatch = text.match(summaryPattern);
  const detailsMatch = text.match(detailsPattern);
  const nextStepsMatch = text.match(nextStepsPattern);

  // 各セクションの開始位置（見出し行の直後）と見出しの開始位置を特定
  const positions: { name: keyof GeminiSections; contentStart: number; headingStart: number }[] = [];
  if (summaryMatch?.index !== undefined) {
    positions.push({ name: 'summary', contentStart: summaryMatch.index + summaryMatch[0].length, headingStart: summaryMatch.index });
  }
  if (detailsMatch?.index !== undefined) {
    positions.push({ name: 'details', contentStart: detailsMatch.index + detailsMatch[0].length, headingStart: detailsMatch.index });
  }
  if (nextStepsMatch?.index !== undefined) {
    positions.push({ name: 'nextSteps', contentStart: nextStepsMatch.index + nextStepsMatch[0].length, headingStart: nextStepsMatch.index });
  }

  // 位置順にソート
  positions.sort((a, b) => a.contentStart - b.contentStart);

  // 各セクションのテキストを抽出（次のセクション見出しの開始位置まで）
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].contentStart;
    const end = i + 1 < positions.length
      ? positions[i + 1].headingStart
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

// ---- まとめセクションからサブテーマを抽出 ----

interface SummaryTheme {
  title: string;
  keywords: string[];
}

function extractSummaryThemes(summaryText: string): SummaryTheme[] {
  if (!summaryText) return [];

  // まとめセクションは段落区切り（\n\n）でサブテーマが分かれている
  // 各サブテーマ: 短いタイトル行 + 説明文
  const paragraphs = summaryText.split(/\n\n+/).filter(p => p.trim().length > 10);

  const themes: SummaryTheme[] = [];

  for (const p of paragraphs) {
    const lines = p.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // 最初の行が短い（80文字以下）かつ段落が複数行 → サブテーマのタイトル
    const firstLine = lines[0];
    if (firstLine.length <= 80 && lines.length >= 2) {
      // 汎用的すぎるテーマ名（「会議の目的」「背景」「概要」等）はスキップ
      const genericPatterns = ['会議の目的', '背景', '概要', '経緯', '前提', 'はじめに', '目的と背景', '議題'];
      const isGeneric = genericPatterns.some(gp => firstLine.includes(gp));
      if (!isGeneric) {
        themes.push({
          title: firstLine,
          keywords: extractKeywordsJP(lines.join(' ')),
        });
      }
    } else if (firstLine.length > 80 && themes.length === 0) {
      // 最初の長い段落 → メインサマリー（テーマとしては使わないがキーワード抽出）
      // スキップ（親テーマにはしない）
    }
  }

  return themes;
}

/**
 * 日本語テキストからキーワードを抽出（簡易版）
 * 名詞的なフレーズを取り出す
 */
function extractKeywordsJP(text: string): string[] {
  // タイムスタンプ除去
  const cleaned = text
    .replace(/\(\d{2}:\d{2}:\d{2}\)/g, '')
    .replace(/[（）()「」『』【】、。・,.:：\n]/g, ' ')
    .replace(/\s+/g, ' ');

  // 2文字以上のカタカナ語、漢字語を抽出
  const katakana = cleaned.match(/[ァ-ヶー]{2,}/g) || [];
  const kanji = cleaned.match(/[一-龥]{2,}/g) || [];
  // 英単語（3文字以上）
  const english = cleaned.match(/[A-Za-z]{3,}/g) || [];

  const keywords = [...katakana, ...kanji, ...english.map(e => e.toLowerCase())];
  return [...new Set(keywords)];
}

// ---- 詳細セクションのパース（階層構造版） ----

interface ParsedDetailItem {
  title: string;
  body: string;
  cleanText: string;
  isDecision: boolean;
  isOpenIssue: boolean;
}

function parseDetails(text: string, summaryThemes: SummaryTheme[]): {
  topics: AnalysisTopic[];
  decisions: AIDetectedDecision[];
  openIssues: AIDetectedOpenIssue[];
} {
  const decisions: AIDetectedDecision[] = [];
  const openIssues: AIDetectedOpenIssue[] = [];

  // 箇条書き項目を分割
  const items = splitBulletItems(text);

  // 各段落をパース
  const parsed: ParsedDetailItem[] = [];
  for (const item of items) {
    const cleanText = item
      .replace(/\(\d{2}:\d{2}:\d{2}\)/g, '')
      .replace(/\(__\d{2}:\d{2}:\d{2}__\)/g, '')
      .trim();
    if (!cleanText) continue;

    const titleMatch = cleanText.match(/^(.+?)[:：。]/);
    const title = titleMatch ? titleMatch[1].trim() : cleanText.slice(0, 80);
    const body = titleMatch ? cleanText.slice(titleMatch[0].length).trim() : '';

    const decisionKeywords = ['決定', '合意', '方針', '決まった', '採用', '進める', '確定'];
    const isDecision = decisionKeywords.some(kw => cleanText.includes(kw));
    const openIssueKeywords = ['検討', '未定', '課題', '要確認', '今後', '懸念', '懐疑'];
    const isOpenIssue = openIssueKeywords.some(kw => cleanText.includes(kw)) && !isDecision;

    parsed.push({ title, body, cleanText, isDecision, isOpenIssue });

    // 決定事項・未確定事項は従来通り
    if (isDecision) {
      decisions.push({
        title,
        decision_content: body || cleanText,
        rationale: extractRationale(cleanText),
      });
    }
    if (isOpenIssue) {
      openIssues.push({
        title,
        description: body || cleanText,
        priority: 'medium',
      });
    }
  }

  // サブテーマがある場合 → 階層構造を構築
  let topics: AnalysisTopic[];
  if (summaryThemes.length >= 2) {
    topics = buildHierarchicalTopics(parsed, summaryThemes);
  } else {
    // サブテーマがない場合 → フラット構造（従来互換）
    topics = parsed.map(p => ({
      title: p.title,
      options: [],
      decision: p.isDecision ? p.body || p.cleanText : null,
      status: p.isDecision ? 'completed' as const : 'active' as const,
    }));
  }

  return { topics, decisions, openIssues };
}

/**
 * サブテーマを親ノードとして、詳細段落をキーワードマッチングで子ノードに振り分け
 * v7.0改善: キーワード特異度（IDF）+ 子ノード過多時の自動サブグルーピング
 */
function buildHierarchicalTopics(
  parsed: ParsedDetailItem[],
  themes: SummaryTheme[]
): AnalysisTopic[] {
  // ステップ1: 全テーマのキーワード出現頻度を計算（IDF的な特異度）
  const keywordThemeCount: Map<string, number> = new Map();
  for (const theme of themes) {
    const uniqueKw = new Set(theme.keywords);
    for (const kw of uniqueKw) {
      keywordThemeCount.set(kw, (keywordThemeCount.get(kw) || 0) + 1);
    }
  }

  // ステップ2: 各詳細段落を最適テーマに振り分け（特異度加重スコアリング）
  const themeChildren: Map<number, ParsedDetailItem[]> = new Map();
  const unmatched: ParsedDetailItem[] = [];

  for (const item of parsed) {
    const itemKeywords = extractKeywordsJP(item.title + ' ' + item.body);

    let bestThemeIdx = -1;
    let bestScore = 0;
    let secondBestScore = 0;

    for (let i = 0; i < themes.length; i++) {
      const score = calculateKeywordOverlapWeighted(themes[i].keywords, itemKeywords, keywordThemeCount, themes.length);
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestThemeIdx = i;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    // 振り分け条件: スコア≥1.5 かつ 2位との差が明確（曖昧な振り分けを防止）
    const scoreDiff = bestScore - secondBestScore;
    if (bestThemeIdx >= 0 && bestScore >= 1.5 && (scoreDiff >= 0.5 || secondBestScore < 1.0)) {
      const children = themeChildren.get(bestThemeIdx) || [];
      children.push(item);
      themeChildren.set(bestThemeIdx, children);
    } else {
      unmatched.push(item);
    }
  }

  // ステップ3: テーマを親ノードとしてトピックを構築
  const topics: AnalysisTopic[] = [];
  const MAX_CHILDREN = 7; // これ以上は自動サブグルーピング

  for (let i = 0; i < themes.length; i++) {
    const children = themeChildren.get(i) || [];

    if (children.length <= MAX_CHILDREN) {
      // 子ノード数が適切 → そのまま
      const hasDecision = children.some(c => c.isDecision);
      topics.push({
        title: themes[i].title,
        options: children.map(c => c.title),
        decision: hasDecision ? children.find(c => c.isDecision)?.body || null : null,
        status: hasDecision ? 'completed' : 'active',
      });
    } else {
      // 子ノードが多すぎる → サブグルーピングで分割
      const subGroups = autoSubGroup(children);
      for (const sg of subGroups) {
        const hasDecision = sg.items.some(c => c.isDecision);
        topics.push({
          title: sg.label,
          options: sg.items.map(c => c.title),
          decision: hasDecision ? sg.items.find(c => c.isDecision)?.body || null : null,
          status: hasDecision ? 'completed' : 'active',
        });
      }
    }
  }

  // ステップ4: 未分類が多すぎる場合もサブグルーピング
  if (unmatched.length > MAX_CHILDREN) {
    const subGroups = autoSubGroup(unmatched);
    for (const sg of subGroups) {
      const hasDecision = sg.items.some(c => c.isDecision);
      topics.push({
        title: sg.label,
        options: sg.items.map(c => c.title),
        decision: hasDecision ? sg.items.find(c => c.isDecision)?.body || null : null,
        status: hasDecision ? 'completed' : 'active',
      });
    }
  } else {
    for (const item of unmatched) {
      topics.push({
        title: item.title,
        options: [],
        decision: item.isDecision ? item.body || item.cleanText : null,
        status: item.isDecision ? 'completed' : 'active',
      });
    }
  }

  return topics;
}

/**
 * 子ノード群をキーワード類似度でサブグループに自動分割
 * 2段階クラスタリング:
 *   1. キーワード類似度で初期グループ形成（種ベース）
 *   2. 大きすぎるグループはキーワード出現頻度の低い語を種に再分割
 */
function autoSubGroup(items: ParsedDetailItem[]): { label: string; items: ParsedDetailItem[] }[] {
  const TARGET_GROUP_SIZE = 5; // 理想的なグループサイズ

  // 各アイテムのキーワードを事前計算
  const itemKws = items.map(item => extractKeywordsJP(item.title + ' ' + item.body));

  // ステップ1: アイテム間の類似度マトリックスを構築
  // キーワード出現頻度（IDF的）を計算
  const kwItemCount: Map<string, number> = new Map();
  for (const kws of itemKws) {
    const unique = new Set(kws);
    for (const kw of unique) {
      kwItemCount.set(kw, (kwItemCount.get(kw) || 0) + 1);
    }
  }

  // ステップ2: 特異度加重の類似度でクラスタリング
  const groups: { label: string; items: ParsedDetailItem[]; seedKws: string[] }[] = [];
  const assigned = new Set<number>();

  // 特異度の高いキーワードを持つアイテムから優先的に種にする
  const itemSpecificity = itemKws.map(kws => {
    let maxSpec = 0;
    for (const kw of kws) {
      const freq = kwItemCount.get(kw) || 1;
      const spec = 1.0 / freq;
      if (spec > maxSpec) maxSpec = spec;
    }
    return maxSpec;
  });

  // 特異度の高い順にソート（インデックスを保持）
  const sortedIndices = items.map((_, i) => i).sort((a, b) => itemSpecificity[b] - itemSpecificity[a]);

  for (const i of sortedIndices) {
    if (assigned.has(i)) continue;

    // 新グループの種（特異度の高いキーワードのみを種に使う）
    const seedKws = itemKws[i].filter(kw => {
      const freq = kwItemCount.get(kw) || 1;
      return freq <= Math.ceil(items.length * 0.5); // 半数以下のアイテムにしか出ないキーワード
    });

    const group = {
      label: items[i].title,
      items: [items[i]],
      seedKws: seedKws.length > 0 ? seedKws : itemKws[i].slice(0, 3), // フォールバック: 最初の3キーワード
    };
    assigned.add(i);

    // 類似アイテムを吸収（特異度加重スコア≥1.5）
    for (const j of sortedIndices) {
      if (assigned.has(j)) continue;
      if (group.items.length >= TARGET_GROUP_SIZE + 2) break; // グループサイズ上限

      let weightedOverlap = 0;
      for (const kw of itemKws[j]) {
        if (group.seedKws.includes(kw)) {
          const freq = kwItemCount.get(kw) || 1;
          // 汎用キーワードは低スコア、固有キーワードは高スコア
          const weight = freq >= items.length * 0.7 ? 0.3 : (1.0 / Math.max(freq, 1));
          weightedOverlap += weight;
        }
      }

      if (weightedOverlap >= 1.5) {
        group.items.push(items[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  // ステップ3: 小さすぎるグループ（1件）は「その他」にまとめる
  const meaningful: typeof groups = [];
  const tiny: ParsedDetailItem[] = [];
  for (const g of groups) {
    if (g.items.length >= 2) {
      meaningful.push(g);
    } else {
      tiny.push(...g.items);
    }
  }

  if (tiny.length > 0) {
    if (tiny.length === 1) {
      meaningful.push({ label: tiny[0].title, items: tiny, seedKws: [] });
    } else if (tiny.length <= TARGET_GROUP_SIZE) {
      meaningful.push({ label: 'その他の議論', items: tiny, seedKws: [] });
    } else {
      // 「その他」も多い場合は複数グループに分割（単純な均等分割）
      const chunkSize = TARGET_GROUP_SIZE;
      for (let k = 0; k < tiny.length; k += chunkSize) {
        const chunk = tiny.slice(k, k + chunkSize);
        meaningful.push({
          label: chunk[0].title,
          items: chunk,
          seedKws: [],
        });
      }
    }
  }

  return meaningful;
}

/**
 * キーワード重複度を計算（特異度加重版）
 * 全テーマに出現する汎用キーワード → 低スコア（0.3）
 * 特定テーマ固有のキーワード → 高スコア（1.0）
 */
function calculateKeywordOverlapWeighted(
  themeKw: string[],
  itemKw: string[],
  keywordThemeCount: Map<string, number>,
  totalThemes: number
): number {
  let score = 0;
  for (const tk of themeKw) {
    for (const ik of itemKw) {
      let matched = false;

      // 部分一致（3文字以上の共通部分）
      if (tk.length >= 3 && ik.length >= 3) {
        if (tk.includes(ik) || ik.includes(tk)) {
          matched = true;
        }
      }
      // 完全一致（2文字以上）
      if (!matched && tk.length >= 2 && tk === ik) {
        matched = true;
      }

      if (matched) {
        // 特異度: このキーワードがいくつのテーマに出現するか
        const themeFreq = keywordThemeCount.get(tk) || 1;
        // 全テーマに出現 → 0.3、1テーマのみ → 1.0
        const specificity = themeFreq >= totalThemes ? 0.3 : (1.0 / themeFreq);
        score += specificity;
        break;
      }
    }
  }
  return score;
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

    // タイトルと詳細を分離（「タスク名: 詳細説明」形式）
    // 最初の文（。で終わる部分）をタイトル、残りを詳細にする
    const titleColonMatch = taskText.match(/^(.+?)[：:]\s*(.+)/s);
    let taskTitle: string;
    let taskDetail: string;
    if (titleColonMatch) {
      taskTitle = titleColonMatch[1].trim().slice(0, 100);
      taskDetail = titleColonMatch[2].trim();
    } else {
      // コロンがない場合、最初の文をタイトル、残りを詳細に
      const sentenceMatch = taskText.match(/^(.+?[。.！!？?])\s*([\s\S]*)/);
      if (sentenceMatch && sentenceMatch[2].trim()) {
        taskTitle = sentenceMatch[1].trim().slice(0, 100);
        taskDetail = sentenceMatch[2].trim();
      } else {
        taskTitle = taskText.slice(0, 100);
        taskDetail = '';  // タイトルと同じ内容は詳細に入れない
      }
    }

    // 期限の検出
    const dueDate = extractDueDate(taskText);

    // 優先度の推定
    const priority = estimatePriority(taskText);

    // 担当者ごとにアクションアイテムを作成
    for (const a of assignees) {
      actionItems.push({
        title: taskTitle,
        assignee: a,
        context: taskDetail,
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
  // まず箇条書き（* - •）で分割を試みる
  const bulletItems = splitByBullets(text);
  if (bulletItems.length > 0) {
    return bulletItems;
  }

  // 箇条書きがない場合 → 段落（空行区切り）で分割
  // Gemini会議メモの「詳細」「推奨される次のステップ」は段落形式が多い
  return splitByParagraphs(text);
}

function splitByBullets(text: string): string[] {
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

function splitByParagraphs(text: string): string[] {
  // 空行（\n\n）で段落を分割
  const paragraphs = text.split(/\n\n+/);
  const items: string[] = [];

  for (const p of paragraphs) {
    // 複数行の段落は1行に結合
    const merged = p.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
    if (merged.length > 5) {  // 短すぎる断片は除外
      items.push(merged);
    }
  }

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
    return toJSTDateString(target);
  }

  // N日後、N日以内
  const daysMatch = text.match(/(\d+)日(?:後|以内)/);
  if (daysMatch) {
    const target = new Date(now);
    target.setDate(target.getDate() + parseInt(daysMatch[1]));
    return toJSTDateString(target);
  }

  // 1週間後、来週
  if (text.includes('1週間後') || text.includes('来週')) {
    const target = new Date(now);
    target.setDate(target.getDate() + 7);
    return toJSTDateString(target);
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
      const contexts = group.map(g => g.context).filter(c => c && c.length > 0);
      const topics = group.flatMap(g => g.related_topics);
      const dates = group.map(g => g.due_date).filter(Boolean) as string[];
      const priorities = group.map(g => g.priority);

      merged.push({
        title: titles.join('、').slice(0, 100),
        assignee: group[0].assignee,
        context: contexts.length > 0 ? contexts.join('\n') : '',
        due_date: dates.length > 0 ? dates.sort()[0] : null,
        priority: priorities.includes('high') ? 'high' : priorities.includes('medium') ? 'medium' : 'low',
        related_topics: [...new Set(topics)],
      });
    }
  }

  return merged;
}
