'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { KNOWLEDGE_DOMAIN_CONFIG } from '@/lib/constants';
import type { NodeData, NodeType, UnderstandingLevel, ThinkingLog, CreateThinkingLogRequest } from '@/lib/types';
import Button from '@/components/ui/Button';
import ThinkingLogInput from '@/components/thinking/ThinkingLogInput';
import ThinkingLogTimeline from '@/components/thinking/ThinkingLogTimeline';

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  keyword: 'キーワード',
  person: '人物',
  project: 'プロジェクト',
};

const UNDERSTANDING_LEVELS: { key: UnderstandingLevel; label: string; color: string; width: string }[] = [
  { key: 'recognition', label: '認知', color: 'bg-slate-400', width: 'w-1/3' },
  { key: 'understanding', label: '理解', color: 'bg-blue-500', width: 'w-2/3' },
  { key: 'mastery', label: '習熟', color: 'bg-green-500', width: 'w-full' },
];

const NODE_TYPES: { key: NodeType; label: string }[] = [
  { key: 'keyword', label: 'キーワード' },
  { key: 'person', label: '人物' },
  { key: 'project', label: 'プロジェクト' },
];

interface NodeDetailPanelProps {
  node: NodeData | null;
  onClose: () => void;
  onNodeUpdated: (node: NodeData) => void;
  onNodeDeleted: (nodeId: string) => void;
}

export default function NodeDetailPanel({
  node,
  onClose,
  onNodeUpdated,
  onNodeDeleted,
}: NodeDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState<NodeType>('keyword');
  const [editLevel, setEditLevel] = useState<UnderstandingLevel>('recognition');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 30: 思考ログ
  const [thinkingLogs, setThinkingLogs] = useState<ThinkingLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [showThinkingLogs, setShowThinkingLogs] = useState(false);

  // 思考ログ取得
  const fetchThinkingLogs = useCallback(async (nodeId: string) => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/thinking-logs?linkedNodeId=${nodeId}`);
      const data = await res.json();
      if (data.success) {
        setThinkingLogs(data.data);
      }
    } catch {
      // サイレント
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  // 思考ログ作成
  const handleCreateLog = useCallback(async (req: CreateThinkingLogRequest) => {
    if (!node) return;
    setIsSubmittingLog(true);
    try {
      const res = await fetch('/api/thinking-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...req,
          linkedNodeId: node.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setThinkingLogs((prev) => [data.data, ...prev]);
      }
    } catch {
      // サイレント
    } finally {
      setIsSubmittingLog(false);
    }
  }, [node]);

  // 思考ログ削除
  const handleDeleteLog = useCallback(async (logId: string) => {
    try {
      const res = await fetch(`/api/thinking-logs?logId=${logId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setThinkingLogs((prev) => prev.filter((l) => l.id !== logId));
      }
    } catch {
      // サイレント
    }
  }, []);

  // 思考ログ編集（簡易: 内容更新）
  const handleEditLog = useCallback(async (log: ThinkingLog) => {
    const newContent = prompt('思考ログを編集', log.content);
    if (newContent === null || newContent === log.content) return;
    try {
      const res = await fetch('/api/thinking-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: log.id, content: newContent }),
      });
      const data = await res.json();
      if (data.success) {
        setThinkingLogs((prev) => prev.map((l) => (l.id === log.id ? data.data : l)));
      }
    } catch {
      // サイレント
    }
  }, []);

  // ノード変更時に編集フォームを初期化
  useEffect(() => {
    if (node) {
      setEditLabel(node.label);
      setEditType(node.type);
      setEditLevel(node.understandingLevel);
      setIsEditing(false);
      setShowDeleteConfirm(false);
      setError(null);
      // 思考ログをリセット
      setThinkingLogs([]);
      setShowThinkingLogs(false);
    }
  }, [node]);

  if (!node) return null;

  const currentLevel = UNDERSTANDING_LEVELS.find((l) => l.key === node.understandingLevel)
    || UNDERSTANDING_LEVELS[0];
  const domainConfig = node.domainId ? KNOWLEDGE_DOMAIN_CONFIG[node.domainId] : null;

  const handleSave = async () => {
    if (!editLabel.trim()) {
      setError('ラベルを入力してください');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/nodes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: node.id,
          label: editLabel.trim(),
          type: editType,
          understandingLevel: editLevel,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || '更新に失敗しました');
        return;
      }

      onNodeUpdated(json.data);
      setIsEditing(false);
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/nodes?nodeId=${node.id}`, {
        method: 'DELETE',
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || '削除に失敗しました');
        return;
      }

      onNodeDeleted(node.id);
      onClose();
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">ノード詳細</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ラベルとタイプ */}
        {!isEditing ? (
          <div>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <h4 className="text-base font-bold text-slate-900">{node.label}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                    node.type === 'keyword' ? 'bg-blue-50 text-blue-700' :
                    node.type === 'person' ? 'bg-amber-50 text-amber-700' :
                    'bg-green-50 text-green-700'
                  )}>
                    {NODE_TYPE_LABELS[node.type]}
                  </span>
                  {domainConfig && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${domainConfig.color}15`,
                        color: domainConfig.color,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: domainConfig.color }}
                      />
                      {domainConfig.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="shrink-0 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                編集
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 編集: ラベル */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">ラベル</label>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 編集: タイプ */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">タイプ</label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {NODE_TYPES.map((nt) => (
                  <button
                    key={nt.key}
                    onClick={() => setEditType(nt.key)}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all',
                      editType === nt.key
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {nt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 編集: 理解度 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">理解度</label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {UNDERSTANDING_LEVELS.map((level) => (
                  <button
                    key={level.key}
                    onClick={() => setEditLevel(level.key)}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all',
                      editLevel === level.key
                        ? `bg-white text-slate-800 shadow-sm`
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 編集ボタン群 */}
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !editLabel.trim()}
              >
                {isSaving ? '保存中...' : '保存'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditLabel(node.label);
                  setEditType(node.type);
                  setEditLevel(node.understandingLevel);
                  setError(null);
                }}
              >
                キャンセル
              </Button>
            </div>
          </div>
        )}

        {/* 理解度バー */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">理解度</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', currentLevel.color, currentLevel.width)}
              />
            </div>
            <span className="text-xs font-medium text-slate-600">{currentLevel.label}</span>
          </div>
        </div>

        {/* 統計情報（1列に統合） */}
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-xs text-slate-500">インタラクション回数</div>
          <div className="text-lg font-bold text-slate-900 mt-0.5">
            {node.interactionCount ?? node.frequency ?? 0}回
          </div>
        </div>

        {/* 日付情報 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
            <span className="text-xs text-slate-500">初回出現</span>
            <span className="text-xs font-medium text-slate-700">{formatDate(node.firstSeenAt)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
            <span className="text-xs text-slate-500">最終出現</span>
            <span className="text-xs font-medium text-slate-700">{formatDate(node.lastSeenAt)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
            <span className="text-xs text-slate-500">登録日</span>
            <span className="text-xs font-medium text-slate-700">{formatDate(node.createdAt)}</span>
          </div>
        </div>

        {/* ドメイン/フィールド情報 */}
        {(node.domainId || node.fieldId) && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">分類</label>
            <div className="space-y-1">
              {domainConfig && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: domainConfig.color }}
                  />
                  ドメイン: {domainConfig.name}
                </div>
              )}
              {node.fieldId && (
                <div className="text-xs text-slate-500 ml-3.5">
                  フィールド: {node.fieldId}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 出現コンテキスト */}
        {node.sourceContexts && node.sourceContexts.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">出現コンテキスト</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {node.sourceContexts.slice(0, 10).map((ctx, i) => (
                <div key={i} className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="font-medium text-slate-600">
                    {ctx.sourceType === 'message' ? 'メッセージ' :
                     ctx.sourceType === 'task_conversation' ? 'タスク会話' :
                     ctx.sourceType === 'task_ideation' ? '構想' : '結果'}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>{formatDate(ctx.timestamp)}</span>
                </div>
              ))}
              {node.sourceContexts.length > 10 && (
                <div className="text-[10px] text-slate-400 pt-1">
                  他 {node.sourceContexts.length - 10} 件
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phase 30: 思考ログセクション */}
        <div className="border-t border-slate-100 pt-4">
          <button
            onClick={() => {
              const next = !showThinkingLogs;
              setShowThinkingLogs(next);
              if (next && thinkingLogs.length === 0 && node) {
                fetchThinkingLogs(node.id);
              }
            }}
            className="flex items-center justify-between w-full text-left"
          >
            <label className="text-xs font-semibold text-slate-500">
              思考ログ
            </label>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${showThinkingLogs ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showThinkingLogs && (
            <div className="mt-3 space-y-3">
              <ThinkingLogInput
                defaultLinkedNodeId={node.id}
                onSubmit={handleCreateLog}
                isSubmitting={isSubmittingLog}
              />
              <ThinkingLogTimeline
                logs={thinkingLogs}
                onEdit={handleEditLog}
                onDelete={handleDeleteLog}
                isLoading={isLoadingLogs}
              />
            </div>
          )}
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        {/* 削除 */}
        <div className="border-t border-slate-100 pt-4">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              このノードを削除...
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-xs text-red-700">
                「{node.label}」を削除しますか？この操作は取り消せません。
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="!bg-red-600 hover:!bg-red-700"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? '削除中...' : '削除する'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
