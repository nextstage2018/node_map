// Phase UI-7: 組織詳細ページ（左ツリーナビ + 右コンテンツ統合）
// V2-D: 検討ツリータブ（会議録アップロード + 一覧）追加
// V2-E: 検討ツリーUI（DecisionTreeView）追加
// V2-H: 思考マップタブ（マイルストーンスコープフィルタ付き）追加
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2, ArrowLeft, Globe, Save,
  Users, Trash2, X, Plus, Link2, FolderOpen,
  ChevronRight, ChevronDown, Settings, CheckSquare, Clock,
  ClipboardList, GitBranch, Map, Pencil, StickyNote, Bookmark,
} from 'lucide-react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import MoreMenu from '@/components/shared/MoreMenu';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import BusinessTimeline from '@/components/organizations/BusinessTimeline';
import MeetingRecordUpload from '@/components/v2/MeetingRecordUpload';
import MeetingRecordList from '@/components/v2/MeetingRecordList';
// v7.0: TaskProposalPanel廃止（Slackチャネル通知に移行）
// import TaskProposalPanel from '@/components/v2/TaskProposalPanel';
import DecisionTreeView from '@/components/v2/DecisionTreeView';
import ThoughtMapTab from '@/components/v2/ThoughtMapTab';
import MilestoneSection from '@/components/v2/MilestoneSection';
import ProjectMembers from '@/components/project/ProjectMembers';
// ProjectChannels は ProjectMembers に統合済み（v3.3）
import ProjectResources from '@/components/project/ProjectResources';
import RecurringRulesManager from '@/components/v42/RecurringRulesManager';
import MilestoneProposalPanel from '@/components/v8/MilestoneProposalPanel';
import { PROJECT_STATUS_LABELS } from '@/components/business-log/types';

// ========================================
// 型定義
// ========================================
interface Organization {
  id: string;
  name: string;
  domain: string | null;
  relationship_type: string | null;
  address: string | null;
  phone: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

interface OrgChannel {
  id: string;
  organization_id: string;
  service_name: 'slack' | 'chatwork' | 'email';
  channel_id: string;
  channel_name: string;
  channel_type: string | null;
  is_active: boolean;
  created_at: string;
}

interface Member {
  id: string;
  name: string;
  relationship_type: string | null;
  main_channel: string | null;
  message_count: number | null;
  last_contact_at: string | null;
  is_team_member: boolean | null;
  auto_added_to_org: boolean | null;
  confirmed: boolean | null;
  linked_user_id: string | null;
}

// v3.3: NodeMapUser, AvailableChannel, Contact はPJ配下コンポーネントに移動

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  organization_id?: string | null;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  milestone_id?: string | null;
}

// ========================================
// ツリーナビのノードタイプ
// ========================================
// v3.3: 組織=設定のみ、プロジェクト=7タブ（メンバー＆チャネル統合）
type NavNode =
  | { type: 'org'; tab: 'settings' }
  | { type: 'project'; projectId: string; tab: 'timeline' | 'decision_tree' | 'thought_map' | 'tasks' | 'jobs' | 'members' | 'resources' };

// ========================================
// サービスアイコン
// ========================================
// v3.3: ServiceIcon/ServiceBadge はPJ配下コンポーネント(ProjectChannels)に移動

// ========================================
// メインコンポーネント
// ========================================
export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  // ナビゲーション
  // v3.3: デフォルトは設定タブ（メンバー・チャネルはPJ配下に移動）
  const [activeNav, setActiveNav] = useState<NavNode>({ type: 'org', tab: 'settings' });
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // 組織情報
  const [org, setOrg] = useState<Organization | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editRelType, setEditRelType] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // プロジェクト
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // V2-I: プロジェクト編集・削除
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; description: string } | null>(null);
  const [deleteProject, setDeleteProject] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // v3.3: チャネル・メンバーはPJ配下に移動。ヘッダー表示用にcount取得のみ残す
  const [channels, setChannels] = useState<OrgChannel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  // タスク（PJ選択時）
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // v3.3: ドキュメント→関連資料に移行。ProjectResourcesコンポーネント内で管理

  // 会議録（V2-D: 検討ツリータブ用）
  const [meetingRecordRefreshKey, setMeetingRecordRefreshKey] = useState(0);
  // V2-E: 検討ツリーリフレッシュ用
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  // タスク提案パネルリフレッシュ用
  const [taskProposalRefreshKey, setTaskProposalRefreshKey] = useState(0);

  // メッセージ
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // ========================================
  // データ取得
  // ========================================
  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      if (data.success) {
        const found = (data.data || []).find((o: Organization) => o.id === orgId);
        if (found) {
          setOrg(found);
          setEditName(found.name);
          setEditDomain(found.domain || '');
          setEditRelType(found.relationship_type || '');
          setEditAddress(found.address || '');
          setEditPhone(found.phone || '');
          setEditMemo(found.memo || '');
        }
      }
    } catch { /* */ }
  }, [orgId]);

  // v3.3: チャネルはPJ配下に移動。ヘッダー表示用にproject_channels数を集計
  const [projectChannelCount, setProjectChannelCount] = useState(0);
  const fetchChannels = useCallback(async () => {
    try {
      // 組織レベルチャネル（レガシー互換）
      const res = await fetch(`/api/organizations/${orgId}/channels`);
      const data = await res.json();
      if (data.success) setChannels(data.data || []);
    } catch { /* */ }
  }, [orgId]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      const data = await res.json();
      if (data.success) setMembers(data.data || []);
    } catch { /* */ }
  }, [orgId]);

  // v9.0fix: プロジェクト横断のユニークメンバー数
  const [projectMemberCount, setProjectMemberCount] = useState(0);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects?organization_id=${orgId}`);
      const data = await res.json();
      if (data.success) {
        setProjects(data.data || []);
        // プロジェクト配下のチャネル総数 + ユニークメンバー数を集計
        let chCount = 0;
        const uniqueContactIds = new Set<string>();
        for (const p of (data.data || [])) {
          try {
            const chRes = await fetch(`/api/projects/${p.id}/channels`);
            const chData = await chRes.json();
            if (chData.success) chCount += (chData.data || []).length;
          } catch { /* */ }
          try {
            const mRes = await fetch(`/api/projects/${p.id}/members`);
            const mData = await mRes.json();
            if (mData.success) {
              for (const m of (mData.data || [])) {
                uniqueContactIds.add(m.contact_id);
              }
            }
          } catch { /* */ }
        }
        setProjectChannelCount(chCount);
        setProjectMemberCount(uniqueContactIds.size);
      }
    } catch { /* */ }
  }, [orgId]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchOrg(), fetchChannels(), fetchMembers(), fetchProjects()]);
      setIsLoading(false);
    };
    load();
  }, [fetchOrg, fetchChannels, fetchMembers, fetchProjects]);

  // PJタスク取得
  const fetchTasks = useCallback(async (projectId: string) => {
    setIsLoadingTasks(true);
    try {
      const res = await fetch(`/api/tasks?project_id=${projectId}`);
      const data = await res.json();
      if (data.success) setTasks(data.data || []);
    } catch { /* */ }
    finally { setIsLoadingTasks(false); }
  }, []);

  // v3.3: fetchDocuments は ProjectResources に移動済み

  // ナビ変更時のデータロード
  useEffect(() => {
    if (activeNav.type === 'project') {
      if (activeNav.tab === 'tasks') fetchTasks(activeNav.projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav]);

  // ========================================
  // 組織情報の保存
  // ========================================
  const saveOrg = async () => {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          domain: editDomain.trim() || null,
          relationship_type: editRelType || null,
          address: editAddress.trim() || null,
          phone: editPhone.trim() || null,
          memo: editMemo.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrg(data.data);
        showMsg('success', '組織情報を更新しました');
        if (editRelType) fetchMembers();
      } else {
        showMsg('error', data.error || '更新に失敗しました');
      }
    } catch { showMsg('error', '通信エラー'); }
  };

  // v3.3: 組織レベルのチャネル・メンバー操作はPJ配下コンポーネントに移動済み

  // ========================================
  // プロジェクト作成
  // ========================================
  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), description: newProjectDesc.trim() || null, organizationId: orgId }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewProject(false); setNewProjectName(''); setNewProjectDesc('');
        fetchProjects();
        showMsg('success', 'プロジェクトを作成しました');
      } else { showMsg('error', data.error || '作成に失敗しました'); }
    } catch { showMsg('error', '通信エラー'); }
  };

  // V2-I: プロジェクト編集
  const handleUpdateProject = async (projectId: string, name: string, description: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingProject(null);
        fetchProjects();
        showMsg('success', 'プロジェクトを更新しました');
      } else { showMsg('error', data.error || '更新に失敗しました'); }
    } catch { showMsg('error', '通信エラー'); }
  };

  // V2-I: プロジェクト削除
  const handleDeleteProject = async () => {
    if (!deleteProject) return;
    setIsDeletingProject(true);
    try {
      const res = await fetch(`/api/projects/${deleteProject.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setDeleteProject(null);
        fetchProjects();
        // 削除したPJが選択中だったらナビをリセット
        if (activeNav.type === 'project' && activeNav.projectId === deleteProject.id) {
          setActiveNav({ type: 'org', tab: 'settings' });
        }
        showMsg('success', 'プロジェクトを削除しました');
      } else { showMsg('error', data.error || '削除に失敗しました'); }
    } catch { showMsg('error', '通信エラー'); }
    setIsDeletingProject(false);
  };

  // ツリーナビのPJトグル
  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // ========================================
  // レンダリング
  // ========================================
  if (isLoading) {
    return (
      <AppLayout>
        <ContextBar title="組織詳細" />
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <div className="animate-spin text-2xl mb-2">&#8987;</div>
            <p className="text-sm">読み込み中...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!org) {
    return (
      <AppLayout>
        <ContextBar title="組織詳細" />
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">組織が見つかりません</p>
            <button onClick={() => router.push('/organizations')} className="mt-3 text-xs text-blue-600 hover:underline">一覧に戻る</button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // 現在のPJ（PJタブ選択時）
  const currentProject = activeNav.type === 'project'
    ? projects.find(p => p.id === activeNav.projectId)
    : null;

  return (
    <AppLayout>
      <ContextBar title="組織詳細" />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/organizations')} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
              <ArrowLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-slate-900 truncate">{org.name}</h1>
              {org.domain && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Globe className="w-3 h-3" />{org.domain}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5" />{projects.length} PJ</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{projectMemberCount}人</span>
              <span className="flex items-center gap-1"><Link2 className="w-3.5 h-3.5" />{projectChannelCount} ch</span>
            </div>
          </div>
        </div>

        {/* メッセージバナー */}
        {message && (
          <div className={`mx-6 mt-2 px-3 py-2 rounded-lg text-xs font-medium shrink-0 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>{message.text}</div>
        )}

        {/* 2カラムレイアウト: 左ツリーナビ + 右コンテンツ */}
        <div className="flex-1 overflow-hidden flex">
          {/* ===== 左ツリーナビ ===== */}
          <div className="w-80 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
            <div className="py-2">
              {/* 組織レベルメニュー */}
              <div className="px-3 mb-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">組織</p>
              </div>
              {/* v3.3: 組織レベルは設定のみ */}
              <button
                onClick={() => setActiveNav({ type: 'org', tab: 'settings' })}
                className={`w-full flex items-center gap-2 px-5 py-2 text-xs transition-colors ${
                  activeNav.type === 'org' && activeNav.tab === 'settings'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="flex-1 text-left">設定</span>
              </button>

              {/* プロジェクト一覧 */}
              <div className="px-3 mt-4 mb-1 flex items-center justify-between">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">プロジェクト</p>
                <button
                  onClick={() => setShowNewProject(true)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  title="新規プロジェクト"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {projects.length === 0 ? (
                <p className="px-5 py-2 text-[11px] text-slate-400">プロジェクトなし</p>
              ) : (
                projects.map(project => {
                  const isExpanded = expandedProjects.has(project.id);
                  const statusConfig = PROJECT_STATUS_LABELS[project.status] || PROJECT_STATUS_LABELS.active;
                  return (
                    <div key={project.id}>
                      <div className="flex items-center group">
                        <button
                          onClick={() => toggleProject(project.id)}
                          className="flex-1 flex items-center gap-1.5 px-5 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                          <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="flex-1 text-left truncate">{project.name.length > 14 ? project.name.slice(0, 14) + '...' : project.name}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded-full shrink-0 ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </button>
                        <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreMenu items={[
                            { label: '編集', icon: <Pencil className="w-3 h-3" />, onClick: () => setEditingProject({ id: project.id, name: project.name, description: project.description || '' }) },
                            { label: '削除', icon: <Trash2 className="w-3 h-3" />, onClick: () => setDeleteProject({ id: project.id, name: project.name }), variant: 'danger' },
                          ]} />
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="ml-4">
                          {/* v3.3: 8タブ */}
                          {[
                            { tab: 'timeline' as const, label: 'タイムライン', icon: ClipboardList },
                            { tab: 'decision_tree' as const, label: '検討ツリー', icon: GitBranch },
                            { tab: 'thought_map' as const, label: '思考マップ', icon: Map },
                            { tab: 'tasks' as const, label: 'タスク', icon: CheckSquare },
                            { tab: 'jobs' as const, label: '定期イベント', icon: StickyNote },
                            { tab: 'members' as const, label: 'メンバー', icon: Users },
                            { tab: 'resources' as const, label: '関連資料', icon: Bookmark },
                          ].map(sub => (
                            <button
                              key={sub.tab}
                              onClick={() => setActiveNav({ type: 'project', projectId: project.id, tab: sub.tab })}
                              className={`w-full flex items-center gap-2 px-5 py-1.5 text-[11px] transition-colors ${
                                activeNav.type === 'project' && activeNav.projectId === project.id && activeNav.tab === sub.tab
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              <sub.icon className="w-3 h-3" />
                              {sub.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* 新規PJ作成フォーム */}
              {showNewProject && (
                <div className="mx-3 mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="プロジェクト名" autoFocus
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1.5"
                  />
                  <textarea
                    value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)}
                    placeholder="説明（任意）" rows={2}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none mb-1.5"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={createProject} disabled={!newProjectName.trim()}
                      className="px-2.5 py-1 text-[10px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      作成
                    </button>
                    <button onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectDesc(''); }}
                      className="px-2.5 py-1 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors">
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===== 右コンテンツエリア ===== */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {/* v3.3: 組織レベルのメンバー・チャネルは廃止（プロジェクト配下に移動） */}

              {/* 組織レベル: 設定 */}
              {activeNav.type === 'org' && activeNav.tab === 'settings' && (
                <div className="p-6">
                  <h2 className="text-sm font-bold text-slate-800 mb-4">組織設定</h2>
                  <div className="max-w-lg space-y-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1"><Building2 className="w-3.5 h-3.5" />組織名</label>
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1"><Users className="w-3.5 h-3.5" />関係性</label>
                      <select value={editRelType} onChange={(e) => setEditRelType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">未設定</option>
                        <option value="internal">自社</option>
                        <option value="client">取引先</option>
                        <option value="partner">パートナー</option>
                        <option value="vendor">仕入先</option>
                        <option value="prospect">見込み</option>
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1"><Globe className="w-3.5 h-3.5" />ドメイン</label>
                      <input type="text" value={editDomain} onChange={(e) => setEditDomain(e.target.value)} placeholder="例: example.co.jp"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">住所</label>
                      <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="例: 東京都渋谷区..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">電話番号</label>
                      <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="例: 03-1234-5678"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">メモ</label>
                      <textarea value={editMemo} onChange={(e) => setEditMemo(e.target.value)} placeholder="備考・メモ" rows={3}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                    <button onClick={saveOrg} disabled={!editName.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      <Save className="w-3.5 h-3.5" />保存
                    </button>
                  </div>
                </div>
              )}

              {/* PJレベル: タイムライン */}
              {activeNav.type === 'project' && activeNav.tab === 'timeline' && currentProject && (
                <BusinessTimeline projectId={currentProject.id} projectName={currentProject.name} />
              )}

              {/* PJレベル: 検討ツリー（V2-D: 会議録アップロード + 一覧 / V2-E: ツリーUI） */}
              {activeNav.type === 'project' && activeNav.tab === 'decision_tree' && currentProject && (
                <div className="p-6 space-y-6">
                  <h2 className="text-sm font-bold text-slate-800">{currentProject.name} - 検討ツリー</h2>

                  {/* V2-E: 検討ツリービュー */}
                  <DecisionTreeView
                    projectId={currentProject.id}
                    refreshKey={treeRefreshKey}
                  />

                  {/* 会議録アップロード */}
                  <MeetingRecordUpload
                    projectId={currentProject.id}
                    onRecordCreated={() => {
                      setMeetingRecordRefreshKey(prev => prev + 1);
                    }}
                    onTreeUpdated={() => {
                      setTreeRefreshKey(prev => prev + 1);
                      setTaskProposalRefreshKey(prev => prev + 1);
                    }}
                  />

                  {/* 会議録一覧 */}
                  <MeetingRecordList
                    projectId={currentProject.id}
                    refreshKey={meetingRecordRefreshKey}
                    onAnalyzed={() => {
                      setTaskProposalRefreshKey(prev => prev + 1);
                      setTreeRefreshKey(prev => prev + 1);
                    }}
                  />

                  {/* v8.0: マイルストーン提案パネル（会議録一覧の直後に配置） */}
                  <MilestoneProposalPanel
                    projectId={currentProject.id}
                    refreshKey={taskProposalRefreshKey}
                    onAccepted={() => {
                      setTreeRefreshKey(prev => prev + 1);
                    }}
                  />
                </div>
              )}

              {/* PJレベル: 思考マップ（V2-H） */}
              {activeNav.type === 'project' && activeNav.tab === 'thought_map' && currentProject && (
                <ThoughtMapTab projectId={currentProject.id} projectName={currentProject.name} />
              )}

              {/* PJレベル: タスク（V2-I修正: MilestoneSection統合 + リンク修正） */}
              {activeNav.type === 'project' && activeNav.tab === 'tasks' && currentProject && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-800">{currentProject.name} - タスク</h2>
                  </div>

                  {/* V2-I: マイルストーンセクション（進捗・評価表示） */}
                  <MilestoneSection projectId={currentProject.id} />

                  {/* マイルストーン未紐づけタスク一覧 */}
                  {(() => {
                    const unlinkedTasks = tasks.filter(t => !t.milestone_id);
                    if (isLoadingTasks) {
                      return <div className="flex items-center justify-center py-16"><div className="animate-spin text-2xl">&#8987;</div></div>;
                    }
                    if (unlinkedTasks.length === 0) return null;
                    return (
                      <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-600 border border-amber-200">マイルストーン未設定</span>
                          <span className="text-[10px] text-slate-400">{unlinkedTasks.length}件</span>
                        </div>
                        <div className="space-y-4">
                          {(['in_progress', 'todo', 'done'] as const).map(status => {
                            const statusTasks = unlinkedTasks.filter(t => t.status === status);
                            if (statusTasks.length === 0) return null;
                            const statusLabels: Record<string, string> = { todo: '未着手', in_progress: '進行中', done: '完了' };
                            const statusColors: Record<string, string> = { todo: 'bg-slate-100 text-slate-600', in_progress: 'bg-blue-100 text-blue-700', done: 'bg-green-100 text-green-700' };
                            return (
                              <div key={status}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[status]}`}>{statusLabels[status]}</span>
                                  <span className="text-[10px] text-slate-400">{statusTasks.length}件</span>
                                </div>
                                <div className="space-y-1.5">
                                  {statusTasks.map(task => (
                                    <button key={task.id}
                                      onClick={() => router.push(`/?taskId=${task.id}&projectId=${currentProject.id}&message=${encodeURIComponent(`タスク「${task.title}」を進めたい`)}`)}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors text-left">
                                      <span className="flex-1 text-sm text-slate-700 truncate">{task.title}</span>
                                      {task.due_date && (
                                        <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-0.5">
                                          <Clock className="w-3 h-3" />
                                          {new Date(task.due_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* v3.3 PJレベル: ジョブ（定型業務 / やることメモ） */}
              {activeNav.type === 'project' && activeNav.tab === 'jobs' && currentProject && (
                <div className="p-6">
                  <h2 className="text-sm font-bold text-slate-800 mb-4">{currentProject.name} - 定期イベント</h2>
                  {/* v4.2: 繰り返しルール管理 */}
                  <RecurringRulesManager projectId={currentProject.id} />
                </div>
              )}

              {/* v3.3 PJレベル: メンバー（組織から移動） */}
              {activeNav.type === 'project' && activeNav.tab === 'members' && currentProject && (
                <ProjectMembers projectId={currentProject.id} projectName={currentProject.name} />
              )}

              {/* v3.3 PJレベル: 関連資料（旧ドキュメント統合 + URL管理 + タグ検索） */}
              {activeNav.type === 'project' && activeNav.tab === 'resources' && currentProject && (
                <ProjectResources projectId={currentProject.id} projectName={currentProject.name} organizationId={org?.id} organizationName={org?.name} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* V2-I: プロジェクト編集ダイアログ */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingProject(null)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <button onClick={() => setEditingProject(null)} className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-slate-800 mb-4">プロジェクトを編集</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">プロジェクト名</label>
                <input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">説明（任意）</label>
                <textarea
                  value={editingProject.description}
                  onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingProject(null)} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">キャンセル</button>
              <button
                onClick={() => handleUpdateProject(editingProject.id, editingProject.name, editingProject.description)}
                disabled={!editingProject.name.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V2-I: プロジェクト削除確認ダイアログ */}
      <DeleteConfirmDialog
        isOpen={!!deleteProject}
        onClose={() => setDeleteProject(null)}
        onConfirm={handleDeleteProject}
        title="プロジェクトを削除"
        description={`「${deleteProject?.name || ''}」を削除すると、配下のタスク・ドキュメント・マイルストーンもすべて削除されます。この操作は取り消せません。`}
        confirmText={deleteProject?.name}
        isLoading={isDeletingProject}
      />
    </AppLayout>
  );
}
