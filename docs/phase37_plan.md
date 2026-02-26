# Phase 37: 組織チャネル紐づけ＋メンバー管理

## 概要
組織にSlack/Chatwork/メールドメインを紐づけ、そのチャネルの参加者を自動でメンバーとして検出・追加する機能。

---

## 1. DBマイグレーション（SQLファイル作成のみ）

### 新テーブル: `organization_channels`
- organization_id (FK → organizations)
- service_name ('slack' / 'chatwork' / 'email')
- channel_id (SlackチャネルID / ChatworkルームID / メールドメイン)
- channel_name (表示名)
- channel_type, is_active, user_id
- UNIQUE(organization_id, service_name, channel_id)

### contact_personsに追加
- `auto_added_to_org BOOLEAN DEFAULT false`

---

## 2. API（4つ）

| API | 内容 |
|---|---|
| `/api/organizations/[id]/channels` GET/POST/DELETE | チャネル紐づけ |
| `/api/organizations/[id]/members` GET/POST/DELETE | メンバー管理 |
| `/api/organizations/[id]/detect-members` POST | 手動でメンバー自動検出 |
| `/api/organizations/[id]` PUT | 組織情報の編集 |

### 自動検出ロジック
1. organization_channels を取得
2. inbox_messages を検索（Slack=slackChannel, CW=chatworkRoomId, Email=ドメイン一致）
3. 送信者 → contact_persons と照合
4. 未紐づけコンタクトを即追加 + auto_added_to_org = true

---

## 3. UI変更

### 組織一覧ページ（既存修正）
- カードクリックで詳細ページに遷移

### 組織詳細ページ（新規: `/organizations/[id]`）
3タブ: 基本情報 / チャネル / メンバー

---

## 4. ファイル一覧

### 新規作成
- sql/037_phase37_organization_channels.sql
- src/app/api/organizations/[id]/channels/route.ts
- src/app/api/organizations/[id]/members/route.ts
- src/app/api/organizations/[id]/detect-members/route.ts
- src/app/organizations/[id]/page.tsx
- src/components/organizations/ChannelLinkModal.tsx
- src/components/organizations/MemberAddModal.tsx

### 既存修正
- src/app/organizations/page.tsx
