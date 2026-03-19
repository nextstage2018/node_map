// JST日付ユーティリティ
// Vercel(UTC)環境でもJST基準の日付を正しく扱うためのヘルパー

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 現在のJST日付をYYYY-MM-DD形式で返す
 */
export function getTodayJST(): string {
  return toJSTDateString(new Date());
}

/**
 * DateオブジェクトをJST基準のYYYY-MM-DD文字列に変換
 * new Date().toISOString().split('T')[0] の代わりに使う
 */
export function toJSTDateString(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 現在のJSTのDateオブジェクト（UTC内部値をJSTにシフト）
 * getUTCFullYear/getUTCMonth/getUTCDate/getUTCDay でJSTの値が取れる
 */
export function getJSTNow(): Date {
  return new Date(Date.now() + JST_OFFSET_MS);
}

/**
 * JST基準でN日後のYYYY-MM-DD文字列を返す
 */
export function addDaysJST(days: number, base?: Date): string {
  const jst = base ? new Date(base.getTime() + JST_OFFSET_MS) : getJSTNow();
  jst.setUTCDate(jst.getUTCDate() + days);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

/**
 * JST基準で次の指定曜日のYYYY-MM-DD文字列を返す
 * dayOfWeek: 0=日, 1=月, ..., 5=金, 6=土
 */
export function getNextWeekdayJST(dayOfWeek: number): string {
  const jst = getJSTNow();
  const current = jst.getUTCDay();
  let daysUntil = dayOfWeek - current;
  if (daysUntil <= 0) daysUntil += 7;
  jst.setUTCDate(jst.getUTCDate() + daysUntil);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

/**
 * JST基準で今週末（金曜日）のYYYY-MM-DD文字列を返す
 */
export function getThisWeekFridayJST(): string {
  const jst = getJSTNow();
  const current = jst.getUTCDay();
  let daysUntilFriday = 5 - current;
  if (daysUntilFriday < 0) daysUntilFriday += 7;
  jst.setUTCDate(jst.getUTCDate() + daysUntilFriday);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}
