// src/lib/caseConverter.ts
// BugFix⑨: snake_case / camelCase 変換の共通ユーティリティ
// 全nodemapサービスで重複していた変換ロジックを一元化

/**
 * snake_case → camelCase 変換
 * 例: "user_id" → "userId", "created_at" → "createdAt"
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * camelCase → snake_case 変換
 * 例: "userId" → "user_id", "createdAt" → "created_at"
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * オブジェクトのキーを snake_case → camelCase に一括変換
 * DB行 → TypeScript型 の変換に使用
 */
export function rowToCamelCase<T extends Record<string, unknown>>(
  row: Record<string, unknown>
): T {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    result[snakeToCamel(key)] = row[key];
  }
  return result as T;
}

/**
 * オブジェクトのキーを camelCase → snake_case に一括変換
 * TypeScript型 → DB行 の変換に使用
 */
export function objectToSnakeCase(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[camelToSnake(key)] = obj[key];
  }
  return result;
}

/**
 * 配列内の全オブジェクトを snake_case → camelCase に変換
 */
export function rowsToCamelCase<T extends Record<string, unknown>>(
  rows: Record<string, unknown>[]
): T[] {
  return rows.map((row) => rowToCamelCase<T>(row));
}
