-- ============================================
-- v3.4 テストデータ投入
-- 既存のプロジェクト・ノードを自動参照
-- ============================================

-- 事前確認: 対象プロジェクトとノードを表示
-- SELECT p.id AS project_id, p.name AS project_name
-- FROM projects p LIMIT 5;
--
-- SELECT n.id AS node_id, n.title, n.node_type, n.tree_id
-- FROM decision_tree_nodes n LIMIT 10;

-- ============================================
-- 1. open_issues（未確定事項）テストデータ
-- ============================================
DO $$
DECLARE
  v_project_id UUID;
  v_user_id TEXT;
  v_node_id1 UUID;
  v_node_id2 UUID;
BEGIN
  -- 最新プロジェクトを取得
  SELECT id INTO v_project_id FROM projects ORDER BY created_at DESC LIMIT 1;
  IF v_project_id IS NULL THEN
    RAISE NOTICE 'プロジェクトが見つかりません。スキップします。';
    RETURN;
  END IF;

  -- ユーザーID
  v_user_id := current_setting('request.jwt.claims', true)::json->>'sub';
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM projects WHERE id = v_project_id;
  END IF;
  IF v_user_id IS NULL THEN
    v_user_id := (SELECT owner_user_id FROM contact_persons LIMIT 1);
  END IF;

  -- 検討ツリーノードを2つ取得（あれば）
  SELECT n.id INTO v_node_id1
  FROM decision_tree_nodes n
  JOIN decision_trees t ON t.id = n.tree_id
  WHERE t.project_id = v_project_id
  ORDER BY n.created_at ASC LIMIT 1;

  SELECT n.id INTO v_node_id2
  FROM decision_tree_nodes n
  JOIN decision_trees t ON t.id = n.tree_id
  WHERE t.project_id = v_project_id AND n.id != COALESCE(v_node_id1, '00000000-0000-0000-0000-000000000000')
  ORDER BY n.created_at ASC LIMIT 1;

  RAISE NOTICE 'プロジェクト: %, ノード1: %, ノード2: %', v_project_id, v_node_id1, v_node_id2;

  -- open_issues 5件
  INSERT INTO open_issues (project_id, user_id, title, description, source_type, priority_level, priority_score, days_stagnant, status, related_decision_node_id)
  VALUES
    (v_project_id, v_user_id, 'デザインの方向性が未決定', 'ブランドカラーをリニューアルするか現行維持か、クライアント確認待ち', 'meeting', 'high', 76.0, 14, 'open', v_node_id1),
    (v_project_id, v_user_id, '納品形式の確認', 'PDF納品かWeb納品か、先方の社内環境による制約を要確認', 'meeting', 'medium', 45.0, 7, 'open', v_node_id1),
    (v_project_id, v_user_id, '予算配分の調整', '広告費とコンテンツ制作費の配分比率について合意が取れていない', 'meeting', 'critical', 92.0, 25, 'stale', v_node_id2),
    (v_project_id, v_user_id, 'テスト環境の構築方法', 'ステージング環境をAWSかGCPかで検討中', 'channel', 'low', 20.0, 3, 'open', v_node_id2),
    (v_project_id, v_user_id, 'ロゴ配置の最終確認', 'ヘッダー左寄せ vs 中央配置、先方デザインチームと合意済み', 'meeting', 'low', 10.0, 0, 'resolved', v_node_id1)
  ON CONFLICT (project_id, title, source_type) DO NOTHING;

  RAISE NOTICE 'open_issues 投入完了';

  -- ============================================
  -- 2. decision_log（意思決定ログ）テストデータ
  -- ============================================

  -- 既存テストデータを削除（再実行対応）
  DELETE FROM decision_log WHERE project_id = v_project_id AND title IN ('ターゲット層の決定', 'リリース時期', '使用フレームワーク', '外部API連携先');

  -- 決定1: 初回決定（1週間前）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, implementation_status, created_at)
  VALUES
    (v_project_id, v_user_id, 'ターゲット層の決定', '30代女性をメインターゲットとする', '市場調査の結果、30代女性の購買意欲が最も高い', 'active', v_node_id1, 'in_progress', NOW() - INTERVAL '7 days');

  -- 決定2a: 旧決定（5日前）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, implementation_status, created_at)
  VALUES
    (v_project_id, v_user_id, 'リリース時期', '6月末リリースとする', '開発チームの見積もりに基づく', 'superseded', v_node_id2, 'pending', NOW() - INTERVAL '5 days');

  -- 決定2b: 新決定（変更チェーン、2日前）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, previous_decision_id, implementation_status, created_at)
  VALUES
    (v_project_id, v_user_id, 'リリース時期', '7月中旬リリースに変更', 'クライアント側の承認プロセスに追加時間が必要', 'active', v_node_id2,
     (SELECT id FROM decision_log WHERE project_id = v_project_id AND title = 'リリース時期' AND status = 'superseded' ORDER BY created_at DESC LIMIT 1),
     'pending', NOW() - INTERVAL '2 days');

  -- 決定3: 独立した決定（3日前）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, implementation_status, created_at)
  VALUES
    (v_project_id, v_user_id, '使用フレームワーク', 'Next.js + Tailwind CSSを採用', '開発効率とメンテナンス性を考慮', 'active', v_node_id1, 'completed', NOW() - INTERVAL '3 days');

  -- 決定4: 保留中（1日前）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, implementation_status, created_at)
  VALUES
    (v_project_id, v_user_id, '外部API連携先', 'Stripe決済を導入予定だが、先方の経理部門確認待ち', '競合比較でStripeが最適と判断', 'on_hold', v_node_id2, 'pending', NOW() - INTERVAL '1 day');

  RAISE NOTICE 'decision_log 投入完了';

  -- ============================================
  -- 3. meeting_agenda（アジェンダ）テストデータ
  -- ============================================
  INSERT INTO meeting_agenda (project_id, user_id, meeting_date, title, status, items, generated_at, metadata)
  VALUES
    (v_project_id, v_user_id, CURRENT_DATE + INTERVAL '1 day', 'Agenda', 'draft',
     jsonb_build_array(
       jsonb_build_object('id', gen_random_uuid()::text, 'type', 'open_issue', 'reference_id', NULL, 'title', 'デザインの方向性が未決定', 'description', '14日経過。クライアント確認待ち', 'priority', 'high', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 10),
       jsonb_build_object('id', gen_random_uuid()::text, 'type', 'open_issue', 'reference_id', NULL, 'title', '予算配分の調整（停滞）', 'description', '25日経過。合意が取れていない', 'priority', 'critical', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 15),
       jsonb_build_object('id', gen_random_uuid()::text, 'type', 'decision_review', 'reference_id', NULL, 'title', '【確認】リリース時期変更', 'description', '7月中旬リリースに変更（実行状況: pending）', 'priority', 'medium', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 5),
       jsonb_build_object('id', gen_random_uuid()::text, 'type', 'task_progress', 'reference_id', NULL, 'title', 'ワイヤーフレーム作成', 'description', '期限: 2026-03-15', 'priority', 'medium', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 5),
       jsonb_build_object('id', gen_random_uuid()::text, 'type', 'custom', 'reference_id', NULL, 'title', '次回ミーティング日程調整', 'description', '全員の予定を確認', 'priority', 'low', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 3)
     ),
     NOW(),
     '{"total_estimated_minutes": 38, "item_count": 5}'::jsonb
    )
  ON CONFLICT (project_id, meeting_date) DO UPDATE SET
    items = EXCLUDED.items,
    generated_at = EXCLUDED.generated_at,
    metadata = EXCLUDED.metadata;

  RAISE NOTICE 'meeting_agenda 投入完了';
  RAISE NOTICE '=== 全テストデータ投入完了 ===';
END $$;

-- ============================================
-- 投入結果の確認クエリ
-- ============================================

-- 未確定事項
SELECT id, title, status, priority_level, priority_score, days_stagnant, related_decision_node_id
FROM open_issues
ORDER BY created_at DESC LIMIT 10;

-- 決定ログ（変更チェーン含む）
SELECT id, title, status, implementation_status, previous_decision_id, decision_tree_node_id,
       created_at
FROM decision_log
ORDER BY created_at DESC LIMIT 10;

-- アジェンダ
SELECT id, project_id, meeting_date, status, jsonb_array_length(items) AS item_count,
       metadata->>'total_estimated_minutes' AS est_minutes
FROM meeting_agenda
ORDER BY meeting_date DESC LIMIT 5;
