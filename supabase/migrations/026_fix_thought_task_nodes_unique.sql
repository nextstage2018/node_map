-- 026: thought_task_nodes に UNIQUE制約を追加
-- UPSERT (ON CONFLICT) が動作するために必要
CREATE UNIQUE INDEX IF NOT EXISTS uq_thought_task_nodes_task_node
  ON thought_task_nodes(task_id, node_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_thought_task_nodes_seed_node
  ON thought_task_nodes(seed_id, node_id) WHERE seed_id IS NOT NULL;

-- thought_edges にも同様のUNIQUE制約を追加
CREATE UNIQUE INDEX IF NOT EXISTS uq_thought_edges_task_from_to
  ON thought_edges(task_id, from_node_id, to_node_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_thought_edges_seed_from_to
  ON thought_edges(seed_id, from_node_id, to_node_id) WHERE seed_id IS NOT NULL;
