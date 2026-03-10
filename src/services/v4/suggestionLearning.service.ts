// v4.0: AI提案学習サービス
// 承認/却下の履歴を集計し、次の提案精度を向上させるフィードバックループ
// パターン参考: src/lib/services/evaluationLearning.service.ts

import { getServerSupabase, getSupabase } from '@/lib/supabase';

interface SuggestionRecord {
  id: string;
  status: string; // 'accepted' | 'dismissed'
  suggestions: {
    items?: Array<{
      title: string;
      assignee?: string;
      priority?: string;
      related_topic?: string;
    }>;
  };
  created_at: string;
}

interface LearningContext {
  totalAccepted: number;
  totalDismissed: number;
  acceptanceRate: number;
  // 却下されやすいキーワードパターン
  dismissedPatterns: string[];
  // 承認されやすいキーワードパターン
  acceptedPatterns: string[];
  // プロンプト注入用テキスト
  contextText: string;
}

// アクション系キーワード（提案のタイトルから特徴を抽出）
const PATTERN_KEYWORDS = [
  '確認', '送付', '連絡', '報告', '検討', '提案', '作成', '準備',
  '調査', '分析', '整理', '共有', '手配', '対応', '修正', '更新',
];

/**
 * ユーザーの承認/却下パターンを集計し、学習コンテキストを生成
 */
export async function getSuggestionLearningContext(
  userId: string
): Promise<LearningContext | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  try {
    // 直近30件の確定済み提案を取得
    const { data: records, error } = await supabase
      .from('task_suggestions')
      .select('id, status, suggestions, created_at')
      .eq('user_id', userId)
      .in('status', ['accepted', 'dismissed'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !records || records.length < 5) {
      // 学習データが少なすぎる場合はスキップ
      return null;
    }

    const suggestions = records as SuggestionRecord[];
    const accepted = suggestions.filter(s => s.status === 'accepted');
    const dismissed = suggestions.filter(s => s.status === 'dismissed');

    const totalAccepted = accepted.length;
    const totalDismissed = dismissed.length;
    const acceptanceRate = totalAccepted / (totalAccepted + totalDismissed);

    // キーワードごとの承認/却下率を計算
    const keywordStats: Record<string, { accepted: number; dismissed: number }> = {};

    for (const kw of PATTERN_KEYWORDS) {
      keywordStats[kw] = { accepted: 0, dismissed: 0 };
    }

    for (const record of suggestions) {
      const items = record.suggestions?.items || [];
      for (const item of items) {
        const title = item.title || '';
        for (const kw of PATTERN_KEYWORDS) {
          if (title.includes(kw)) {
            if (record.status === 'accepted') {
              keywordStats[kw].accepted++;
            } else {
              keywordStats[kw].dismissed++;
            }
          }
        }
      }
    }

    // 却下率70%以上のパターンを抽出
    const dismissedPatterns: string[] = [];
    const acceptedPatterns: string[] = [];

    for (const [kw, stats] of Object.entries(keywordStats)) {
      const total = stats.accepted + stats.dismissed;
      if (total < 3) continue; // サンプル少なすぎ
      const dismissRate = stats.dismissed / total;
      if (dismissRate >= 0.7) {
        dismissedPatterns.push(kw);
      } else if (dismissRate <= 0.3) {
        acceptedPatterns.push(kw);
      }
    }

    // プロンプト注入用テキスト生成
    const lines: string[] = [];
    lines.push(`タスク提案の採択傾向（直近${suggestions.length}件）:`);
    lines.push(`- 全体承認率: ${Math.round(acceptanceRate * 100)}%`);

    if (dismissedPatterns.length > 0) {
      lines.push(`- 却下されやすいタスク: 「${dismissedPatterns.join('」「')}」を含むもの → これらは提案しない`);
    }
    if (acceptedPatterns.length > 0) {
      lines.push(`- 承認されやすいタスク: 「${acceptedPatterns.join('」「')}」を含むもの → 積極的に提案`);
    }

    // 却下されたタスクの具体例（最新3件）
    const recentDismissed = dismissed.slice(0, 3);
    if (recentDismissed.length > 0) {
      lines.push('- 最近却下された例:');
      for (const d of recentDismissed) {
        const items = d.suggestions?.items || [];
        for (const item of items) {
          lines.push(`  × 「${item.title}」`);
        }
      }
    }

    const contextText = lines.join('\n');

    return {
      totalAccepted,
      totalDismissed,
      acceptanceRate,
      dismissedPatterns,
      acceptedPatterns,
      contextText,
    };
  } catch (error) {
    console.error('[SuggestionLearning] 学習コンテキスト取得エラー:', error);
    return null;
  }
}

/**
 * メッセージテキストが却下されやすいパターンに該当するか判定
 * true = 提案を抑制すべき
 */
export async function shouldSuppressSuggestion(
  userId: string,
  messageText: string
): Promise<boolean> {
  const context = await getSuggestionLearningContext(userId);
  if (!context) return false;

  // 却下パターンに該当するかチェック
  const matchedDismissed = context.dismissedPatterns.filter(p => messageText.includes(p));
  const matchedAccepted = context.acceptedPatterns.filter(p => messageText.includes(p));

  // 却下パターンにのみ該当する場合は抑制
  if (matchedDismissed.length > 0 && matchedAccepted.length === 0) {
    console.log(`[SuggestionLearning] 提案抑制: 却下パターン「${matchedDismissed.join('、')}」に該当`);
    return true;
  }

  return false;
}
