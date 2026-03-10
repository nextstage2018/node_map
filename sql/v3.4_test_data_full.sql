-- ============================================
-- v3.4 フルテストデータ投入
-- 対象PJ: d5f5502f-476c-4423-ad98-525fbecb8ffc（テスト2）
-- 会議録 → 検討ツリー → ノード → open_issues/decision_log 紐づけ
-- ============================================

DO $$
DECLARE
  v_project_id UUID := 'd5f5502f-476c-4423-ad98-525fbecb8ffc';
  v_user_id TEXT;
  v_meeting_id UUID;
  v_tree_id UUID;
  v_node_topic1 UUID;
  v_node_topic2 UUID;
  v_node_option1 UUID;
  v_node_decision1 UUID;
  v_node_action1 UUID;
  v_node_option2 UUID;
  v_old_decision_id UUID;
BEGIN
  -- ユーザーID取得
  SELECT owner_user_id INTO v_user_id FROM contact_persons LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := 'test-user';
  END IF;

  RAISE NOTICE 'ユーザー: %', v_user_id;

  -- ============================================
  -- 1. 会議録を作成
  -- ============================================
  INSERT INTO meeting_records (
    id, project_id, user_id, title, meeting_date, source_type,
    content, ai_summary, participants, meeting_start_at, meeting_end_at
  ) VALUES (
    gen_random_uuid(), v_project_id, v_user_id,
    'プロジェクトキックオフMTG',
    '2026-03-03',
    'text',
    '参加者: 鈴木、田中、佐藤' || chr(10) || chr(10) ||
    '議題1: ターゲット層について' || chr(10) ||
    '- 鈴木: 30代女性をメインターゲットにしたい' || chr(10) ||
    '- 田中: 市場調査の結果、30代女性の購買意欲が最も高い' || chr(10) ||
    '- 佐藤: 賛成。ペルソナを具体化しよう' || chr(10) ||
    '→ 決定: 30代女性をメインターゲットとする' || chr(10) || chr(10) ||
    '議題2: リリース時期' || chr(10) ||
    '- 鈴木: 6月末を目標にしたい' || chr(10) ||
    '- 田中: 開発チームの見積もりだと6月末はギリギリ' || chr(10) ||
    '- 佐藤: バッファを見て7月中旬が安全では？' || chr(10) ||
    '→ 未決定: 次回MTGで最終判断' || chr(10) || chr(10) ||
    '議題3: 技術スタック' || chr(10) ||
    '- 田中: Next.js + Tailwind CSSを提案' || chr(10) ||
    '→ 決定: Next.js + Tailwind CSS採用' || chr(10) || chr(10) ||
    '議題4: 予算配分' || chr(10) ||
    '- 鈴木: 広告費とコンテンツ制作費の比率は？' || chr(10) ||
    '→ 未決定: クライアント確認後に再議論',
    '## キックオフMTG サマリー\n- ターゲット: 30代女性に決定\n- 技術: Next.js + Tailwind CSS採用\n- リリース: 6月末 or 7月中旬（未決定）\n- 予算配分: クライアント確認待ち（未決定）',
    '[{"name": "鈴木"}, {"name": "田中"}, {"name": "佐藤"}]'::jsonb,
    '2026-03-03 14:00:00+09',
    '2026-03-03 15:30:00+09'
  )
  RETURNING id INTO v_meeting_id;

  RAISE NOTICE '会議録作成: %', v_meeting_id;

  -- ============================================
  -- 2. 検討ツリー（ルート）を作成
  -- ============================================
  INSERT INTO decision_trees (id, project_id, title, description)
  VALUES (gen_random_uuid(), v_project_id, 'テスト2 検討ツリー', 'キックオフMTGから生成')
  RETURNING id INTO v_tree_id;

  RAISE NOTICE '検討ツリー作成: %', v_tree_id;

  -- ============================================
  -- 3. 検討ツリーノードを作成（2議題 × 子ノード）
  -- ============================================

  -- 議題1: ターゲット層について
  INSERT INTO decision_tree_nodes (id, tree_id, parent_node_id, title, node_type, status, description, source_meeting_id, sort_order)
  VALUES (gen_random_uuid(), v_tree_id, NULL, 'ターゲット層の選定', 'topic', 'active', '誰をメインターゲットにするか', v_meeting_id, 1)
  RETURNING id INTO v_node_topic1;

    -- 選択肢: 30代女性
    INSERT INTO decision_tree_nodes (id, tree_id, parent_node_id, title, node_type, status, description, source_meeting_id, sort_order)
    VALUES (gen_random_uuid(), v_tree_id, v_node_topic1, '30代女性', 'option', 'active', '購買意欲が最も高い層', v_meeting_id, 1)
    RETURNING id INTO v_node_option1;

      -- 決定: メインターゲット確定
      INSERT INTO decision_tree_nodes (id, tree_id, parent_node_id, title, node_type, status, description, source_meeting_id, sort_order)
      VALUES (gen_random_uuid(), v_tree_id, v_node_option1, 'メインターゲットに決定', 'decision', 'completed', '市場調査結果に基づき決定', v_meeting_id, 1)
      RETURNING id INTO v_node_decision1;

        -- アクション: ペルソナ具体化
        INSERT INTO decision_tree_nodes (id, tree_id, parent_node_id, title, node_type, status, description, source_meeting_id, sort_order)
        VALUES (gen_random_uuid(), v_tree_id, v_node_decision1, 'ペルソナを具体化する', 'action', 'active', '次回MTGまでに佐藤が作成', v_meeting_id, 1)
        RETURNING id INTO v_node_action1;

  -- 議題2: リリース時期・技術・予算
  INSERT INTO decision_tree_nodes (id, tree_id, parent_node_id, title, node_type, status, description, source_meeting_id, sort_order)
  VALUES (gen_random_uuid(), v_tree_id, NULL, 'プロジェクト計画', 'topic', 'active', 'リリース時期・技術選定・予算', v_meeting_id, 2)
  RETURNING id INTO v_node_topic2;

    -- 選択肢: リリース時期
    INSERT INTO decision_tree_nodes (id, tree_id, parent_node_id, title, node_type, status, description, source_meeting_id, sort_order)
    VALUES (gen_random_uuid(), v_tree_id, v_node_topic2, 'リリース時期の検討', 'option', 'on_hold', '6月末 vs 7月中旬で未決定', v_meeting_id, 1)
    RETURNING id INTO v_node_option2;

    -- 選択肢: 技術スタック（決定済み）
    INSERT INTO decision_tree_nodes (id, tree_id, parent_node_id, title, node_type, status, description, source_meeting_id, sort_order)
    VALUES (gen_random_uuid(), v_tree_id, v_node_topic2, 'Next.js + Tailwind CSS', 'decision', 'completed', '開発効率とメンテナンス性を考慮して採用', v_meeting_id, 2);

  RAISE NOTICE 'ノード作成完了: topic1=%, topic2=%', v_node_topic1, v_node_topic2;

  -- ============================================
  -- 4. 既存の open_issues / decision_log を削除して再投入
  -- ============================================
  DELETE FROM open_issues WHERE project_id = v_project_id;
  DELETE FROM decision_log WHERE project_id = v_project_id;
  DELETE FROM meeting_agenda WHERE project_id = v_project_id;

  -- ============================================
  -- 5. open_issues（未確定事項）
  -- ============================================
  INSERT INTO open_issues (project_id, user_id, title, description, source_type, priority_level, priority_score, days_stagnant, status, related_decision_node_id, source_meeting_record_id)
  VALUES
    (v_project_id, v_user_id, 'デザインの方向性が未決定', 'ブランドカラーをリニューアルするか現行維持か、クライアント確認待ち', 'meeting', 'high', 76.0, 14, 'open', v_node_topic1, v_meeting_id),
    (v_project_id, v_user_id, '納品形式の確認', 'PDF納品かWeb納品か、先方の社内環境による制約を要確認', 'meeting', 'medium', 45.0, 7, 'open', v_node_topic1, v_meeting_id),
    (v_project_id, v_user_id, '予算配分の調整', '広告費とコンテンツ制作費の配分比率について合意が取れていない', 'meeting', 'critical', 92.0, 25, 'stale', v_node_topic2, v_meeting_id),
    (v_project_id, v_user_id, 'テスト環境の構築方法', 'ステージング環境をAWSかGCPかで検討中', 'channel', 'low', 20.0, 3, 'open', v_node_topic2, NULL),
    (v_project_id, v_user_id, 'リリース時期の最終決定', '6月末か7月中旬か、次回MTGで判断', 'meeting', 'high', 65.0, 7, 'open', v_node_option2, v_meeting_id);

  RAISE NOTICE 'open_issues 5件投入完了';

  -- ============================================
  -- 6. decision_log（意思決定ログ）
  -- ============================================

  -- 決定1: ターゲット層（1週間前）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, source_meeting_record_id, implementation_status, created_at)
  VALUES (v_project_id, v_user_id, 'ターゲット層の決定', '30代女性をメインターゲットとする', '市場調査の結果、30代女性の購買意欲が最も高い', 'active', v_node_topic1, v_meeting_id, 'in_progress', NOW() - INTERVAL '7 days');

  -- 決定2a: リリース時期 旧（5日前）→ superseded
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, source_meeting_record_id, implementation_status, created_at)
  VALUES (v_project_id, v_user_id, 'リリース時期', '6月末リリースとする', '開発チームの見積もりに基づく', 'superseded', v_node_option2, v_meeting_id, 'pending', NOW() - INTERVAL '5 days')
  RETURNING id INTO v_old_decision_id;

  -- 決定2b: リリース時期 新（2日前）→ 変更チェーン
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, previous_decision_id, change_reason, implementation_status, created_at)
  VALUES (v_project_id, v_user_id, 'リリース時期', '7月中旬リリースに変更', 'クライアント側の承認プロセスに追加時間が必要', 'active', v_node_option2, v_old_decision_id, 'クライアント都合でスケジュール変更', 'pending', NOW() - INTERVAL '2 days');

  -- 決定3: 技術スタック（3日前）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, source_meeting_record_id, implementation_status, created_at)
  VALUES (v_project_id, v_user_id, '使用フレームワーク', 'Next.js + Tailwind CSSを採用', '開発効率とメンテナンス性を考慮', 'active', v_node_topic2, v_meeting_id, 'completed', NOW() - INTERVAL '3 days');

  -- 決定4: 外部API（1日前、保留）
  INSERT INTO decision_log (project_id, user_id, title, decision_content, rationale, status, decision_tree_node_id, implementation_status, created_at)
  VALUES (v_project_id, v_user_id, '外部API連携先', 'Stripe決済を導入予定だが、先方の経理部門確認待ち', '競合比較でStripeが最適と判断', 'on_hold', v_node_topic2, 'pending', NOW() - INTERVAL '1 day');

  RAISE NOTICE 'decision_log 5件投入完了';

  -- ============================================
  -- 7. meeting_agenda（アジェンダ）
  -- ============================================
  INSERT INTO meeting_agenda (project_id, user_id, meeting_date, title, status, items, generated_at, metadata)
  VALUES (
    v_project_id, v_user_id, CURRENT_DATE + INTERVAL '1 day', 'Agenda', 'draft',
    jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'open_issue', 'reference_id', NULL, 'title', 'デザインの方向性が未決定', 'description', '14日経過。クライアント確認待ち', 'priority', 'high', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 10),
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'open_issue', 'reference_id', NULL, 'title', '予算配分の調整（停滞）', 'description', '25日経過。合意が取れていない', 'priority', 'critical', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 15),
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'decision_review', 'reference_id', NULL, 'title', '【確認】リリース時期変更', 'description', '7月中旬リリースに変更（実行状況: pending）', 'priority', 'medium', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 5),
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'task_progress', 'reference_id', NULL, 'title', 'ペルソナ具体化', 'description', '佐藤担当・次回MTGまで', 'priority', 'medium', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 5),
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'custom', 'reference_id', NULL, 'title', '次回ミーティング日程調整', 'description', '全員の予定を確認', 'priority', 'low', 'assigned_contact_id', NULL, 'discussed', false, 'resolution_note', NULL, 'estimated_minutes', 3)
    ),
    NOW(),
    '{"total_estimated_minutes": 38, "item_count": 5}'::jsonb
  )
  ON CONFLICT (project_id, meeting_date) DO UPDATE SET
    items = EXCLUDED.items, generated_at = EXCLUDED.generated_at, metadata = EXCLUDED.metadata;

  RAISE NOTICE 'meeting_agenda 投入完了';
  RAISE NOTICE '=== 全テストデータ投入完了 ===';
END $$;

-- ============================================
-- 確認クエリ
-- ============================================

-- 会議録
SELECT id, title, meeting_date FROM meeting_records
WHERE project_id = 'd5f5502f-476c-4423-ad98-525fbecb8ffc' ORDER BY created_at DESC LIMIT 3;

-- 検討ツリーノード（ツリー構造確認）
SELECT n.id, n.title, n.node_type, n.status, n.parent_node_id
FROM decision_tree_nodes n
JOIN decision_trees t ON t.id = n.tree_id
WHERE t.project_id = 'd5f5502f-476c-4423-ad98-525fbecb8ffc'
ORDER BY n.sort_order;

-- 未確定事項（ノード紐づけ確認）
SELECT oi.title, oi.status, oi.priority_level, oi.days_stagnant, n.title AS node_title
FROM open_issues oi
LEFT JOIN decision_tree_nodes n ON n.id = oi.related_decision_node_id
WHERE oi.project_id = 'd5f5502f-476c-4423-ad98-525fbecb8ffc';

-- 決定ログ（変更チェーン確認）
SELECT dl.title, dl.status, dl.implementation_status, dl.previous_decision_id IS NOT NULL AS has_chain, n.title AS node_title
FROM decision_log dl
LEFT JOIN decision_tree_nodes n ON n.id = dl.decision_tree_node_id
WHERE dl.project_id = 'd5f5502f-476c-4423-ad98-525fbecb8ffc'
ORDER BY dl.created_at;
