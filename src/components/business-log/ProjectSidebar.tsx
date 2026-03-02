'use client';

import { useState } from 'react';
import { FolderOpen, Plus, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Project, Organization, PROJECT_STATUS_LABELS } from './types';

interface ProjectSidebarProps {
  projects: Project[];
  organizations: Organization[];
  selectedProjectId: string | null;
  isLoading: boolean;
  onSelectProject: (id: string | null) => void;
  onCreateProject: (name: string, description: string, orgId: string) => Promise<void>;
}

export default function ProjectSidebar({
  projects,
  organizations,
  selectedProjectId,
  isLoading,
  onSelectProject,
  onCreateProject,
}: ProjectSidebarProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [orgId, setOrgId] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    await onCreateProject(name.trim(), desc.trim(), orgId);
    setShowForm(false);
    setName('');
    setDesc('');
    setOrgId('');
  };

  return (
    <aside className="w-56 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">プロジェクト</h2>
          <Button
            onClick={() => setShowForm(!showForm)}
            icon={<Plus className="w-4 h-4" />}
            variant="ghost"
            size="sm"
            title="プロジェクト追加"
          />
        </div>
      </div>

      {showForm && (
        <Card variant="outlined" padding="sm" className="mx-3 my-3 border-b">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="プロジェクト名"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            autoFocus
          />
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="説明（任意）"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2 bg-white"
          >
            <option value="">組織を選択（任意）</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <Button onClick={handleCreate} variant="primary" size="sm" className="flex-1">
              作成
            </Button>
            <Button onClick={() => { setShowForm(false); setName(''); setDesc(''); setOrgId(''); }} variant="outline" size="sm">
              取消
            </Button>
          </div>
        </Card>
      )}

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={() => onSelectProject(null)}
          className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
            !selectedProjectId ? 'bg-white text-slate-900 font-medium shadow-sm border-l-2 border-blue-600' : 'text-slate-600 hover:bg-white'
          }`}
        >
          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          すべてのイベント
        </button>

        {isLoading ? (
          <div className="px-4 py-6 text-center text-slate-400 text-xs">読み込み中...</div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-400 text-xs">プロジェクトなし</div>
        ) : (
          projects.map((project) => {
            const statusConfig = PROJECT_STATUS_LABELS[project.status] || PROJECT_STATUS_LABELS.active;
            return (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                  selectedProjectId === project.id
                    ? 'bg-white text-slate-900 font-medium shadow-sm'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="truncate flex-1">
                  <span className="block truncate">{project.name}</span>
                  {project.organization_name && (
                    <span className="block text-[10px] text-slate-400 truncate">{project.organization_name}</span>
                  )}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
