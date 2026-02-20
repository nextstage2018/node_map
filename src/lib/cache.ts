/**
 * サーバーサイドインメモリキャッシュ
 * メッセージやAI要約をキャッシュして再取得を防ぐ
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // ミリ秒
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * キャッシュからデータを取得
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    // TTL超過チェック
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * キャッシュにデータを保存
   * @param ttl ミリ秒（デフォルト5分）
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 特定キーを削除
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * プレフィックスに一致するキーをすべて削除
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * キャッシュの統計情報
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// シングルトン（Vercel Serverless では同一インスタンス内で有効）
const globalCache = globalThis as typeof globalThis & { __appCache?: MemoryCache };
if (!globalCache.__appCache) {
  globalCache.__appCache = new MemoryCache();
}

export const cache = globalCache.__appCache;

// キャッシュキー定数
export const CACHE_KEYS = {
  messages: (page: number) => `messages:page:${page}`,
  allMessages: 'messages:all',
  threadSummary: (messageId: string) => `summary:${messageId}`,
} as const;

// TTL定数
export const CACHE_TTL = {
  messages: 3 * 60 * 1000,        // メッセージ: 3分
  threadSummary: 30 * 60 * 1000,  // AI要約: 30分
} as const;
