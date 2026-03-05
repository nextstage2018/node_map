'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { UnifiedMessage, MessageGroup, Attachment, ChannelType } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import ReplyForm from '@/components/inbox/ReplyForm';
import ChatworkBody from '@/components/inbox/ChatworkBody';

/**
 * Phase 51a: メッセージからタスク化された場合のバックリンクバッジ
 */
function TaskLinkedBadge({ messageId }: { messageId: string }) {
  const [linkedTask, setLinkedTask] = useState<{ id: string; title: string; status: string } | null>(null);

  useEffect(() => {
    const fetchLinkedTask = async () => {
      try {
        const res = await fetch(`/api/tasks?sourceMessageId=${messageId}`);
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          setLinkedTask(json.data[0]);
        }
      } catch { /* ignore */ }
    };
    if (messageId) fetchLinkedTask();
  }, [messageId]);

  if (!linkedTask) return null;

  const statusLabel = linkedTask.status === 'done' ? '完了' : linkedTask.status === 'in_progress' ? '進行中' : '未着手';
  const statusColor = linkedTask.status === 'done' ? 'bg-green-50 text-green-700 border-green-200'
    : linkedTask.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <div className="mx-6 mt-2 shrink-0">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
        <span className="text-xs">✅</span>
        <span className="text-xs font-medium text-emerald-700">タスク化済み</span>
        <a href="/tasks" className="text-xs text-emerald-600 hover:underline truncate max-w-[200px]">
          {linkedTask.title}
        </a>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor}`}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

// リアクション用の絵文字リスト
const REACTION_EMOJIS = [
  { emoji: '👍', name: 'thumbsup', label: 'いいね' },
  { emoji: '❤️', name: 'heart', label: 'ハート' },
  { emoji: '😂', name: 'laughing', label: '笑い' },
  { emoji: '🎉', name: 'tada', label: '祝い' },
  { emoji: '👀', name: 'eyes', label: '確認' },
  { emoji: '🙏', name: 'pray', label: 'お願い' },
  { emoji: '✅', name: 'white_check_mark', label: '了解' },
  { emoji: '🔥', name: 'fire', label: '火' },
];

interface ReactionData {
  id: string;
  message_id: string;
  emoji: string;
  emoji_name: string | null;
  user_name: string;
  created_at: string;
}

/**
 * リアクションピッカー＋表示コンポーネント
 */
function ReactionBar({
  messageId,
  channel,
  existingReactions,
}: {
  messageId: string;
  channel: ChannelType;
  existingReactions?: { name: string; count: number }[];
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [myReactions, setMyReactions] = useState<ReactionData[]>([]);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  // ツール内リアクション取得
  useEffect(() => {
    fetchMyReactions();
  }, [messageId]);

  // ピッカー外クリックで閉じる
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    if (showPicker) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPicker]);

  async function fetchMyReactions() {
    try {
      const res = await fetch(`/api/inbox/reactions?messageId=${encodeURIComponent(messageId)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setMyReactions(data.data);
      }
    } catch {
      // Supabase未設定時は無視
    }
  }

  async function addReaction(emoji: string, emojiName: string) {
    // すでにリアクション済みなら削除
    const existing = myReactions.find(r => r.emoji === emoji);
    if (existing) {
      await removeReaction(emoji, emojiName);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/inbox/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          channel,
          emoji,
          emojiName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchMyReactions();
      }
    } catch (err) {
      console.error('リアクション追加エラー:', err);
    } finally {
      setLoading(false);
      setShowPicker(false);
    }
  }

  async function removeReaction(emoji: string, emojiName?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        messageId,
        emoji,
        channel,
        ...(emojiName ? { emojiName } : {}),
      });
      await fetch(`/api/inbox/reactions?${params}`, { method: 'DELETE' });
      await fetchMyReactions();
    } catch (err) {
      console.error('リアクション削除エラー:', err);
    } finally {
      setLoading(false);
    }
  }

  // APIから取得したリアクション + 外部リアクション を統合
  const mergedReactions = mergeReactions(existingReactions || [], myReactions);

  return (
    <div className="mt-2">
      {/* 統合リアクション表示 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {mergedReactions.map((r) => (
          <button
            key={r.emoji}
            onClick={() => {
              const emojiDef = REACTION_EMOJIS.find(e => e.emoji === r.emoji);
              if (r.isMine) {
                removeReaction(r.emoji, emojiDef?.name);
              } else {
                addReaction(r.emoji, emojiDef?.name || '');
              }
            }}
            disabled={loading}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
              r.isMine
                ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            )}
          >
            {r.emoji} <span className="font-semibold">{r.count}</span>
          </button>
        ))}

        {/* リアクション追加ボタン */}
        <div ref={pickerRef}>
          <button
            ref={buttonRef}
            onClick={() => {
              if (!showPicker && buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setPickerPos({
                  top: rect.top - 140,
                  left: rect.left,
                });
              }
              setShowPicker(!showPicker);
            }}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-dashed border-slate-300 text-slate-400 hover:bg-slate-50 hover:text-slate-600 hover:border-slate-400 transition-colors"
            title="リアクションを追加"
          >
            😀 +
          </button>

          {/* 絵文字ピッカー（fixedポジションで親のoverflowに影響されない） */}
          {showPicker && pickerPos && (
            <div
              className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-lg p-2 min-w-[200px]"
              style={{ top: pickerPos.top, left: pickerPos.left }}
            >
              <div className="text-[10px] text-slate-400 mb-1.5 px-1">リアクションを選択</div>
              <div className="grid grid-cols-4 gap-1">
                {REACTION_EMOJIS.map((item) => {
                  const isActive = myReactions.some(r => r.emoji === item.emoji);
                  return (
                    <button
                      key={item.emoji}
                      onClick={() => addReaction(item.emoji, item.name)}
                      disabled={loading}
                      className={cn(
                        'text-xl p-1.5 rounded-lg hover:bg-slate-100 transition-colors',
                        isActive && 'bg-blue-50 ring-1 ring-blue-300'
                      )}
                      title={item.label}
                    >
                      {item.emoji}
                    </button>
                  );
                })}
              </div>
              {channel === 'slack' && (
                <div className="text-[9px] text-blue-500 mt-1.5 px-1 border-t border-slate-100 pt-1">
                  Slackにも送信されます
                </div>
              )}
              {channel === 'chatwork' && (
                <div className="text-[9px] text-slate-400 mt-1.5 px-1 border-t border-slate-100 pt-1">
                  NodeMap内のみ（Chatwork APIは非対応）
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 外部リアクション（Slackから取得）とツール内リアクションを統合
 */
function mergeReactions(
  external: { name: string; count: number }[],
  internal: ReactionData[]
): { emoji: string; count: number; isMine: boolean }[] {
  const map = new Map<string, { count: number; isMine: boolean }>();

  // 外部リアクション
  for (const r of external) {
    // Slack絵文字名からUnicode絵文字に変換
    const emojiDef = REACTION_EMOJIS.find(e => e.name === r.name);
    const emoji = emojiDef?.emoji || r.name;
    const existing = map.get(emoji);
    if (existing) {
      existing.count += r.count;
    } else {
      map.set(emoji, { count: r.count, isMine: false });
    }
  }

  // ツール内リアクション
  for (const r of internal) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count += 1;
      existing.isMine = true;
    } else {
      map.set(r.emoji, { count: 1, isMine: true });
    }
  }

  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    ...data,
  }));
}

/**
 * URLをリンク化するコンポーネント
 * テキスト中のURLを検出してクリッカブルリンクに変換
 */
function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts: (string | { url: string; key: number })[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ url: match[1], key: keyCounter++ });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === 'string')) {
    return <p className={className} style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{text}</p>;
  }

  return (
    <p className={className} style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <a
            key={part.key}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline break-all"
          >
            {part.url.length > 60 ? part.url.slice(0, 57) + '...' : part.url}
          </a>
        )
      )}
    </p>
  );
}

/**
 * ジョブ種別選択ドロップダウン＋AI構造化
 */
const JOB_TYPES = [
  { value: 'schedule', label: '日程調整', icon: '📅', desc: 'カレンダー空き確認→候補日提示→返信文生成' },
  { value: 'consult', label: '社内相談', icon: '💬', desc: '社内メンバーに相談→回答後に返信文生成' },
  { value: 'save_to_drive', label: 'Driveに保存', icon: '📁', desc: '添付/URLをプロジェクトDriveに保存' },
  { value: 'todo', label: '後でやる', icon: '📌', desc: 'ジョブリストに保存して後で対応' },
] as const;

function JobActionButton({ message }: { message: UnifiedMessage }) {
  const [showMenu, setShowMenu] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [consultQuestion, setConsultQuestion] = useState('');
  const [consultTarget, setConsultTarget] = useState('');
  const [consultTargetId, setConsultTargetId] = useState('');
  const [internalMembers, setInternalMembers] = useState<{id: string; name: string; email?: string; linkedUserId?: string}[]>([]);
  // Phase 62: 日程調整の宛先選択
  const [showScheduleTargetForm, setShowScheduleTargetForm] = useState(false);
  const [scheduleTargetName, setScheduleTargetName] = useState(message.from?.name || '');
  const [scheduleTargetAddress, setScheduleTargetAddress] = useState(message.from?.address || '');
  const [contacts, setContacts] = useState<{id: string; name: string; address?: string}[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Phase 62: グループチャネル判定
  const isGroupChannel = (message.channel === 'slack' && !!message.metadata?.slackChannel)
    || (message.channel === 'chatwork' && !!message.metadata?.chatworkRoomId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  // Phase 62: コンタクト一覧を取得（日程調整の宛先選択用）
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      const json = await res.json();
      if (json.success && json.data) {
        const contactList = json.data.map((c: { id: string; name?: string; channels?: { address?: string }[] }) => ({
          id: c.id,
          name: c.name || '不明',
          address: c.channels?.[0]?.address || '',
        }));
        setContacts(contactList);
      }
    } catch { /* ignore */ }
  }, []);

  // 社内相談: 自社組織メンバーを取得
  const fetchInternalMembers = useCallback(async () => {
    try {
      const orgRes = await fetch('/api/organizations');
      const orgJson = await orgRes.json();
      if (!orgJson.success) return;
      const selfOrg = orgJson.data?.find((o: { relationshipType?: string }) => o.relationshipType === 'self');
      if (!selfOrg) return;
      const memRes = await fetch(`/api/organizations/${selfOrg.id}/members`);
      const memJson = await memRes.json();
      if (memJson.success && memJson.data) {
        // linked_user_id があるメンバーのみ相談可能（NodeMapアカウント紐づけ済み）
        const allMembers = memJson.data.map((m: { id: string; name?: string; linked_user_id?: string }) => ({
          id: m.id, name: m.name || '不明', linkedUserId: m.linked_user_id || undefined,
        }));
        // 紐づけ済みメンバーを優先表示（未紐づけも表示するが注記付き）
        setInternalMembers(allMembers);
      }
    } catch { /* ignore */ }
  }, []);

  const handleJobType = async (jobType: string) => {
    setShowMenu(false);

    // 社内相談: フォーム表示
    if (jobType === 'consult') {
      fetchInternalMembers();
      setShowConsultForm(true);
      return;
    }

    // Phase 62: 日程調整: 宛先選択フォーム表示
    if (jobType === 'schedule') {
      setScheduleTargetName(message.from?.name || '');
      setScheduleTargetAddress(message.from?.address || '');
      fetchContacts();
      setShowScheduleTargetForm(true);
      return;
    }

    await createJob(jobType);
  };

  // Phase 62: ジョブ作成共通関数（target情報を含む）
  const createJob = async (jobType: string, overrideTarget?: { name: string; address: string }) => {
    setIsCreating(true);
    const targetName = overrideTarget?.name || message.from?.name || '';
    const targetAddress = overrideTarget?.address || message.from?.address || '';

    try {
      // AIがメッセージ内容からジョブ情報を構造化
      const aiRes = await fetch('/api/ai/structure-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: message.channel,
          from: message.from?.name || '',
          subject: message.subject || '',
          body: message.body,
          jobType,
          messageId: message.id,
          isGroupChannel, // Phase 62
          senderAddress: message.from?.address || '', // Phase 62
        }),
      });
      const aiJson = await aiRes.json();
      const structured = aiJson.success ? aiJson.data : {
        title: message.subject || message.body.slice(0, 30),
        description: message.body.slice(0, 100),
      };

      // Phase 62: ジョブ登録時にtarget情報を渡す
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: structured.title,
          description: structured.description,
          type: jobType,
          sourceMessageId: message.id,
          sourceChannel: message.channel,
          aiDraft: structured.aiDraft,
          replyToMessageId: message.id,
          targetAddress,
          targetName,
          executionMetadata: message.metadata || {},
        }),
      });
      const json = await res.json();
      if (json.success) {
        const labels: Record<string, string> = {
          schedule: '日程調整ジョブを作成しました',
          save_to_drive: 'Driveに保存しました',
          todo: '後でやるリストに追加しました',
        };
        setResult({ type: 'success', text: labels[jobType] || 'ジョブに追加しました' });
      } else {
        setResult({ type: 'error', text: json.error || '作成に失敗' });
      }
    } catch {
      setResult({ type: 'error', text: '通信エラー' });
    } finally {
      setIsCreating(false);
      setTimeout(() => setResult(null), 3000);
    }
  };

  // Phase 62: 日程調整の宛先確定→ジョブ作成
  const handleScheduleSubmit = async () => {
    setShowScheduleTargetForm(false);
    await createJob('schedule', { name: scheduleTargetName, address: scheduleTargetAddress });
  };

  // 社内相談: フォーム送信
  const handleConsultSubmit = async () => {
    if (!consultQuestion.trim()) return;
    setShowConsultForm(false);
    setIsCreating(true);
    try {
      const aiRes = await fetch('/api/ai/structure-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: message.channel,
          from: message.from?.name || '',
          subject: message.subject || '',
          body: message.body,
          jobType: 'consult',
          messageId: message.id,
          consultQuestion: consultQuestion,
          consultTargetName: consultTarget,
          consultTargetContactId: consultTargetId,
        }),
      });
      const aiJson = await aiRes.json();
      const structured = aiJson.success ? aiJson.data : {
        title: `社内相談: ${consultTarget}`,
        description: consultQuestion.slice(0, 100),
      };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: structured.title,
          description: structured.description,
          type: 'consult',
          sourceMessageId: message.id,
          sourceChannel: message.channel,
          consultQuestion: consultQuestion,
          consultTargetName: consultTarget,
          consultTargetContactId: consultTargetId,
          threadSummary: structured.threadSummary,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResult({ type: 'success', text: '社内相談を作成しました' });
      } else {
        setResult({ type: 'error', text: json.error || '作成に失敗' });
      }
    } catch {
      setResult({ type: 'error', text: '通信エラー' });
    } finally {
      setIsCreating(false);
      setConsultQuestion('');
      setConsultTarget('');
      setConsultTargetId('');
      setTimeout(() => setResult(null), 3000);
    }
  };

  if (result) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium',
        result.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      )}>
        {result.type === 'success' ? '✅' : '❌'} {result.text}
      </span>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowMenu(!showMenu)}
        disabled={isCreating}
      >
        {isCreating ? '⏳ 登録中...' : '⚡ ジョブ'}
      </Button>
      {showMenu && (
        <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[240px] z-50">
          <div className="px-3 py-1.5 text-[10px] text-slate-400 font-medium border-b border-slate-100">
            アクションを選択
          </div>
          {JOB_TYPES.map((jt) => (
            <button
              key={jt.value}
              onClick={() => handleJobType(jt.value)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>{jt.icon}</span>
                <span className="text-xs font-medium text-slate-700">{jt.label}</span>
              </div>
              <p className="text-[10px] text-slate-400 ml-6 mt-0.5">{jt.desc}</p>
            </button>
          ))}
        </div>
      )}
      {showConsultForm && (
        <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg p-4 min-w-[320px] z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">💬 社内相談</h4>
            <button onClick={() => setShowConsultForm(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">相談相手（社内メンバー）</label>
              {internalMembers.length > 0 ? (
                <select
                  value={consultTargetId}
                  onChange={(e) => {
                    const m = internalMembers.find(m => m.id === e.target.value);
                    setConsultTargetId(e.target.value);
                    setConsultTarget(m?.name || '');
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">選択してください</option>
                  {internalMembers.filter(m => m.linkedUserId).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                  {internalMembers.some(m => !m.linkedUserId) && (
                    <option disabled>── 未紐づけ（相談不可）──</option>
                  )}
                  {internalMembers.filter(m => !m.linkedUserId).map(m => (
                    <option key={m.id} value={m.id} disabled>{m.name}（アカウント未紐づけ）</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={consultTarget}
                  onChange={(e) => setConsultTarget(e.target.value)}
                  placeholder="相談相手の名前"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">相談内容</label>
              <textarea
                value={consultQuestion}
                onChange={(e) => setConsultQuestion(e.target.value)}
                placeholder="何を相談したいですか？"
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <button
              onClick={handleConsultSubmit}
              disabled={!consultQuestion.trim()}
              className="w-full bg-blue-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              相談を送信
            </button>
          </div>
        </div>
      )}
      {/* Phase 62: 日程調整の宛先選択フォーム */}
      {showScheduleTargetForm && (
        <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg p-4 min-w-[320px] z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">📅 日程調整の宛先</h4>
            <button onClick={() => setShowScheduleTargetForm(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">宛先（コンタクトから選択 or 手入力）</label>
              {contacts.length > 0 ? (
                <select
                  value={scheduleTargetAddress}
                  onChange={(e) => {
                    const c = contacts.find(c => (c.address || c.name) === e.target.value);
                    if (c) {
                      setScheduleTargetName(c.name);
                      setScheduleTargetAddress(c.address || c.name);
                    } else {
                      setScheduleTargetAddress(e.target.value);
                    }
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={message.from?.address || ''}>{message.from?.name || '送信者'}（元メッセージ送信者）</option>
                  {contacts
                    .filter(c => c.address !== message.from?.address)
                    .map(c => (
                    <option key={c.id} value={c.address || c.name}>{c.name}{c.address ? ` (${c.address})` : ''}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={scheduleTargetName}
                  onChange={(e) => setScheduleTargetName(e.target.value)}
                  placeholder="宛先の名前"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <p className="text-[10px] text-slate-400">カレンダーの空き時間から候補日を自動生成します</p>
            <button
              onClick={handleScheduleSubmit}
              disabled={!scheduleTargetName.trim()}
              className="w-full bg-blue-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              日程調整ジョブを作成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * タスク作成ポップアップ（AI自動入力フォーム）
 */
function TaskActionButton({ message }: { message: UnifiedMessage }) {
  const [showModal, setShowModal] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    title: '',
    goal: '',
    description: '',
    priority: 'medium',
    deadline: '',
    concerns: '',
  });

  const openAndStructure = async () => {
    setShowModal(true);
    setIsStructuring(true);
    try {
      const res = await fetch('/api/ai/structure-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: message.channel,
          from: message.from?.name || '',
          subject: message.subject || '',
          body: message.body,
          timestamp: message.timestamp,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setForm({
          title: json.data.title || '',
          goal: json.data.goal || '',
          description: json.data.description || '',
          priority: json.data.priority || 'medium',
          deadline: json.data.deadline || '',
          concerns: json.data.concerns || '',
        });
      }
    } catch {
      // AIが失敗してもフォームは手入力可能
      setForm(prev => ({
        ...prev,
        title: message.subject || message.body.slice(0, 50),
        description: message.body.slice(0, 500),
      }));
    } finally {
      setIsStructuring(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          goal: form.goal,
          priority: form.priority,
          dueDate: form.deadline || undefined,
          sourceMessageId: message.id,
          sourceChannel: message.channel,
          sourceContent: message.body,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setResult({ type: 'success', text: 'タスクを登録しました' });
      } else {
        setResult({ type: 'error', text: json.error || '登録に失敗' });
      }
    } catch {
      setResult({ type: 'error', text: '通信エラー' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setResult(null), 3000);
    }
  };

  if (result && !showModal) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium',
        result.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      )}>
        {result.type === 'success' ? '✅' : '❌'} {result.text}
      </span>
    );
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openAndStructure}>
        📋 タスク化
      </Button>

      {/* タスク登録モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto mx-4">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">タスクを登録</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg"
                >
                  ✕
                </button>
              </div>

              {isStructuring ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="animate-spin text-2xl">⟳</div>
                  <p className="text-xs text-slate-500">AIがメッセージを分析中...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* タイトル */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">タイトル</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* ゴール */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">ゴール</label>
                    <input
                      type="text"
                      value={form.goal}
                      onChange={(e) => setForm({ ...form, goal: e.target.value })}
                      placeholder="何を達成するか"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* 詳細 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">詳細</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  {/* 優先度＋期限 */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">優先度</label>
                      <select
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">期限</label>
                      <input
                        type="date"
                        value={form.deadline}
                        onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* 懸念事項 */}
                  {form.concerns && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">懸念事項</label>
                      <textarea
                        value={form.concerns}
                        onChange={(e) => setForm({ ...form, concerns: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400">AIが自動入力しました。内容を確認・編集してから登録してください。</p>

                  {/* ボタン */}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !form.title.trim()}
                    >
                      {isSubmitting ? '登録中...' : '登録する'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * インボックスアクションボタン群（ジョブ＋タスク）
 */
function InboxActionButtons({ message }: { message: UnifiedMessage }) {
  return (
    <div className="flex items-center gap-1">
      <JobActionButton message={message} />
      <TaskActionButton message={message} />
    </div>
  );
}

/**
 * AIタスク化提案バナー（コンパクト折りたたみ式）
 */
function AiTaskSuggestionBanner({ message }: { message: UnifiedMessage }) {
  const [suggestion, setSuggestion] = useState<{
    shouldTaskify: boolean;
    reason: string;
    minimalTask: string;
    recommendedTask: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (message.from.name === 'あなた') return;
    if (fetchedRef.current === message.id) return;
    fetchedRef.current = message.id;
    setDismissed(false);
    setSuggestion(null);
    setExpanded(false);

    const fetchSuggestion = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/ai/task-suggestion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: message.id,
            channel: message.channel,
            from: message.from.name,
            subject: message.subject || '',
            body: message.body.slice(0, 1000),
            timestamp: message.timestamp,
          }),
        });
        const data = await res.json();
        if (data.success && data.data?.shouldTaskify) {
          setSuggestion(data.data);
        }
      } catch {
        // AI提案はオプションなので失敗しても何もしない
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestion();
  }, [message.id, message.from.name, message.channel, message.subject, message.body, message.timestamp]);

  if (dismissed || (!isLoading && !suggestion)) return null;
  if (isLoading) return null; // ローディング中は非表示（本文エリアを確保）
  if (!suggestion) return null;

  return (
    <div className="mx-6 mt-2 shrink-0">
      {/* コンパクトバー（1行） */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
        <span className="text-xs">🤖</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 text-left text-xs font-medium text-violet-700 hover:text-violet-900"
        >
          タスク化を推奨 — {suggestion.reason.slice(0, 40)}{suggestion.reason.length > 40 ? '...' : ''}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-violet-400 hover:text-violet-600 text-xs"
        >
          {expanded ? '▲' : '▼'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-violet-300 hover:text-violet-500 text-xs ml-1"
        >
          ✕
        </button>
      </div>

      {/* 展開時の詳細 */}
      {expanded && (
        <div className="mt-1.5 p-3 bg-violet-50 border border-violet-200 rounded-lg space-y-2">
          <p className="text-xs text-violet-700">{suggestion.reason}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-white rounded border border-slate-200">
              <div className="text-[10px] text-slate-500 font-semibold mb-0.5">最低限の対応</div>
              <p className="text-xs text-slate-700">{suggestion.minimalTask}</p>
            </div>
            <div className="p-2 bg-white rounded border border-violet-200">
              <div className="text-[10px] text-violet-600 font-semibold mb-0.5">推奨対応 ⭐</div>
              <p className="text-xs text-slate-700">{suggestion.recommendedTask}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Phase 26: ブロックボタン + スパム警告バナー
 */
function SpamWarningBanner({ message, onBlock }: { message: UnifiedMessage; onBlock: (address: string, type: 'exact' | 'domain') => void }) {
  const spamFlag = message.metadata?.spam_flag;
  if (!spamFlag?.isSpam) return null;

  const address = message.from.address;
  const domain = address?.split('@')[1] || '';

  return (
    <div className="mx-6 mt-2 shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <span className="text-amber-500 text-sm font-bold">&#9888;&#65039;</span>
        <div className="flex-1">
          <span className="text-xs font-medium text-amber-700">
            迷惑メール・メルマガの可能性があります
          </span>
          <span className="text-[10px] text-amber-500 ml-2">
            ({spamFlag.reason})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onBlock(address, 'exact')}
            className="text-[11px] px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
          >
            このアドレスをブロック
          </button>
          {domain && (
            <button
              onClick={() => onBlock(domain, 'domain')}
              className="text-[11px] px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
            >
              @{domain} をブロック
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockButton({ message, onBlock }: { message: UnifiedMessage; onBlock: (address: string, type: 'exact' | 'domain') => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const address = message.from.address;
  const domain = address?.split('@')[1] || '';

  // メール以外はブロック非対応
  if (message.channel !== 'email') return null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="secondary"
        onClick={() => setShowMenu(!showMenu)}
      >
        &#128683; ブロック
      </Button>
      {showMenu && (
        <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[200px] z-50">
          <button
            onClick={() => { onBlock(address, 'exact'); setShowMenu(false); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
          >
            <div className="font-medium text-slate-700">{address} をブロック</div>
            <div className="text-[10px] text-slate-400">このアドレスからのメールを非表示</div>
          </button>
          {domain && (
            <button
              onClick={() => { onBlock(domain, 'domain'); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              <div className="font-medium text-slate-700">@{domain} をすべてブロック</div>
              <div className="text-[10px] text-slate-400">このドメインからのメールを非表示</div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface MessageDetailProps {
  message: UnifiedMessage | null;
  group: MessageGroup | null;
  onSentMessage?: (msg: UnifiedMessage) => void;
  onBlockSender?: (address: string, matchType: 'exact' | 'domain') => void;
}

export default function MessageDetail({ message, group, onSentMessage, onBlockSender }: MessageDetailProps) {
  const [showReply, setShowReply] = useState(false);
  const [blockResult, setBlockResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ブロック処理
  const handleBlock = useCallback(async (address: string, matchType: 'exact' | 'domain') => {
    try {
      const res = await fetch('/api/inbox/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, matchType, reason: 'ユーザーが手動ブロック' }),
      });
      const data = await res.json();
      if (data.success) {
        setBlockResult({ type: 'success', text: `${address} をブロックしました` });
        onBlockSender?.(address, matchType);
      } else {
        setBlockResult({ type: 'error', text: 'ブロックに失敗しました' });
      }
    } catch {
      setBlockResult({ type: 'error', text: '通信エラー' });
    }
    setTimeout(() => setBlockResult(null), 3000);
  }, [onBlockSender]);

  if (!message && !group) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <div className="text-4xl mb-3">📬</div>
          <p>メッセージを選択してください</p>
        </div>
      </div>
    );
  }

  // ブロック結果バナー
  const blockBanner = blockResult && (
    <div className={`mx-6 mt-2 px-3 py-2 rounded-lg text-xs font-medium ${
      blockResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {blockResult.type === 'success' ? '✅' : '❌'} {blockResult.text}
    </div>
  );

  // グループが選択されている場合（複数メッセージのグループ）
  if (group && group.messageCount > 1) {
    return (
      <GroupDetail
        group={group}
        showReply={showReply}
        onToggleReply={() => setShowReply(!showReply)}
        onCloseReply={() => setShowReply(false)}
        onSentMessage={onSentMessage}
        onBlock={handleBlock}
        blockBanner={blockBanner}
      />
    );
  }

  // 単一メッセージ（グループ内1件、またはグループなし）
  const displayMessage = group ? group.latestMessage : message!;

  // メールで引用チェーンが解析されている場合は会話ビューで表示
  if (displayMessage.channel === 'email' && displayMessage.threadMessages && displayMessage.threadMessages.length > 1) {
    return (
      <EmailThreadDetail
        message={displayMessage}
        showReply={showReply}
        onToggleReply={() => setShowReply(!showReply)}
        onCloseReply={() => setShowReply(false)}
        onSentMessage={onSentMessage}
        onBlock={handleBlock}
        blockBanner={blockBanner}
      />
    );
  }

  return (
    <SingleMessageDetail
        message={displayMessage}
        showReply={showReply}
        onToggleReply={() => setShowReply(!showReply)}
        onCloseReply={() => setShowReply(false)}
        onSentMessage={onSentMessage}
        onBlock={handleBlock}
        blockBanner={blockBanner}
      />
  );
}

/**
 * グループ表示：グループ内の全メッセージを会話形式で表示
 */

function GroupDetail({
  group,
  showReply,
  onToggleReply,
  onCloseReply,
  onSentMessage,
  onBlock,
  blockBanner,
}: {
  group: MessageGroup;
  showReply: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onSentMessage?: (msg: UnifiedMessage) => void;
  onBlock?: (address: string, type: 'exact' | 'domain') => void;
  blockBanner?: React.ReactNode;
}) {
  const latestMessage = group.latestMessage;
  const groupEndRef = useRef<HTMLDivElement>(null);

  // 最新メッセージに自動スクロール
  useEffect(() => {
    if (groupEndRef.current) {
      groupEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [group.groupKey, group.messageCount]);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <ChannelBadge channel={group.channel} />
          <span className="text-xs text-slate-400">
            {group.messageCount}件のメッセージ
          </span>
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">
          {group.groupLabel}
        </h2>
        <div className="text-xs text-slate-400">
          参加者: {getUniqueParticipants(group.messages)}
        </div>
      </div>

      {/* グループ内の添付ファイルまとめ表示 */}
      {(() => {
        const allAttachments = group.messages.flatMap(m => m.attachments || []);
        return allAttachments.length > 0 ? (
          <div className="px-6 py-3 border-t border-slate-200">
            <AttachmentList attachments={allAttachments} />
          </div>
        ) : null;
      })()}

      {/* Phase 26: スパム警告バナー */}
      {onBlock && <SpamWarningBanner message={latestMessage} onBlock={onBlock} />}
      {blockBanner}

      {/* AIタスク化提案 */}
      <AiTaskSuggestionBanner message={latestMessage} />

      {/* 会話一覧（最新メッセージへ自動スクロール） */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {group.messages.map((msg) => (
          <ConversationBubble key={msg.id} message={msg} />
        ))}
        <div ref={groupEndRef} />
      </div>

      {/* アクションバー */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        {showReply ? (
          <ReplyForm
            message={latestMessage}
            onClose={onCloseReply}
            onSentMessage={onSentMessage}
            autoAiDraft
          />
        ) : (
          <div className="flex gap-2">
            <Button onClick={onToggleReply}>
              ↩ 返信（AI下書き）
            </Button>
            <InboxActionButtons message={latestMessage} />
            {onBlock && <BlockButton message={latestMessage} onBlock={onBlock} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 会話バブル：個別メッセージをチャット風に表示
 */
function ConversationBubble({ message }: { message: UnifiedMessage }) {
  // Phase 38: direction フィールドまたは名前で送受信を判定
  const isOwn = message.direction === 'sent' || message.from.name === 'あなた' || message.from.name === 'Me';

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3',
          isOwn
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
        )}
      >
        {/* 送信者名・日時 */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              'text-xs font-semibold',
              isOwn ? 'text-blue-100' : 'text-slate-500'
            )}
          >
            {isOwn ? 'あなた' : message.from.name}
          </span>
          <span
            className={cn(
              'text-[10px]',
              isOwn ? 'text-blue-200' : 'text-slate-400'
            )}
          >
            {formatRelativeTime(message.timestamp)}
          </span>
        </div>
        {/* 件名（メールの場合） */}
        {message.subject && (
          <div
            className={cn(
              'text-xs font-semibold mb-1',
              isOwn ? 'text-blue-100' : 'text-slate-600'
            )}
          >
            {message.subject}
          </div>
        )}
        {/* 本文 */}
        {message.channel === 'chatwork' ? (
          <ChatworkBody body={message.body} className="text-[13px]" isOwn={isOwn} />
        ) : (
          <LinkifiedText text={message.body} className="whitespace-pre-wrap leading-relaxed text-[13px]" />
        )}
        {/* リアクション */}
        <ReactionBar
          messageId={message.id}
          channel={message.channel}
          existingReactions={message.metadata?.reactions}
        />
      </div>
    </div>
  );
}

/**
 * メール引用チェーンを会話形式で表示
 * Gmailの「>」引用をパースして、チャットワーク風のバブルUIに変換
 */
function EmailThreadDetail({
  message,
  showReply,
  onToggleReply,
  onCloseReply,
  onSentMessage,
  onBlock,
  blockBanner,
}: {
  message: UnifiedMessage;
  showReply: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onSentMessage?: (msg: UnifiedMessage) => void;
  onBlock?: (address: string, type: 'exact' | 'domain') => void;
  blockBanner?: React.ReactNode;
}) {
  const threadMessages = message.threadMessages || [];
  const [summary, setSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const fetchSummary = useCallback(async () => {
    if (threadMessages.length < 2) return;
    setIsSummarizing(true);
    setSummaryError(false);
    try {
      const res = await fetch('/api/ai/thread-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          subject: message.subject || '',
          threadMessages,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.summary) {
        setSummary(data.data.summary);
      } else {
        setSummaryError(true);
      }
    } catch {
      setSummaryError(true);
    } finally {
      setIsSummarizing(false);
    }
  }, [message.subject, threadMessages]);

  // 自動で要約を取得
  useEffect(() => {
    if (threadMessages.length >= 2 && !summary) {
      fetchSummary();
    }
  }, [message.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 最新メッセージに自動スクロール
  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [message.id, threadMessages.length]);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <ChannelBadge channel="email" />
          <span className="text-xs text-slate-400">
            {threadMessages.length}件のやり取り
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            💬 引用を会話に変換
          </span>
        </div>
        {message.subject && (
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {message.subject}
          </h2>
        )}
        <div className="text-xs text-slate-400">
          参加者: {getUniqueThreadParticipants(threadMessages)}
        </div>

        {/* AI要約（スクロール可能・直近3〜4件表示、上スクロールで過去を確認） */}
        {threadMessages.length >= 2 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-amber-600 text-xs font-semibold">✨ AI要約</span>
              {isSummarizing && (
                <span className="text-[10px] text-amber-400">生成中...</span>
              )}
            </div>
            {summary ? (
              <SummaryScrollArea summary={summary} />
            ) : summaryError ? (
              <p className="text-xs text-amber-600">
                要約の生成に失敗しました。
                <button
                  onClick={fetchSummary}
                  className="ml-1 underline hover:no-underline"
                >
                  再試行
                </button>
              </p>
            ) : isSummarizing ? (
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Phase 26: スパム警告バナー */}
      {onBlock && <SpamWarningBanner message={message} onBlock={onBlock} />}
      {blockBanner}

      {/* AIタスク化提案 */}
      <AiTaskSuggestionBanner message={message} />

      {/* 添付ファイル（メールスレッド） */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-200">
          <AttachmentList attachments={message.attachments} />
        </div>
      )}

      {/* 会話一覧（古い順・最新メッセージへ自動スクロール） */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {threadMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex', msg.isOwn ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3',
                msg.isOwn
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    msg.isOwn ? 'text-blue-100' : 'text-slate-500'
                  )}
                >
                  {msg.isOwn ? 'あなた' : msg.from.name}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    msg.isOwn ? 'text-blue-200' : 'text-slate-400'
                  )}
                >
                  {msg.timestamp}
                </span>
              </div>
              {message.channel === 'chatwork' ? (
                <ChatworkBody body={msg.body} className="text-[13px]" isOwn={msg.isOwn} />
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                  {msg.body}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={threadEndRef} />
      </div>

      {/* アクションバー */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        {showReply ? (
          <ReplyForm message={message} onClose={onCloseReply} onSentMessage={onSentMessage} autoAiDraft />
        ) : (
          <div className="flex gap-2">
            <Button onClick={onToggleReply}>↩ 返信（AI下書き）</Button>
            <InboxActionButtons message={message} />
            {onBlock && <BlockButton message={message} onBlock={onBlock} />}
          </div>
        )}
      </div>
    </div>
  );
}

function getUniqueThreadParticipants(messages: { from: { name: string } }[]): string {
  const names = new Set(messages.map((m) => m.from.name));
  return Array.from(names).join('、');
}

/**
 * 単一メッセージ表示（従来の表示形式）
 */
function SingleMessageDetail({
  message,
  showReply,
  onToggleReply,
  onCloseReply,
  onSentMessage,
  onBlock,
  blockBanner,
}: {
  message: UnifiedMessage;
  showReply: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
  onSentMessage?: (msg: UnifiedMessage) => void;
  onBlock?: (address: string, type: 'exact' | 'domain') => void;
  blockBanner?: React.ReactNode;
}) {
  const hasThread = message.threadMessages && message.threadMessages.length > 0;
  const singleThreadEndRef = useRef<HTMLDivElement>(null);

  // スレッド履歴の最新メッセージに自動スクロール
  useEffect(() => {
    if (singleThreadEndRef.current) {
      singleThreadEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [message.id]);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <ChannelBadge channel={message.channel} />
          <StatusBadge status={message.status} />
          {message.metadata.slackChannelName && (
            <span className="text-xs text-slate-400">
              #{message.metadata.slackChannelName}
            </span>
          )}
          {message.metadata.chatworkRoomName && (
            <span className="text-xs text-slate-400">
              {message.metadata.chatworkRoomName}
            </span>
          )}
        </div>
        {message.subject && (
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            {message.subject}
          </h2>
        )}
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-slate-900">
              {message.from.name}
            </span>
            <span className="text-sm text-slate-400 ml-2">
              {message.from.address}
            </span>
          </div>
          <span className="text-sm text-slate-400">
            {formatRelativeTime(message.timestamp)}
          </span>
        </div>
      </div>

      {/* Phase 26: スパム警告バナー */}
      {onBlock && <SpamWarningBanner message={message} onBlock={onBlock} />}
      {blockBanner}

      {/* Phase 51a: タスク化済みバックリンク */}
      <TaskLinkedBadge messageId={message.id} />

      {/* AIタスク化提案 */}
      <AiTaskSuggestionBanner message={message} />

      {/* 本文 */}
      <div className="flex-1 overflow-y-auto p-6">
        {message.channel === 'chatwork' ? (
          <ChatworkBody body={message.body} />
        ) : (
          <LinkifiedText text={message.body} className="text-slate-700 whitespace-pre-wrap leading-relaxed" />
        )}

        {/* リアクション */}
        <ReactionBar
          messageId={message.id}
          channel={message.channel}
          existingReactions={message.metadata?.reactions}
        />

        {/* 添付ファイル */}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} />
        )}
      </div>

      {/* スレッド履歴（既存のthreadMessages） */}
      {hasThread && (
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="px-6 py-3 border-b border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              会話の履歴（{message.threadMessages!.length}件）
            </h3>
          </div>
          <div className="overflow-y-auto max-h-64 px-6 py-3 space-y-3">
            {message.threadMessages!.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.isOwn ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                    msg.isOwn
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        msg.isOwn ? 'text-blue-100' : 'text-slate-500'
                      )}
                    >
                      {msg.isOwn ? 'あなた' : msg.from.name}
                    </span>
                    <span
                      className={cn(
                        'text-[10px]',
                        msg.isOwn ? 'text-blue-200' : 'text-slate-400'
                      )}
                    >
                      {formatRelativeTime(msg.timestamp)}
                    </span>
                  </div>
                  {message.channel === 'chatwork' ? (
                    <ChatworkBody body={msg.body} className="text-[13px]" isOwn={msg.isOwn} />
                  ) : (
                    <LinkifiedText text={msg.body} className="whitespace-pre-wrap leading-relaxed text-[13px]" />
                  )}
                </div>
              </div>
            ))}
            <div ref={singleThreadEndRef} />
          </div>
        </div>
      )}

      {/* アクションバー */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        {showReply ? (
          <ReplyForm
            message={message}
            onClose={onCloseReply}
            onSentMessage={onSentMessage}
            autoAiDraft
          />
        ) : (
          <div className="flex gap-2">
            <Button onClick={onToggleReply}>
              ↩ 返信（AI下書き）
            </Button>
            <InboxActionButtons message={message} />
            {onBlock && <BlockButton message={message} onBlock={onBlock} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 添付ファイル表示コンポーネント
 * 画像はインラインプレビュー、その他はファイルアイコン+ダウンロードリンク
 */
function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return '🖼';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📎';
    if (mimeType.includes('zip') || mimeType.includes('gzip') || mimeType.includes('compressed')) return '🗜';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType === 'text/csv') return '📊';
    return '📁';
  };

  const imageAttachments = attachments.filter(a => a.mimeType.startsWith('image/') && a.previewUrl);
  const fileAttachments = attachments.filter(a => !a.mimeType.startsWith('image/') || !a.previewUrl);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-slate-500 text-xs font-semibold">📎 添付ファイル（{attachments.length}件）</span>
      </div>

      {/* 画像プレビュー */}
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {imageAttachments.map((att) => (
            <div key={att.id} className="relative group">
              <button
                onClick={() => setExpandedImage(expandedImage === att.id ? null : att.id)}
                className="block rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
              >
                <img
                  src={att.previewUrl}
                  alt={att.filename}
                  className={cn(
                    'object-cover transition-all',
                    expandedImage === att.id ? 'max-w-full max-h-96' : 'w-20 h-20'
                  )}
                />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {att.filename} ({formatFileSize(att.size)})
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ファイル一覧 */}
      {fileAttachments.length > 0 && (
        <div className="space-y-1">
          {fileAttachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
            >
              <span className="text-lg">{getFileIcon(att.mimeType)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{att.filename}</p>
                <p className="text-[10px] text-slate-400">{formatFileSize(att.size)}</p>
              </div>
              {att.downloadUrl && (
                <a
                  href={att.downloadUrl}
                  download={att.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                >
                  DL
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * AI要約スクロールエリア
 * 直近3〜4件の日付エントリを表示し、上スクロールで過去分を確認可能
 */
function SummaryScrollArea({ summary }: { summary: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 要約が表示されたら最下部（直近）にスクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [summary]);

  return (
    <div
      ref={scrollRef}
      className="max-h-[100px] overflow-y-auto text-xs text-amber-900 leading-relaxed"
    >
      {summary.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('\u30FB')) {
          // 日付行（・）
          return (
            <div key={i} className={i > 0 ? 'mt-1.5' : ''}>
              <span className="font-semibold text-amber-800">{trimmed}</span>
            </div>
          );
        } else if (trimmed.startsWith('-') || trimmed.startsWith('- ')) {
          // 要約行
          return (
            <div key={i} className="ml-4 text-amber-700">
              {trimmed}
            </div>
          );
        } else if (trimmed) {
          return <div key={i}>{trimmed}</div>;
        }
        return null;
      })}
    </div>
  );
}

function getUniqueParticipants(messages: UnifiedMessage[]): string {
  const names = new Set(messages.map((m) => m.from.name));
  return Array.from(names).join('、');
}
