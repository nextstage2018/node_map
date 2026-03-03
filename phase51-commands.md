# Phase 51 実装手順（手動実行用）

VMのディスク容量不足のため、以下の手順でMacのターミナルから実装を進めてください。

---

## Step 0: git ブランチ作成
```bash
cd ~/Desktop/node_map_git
git checkout -b feature/phase-51-smart-feedback-loops
```

## Step 1: DBマイグレーションファイル作成
ファイル: `supabase/migrations/051a_data_connectivity.sql`

```sql
-- Phase 51a: データ双方向リンク基盤

-- メモ→種のバックリンク
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES idea_memos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_seeds_memo_id ON seeds(memo_id);
```

## Step 2以降は Claude が直接ファイルに書き込みます
（VMのディスク容量が回復次第）
