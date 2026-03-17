-- チャネルサブスクリプション機能を廃止
-- 旧仕様: 設定画面で各ユーザーがチャネルの取得対象を個別に選択
-- 新仕様: プロジェクト > メンバータブでチャネル登録 → 自動取り込み

DROP TABLE IF EXISTS user_channel_subscriptions CASCADE;
