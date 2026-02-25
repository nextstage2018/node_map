// Phase 30b: 初回セットアップウィザード
'use client';

import { useState } from 'react';
import { X, Building2, Users, FolderOpen, ChevronRight, ChevronLeft, Check, Plus, Trash2 } from 'lucide-react';

interface SetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

// チームメンバー入力行
interface TeamMemberRow {
  name: string;
  email: string;
}

const STEPS = [
  { label: '自社情報', icon: Building2 },
  { label: 'チームメンバー', icon: Users },
  { label: 'プロジェクト', icon: FolderOpen },
];

export default function SetupWizard({ isOpen, onClose, onCompleted }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepCompleted, setStepCompleted] = useState<boolean[]>([false, false, false]);

  // ステップ1: 自社情報
  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');

  // ステップ2: チームメンバー
  const [members, setMembers] = useState<TeamMemberRow[]>([
    { name: '', email: '' },
  ]);

  // ステップ3: プロジェクト
  const [projectName, setProjectName] = useState('');

  // メンバー行の追加・削除・更新
  const addMemberRow = () => {
    setMembers([...members, { name: '', email: '' }]);
  };

  const removeMemberRow = (index: number) => {
    if (members.length <= 1) return;
    setMembers(members.filter((_, i) => i !== index));
  };

  const updateMember = (index: number, field: 'name' | 'email', value: string) => {
    const updated = [...members];
    updated[index] = { ...updated[index], [field]: value };
    setMembers(updated);
  };

  // ステップ1: 自社情報の保存
  const saveCompany = async () => {
    if (!companyName.trim()) {
      setError('会社名は必須です');
      return false;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName.trim(),
          domain: companyDomain.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || '保存に失敗しました');
        return false;
      }
      return true;
    } catch {
      setError('通信エラーが発生しました');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // ステップ2: チームメンバー登録
  const saveMembers = async () => {
    const validMembers = members.filter((m) => m.name.trim());
    if (validMembers.length === 0) {
      // メンバー未入力はスキップ可能
      return true;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      for (const member of validMembers) {
        const res = await fetch('/api/contacts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: member.name.trim(),
            address: member.email.trim() || undefined,
            isTeamMember: true,
            mainChannel: 'email',
            messageCount: 0,
            lastContactAt: new Date().toISOString(),
            relationshipType: 'internal',
            confirmed: true,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(`${member.name} の登録に失敗: ${data.error}`);
          return false;
        }
      }
      return true;
    } catch {
      setError('通信エラーが発生しました');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // ステップ3: プロジェクト登録（ノードとして保存）
  const saveProject = async () => {
    if (!projectName.trim()) {
      // プロジェクト未入力はスキップ可能
      return true;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      // Phase 30b: プロジェクト名をノードとして登録
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: projectName.trim(),
          type: 'project',
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'プロジェクト登録に失敗しました');
        return false;
      }
      return true;
    } catch {
      setError('通信エラーが発生しました');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // 次へ進む
  const handleNext = async () => {
    setError(null);
    let success = false;

    if (currentStep === 0) {
      success = await saveCompany();
    } else if (currentStep === 1) {
      success = await saveMembers();
    } else if (currentStep === 2) {
      success = await saveProject();
      if (success) {
        const newCompleted = [...stepCompleted];
        newCompleted[2] = true;
        setStepCompleted(newCompleted);
        onCompleted();
        onClose();
        return;
      }
    }

    if (success) {
      const newCompleted = [...stepCompleted];
      newCompleted[currentStep] = true;
      setStepCompleted(newCompleted);
      setCurrentStep(currentStep + 1);
    }
  };

  // 前に戻る
  const handlePrev = () => {
    if (currentStep > 0) {
      setError(null);
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">初回セットアップ</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ステップインジケーター */}
        <div className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-200">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === currentStep;
            const isDone = stepCompleted[i];
            return (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <div className="w-6 h-px bg-slate-300" />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {isDone ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* コンテンツ */}
        <div className="px-5 py-5 min-h-[240px]">
          {error && (
            <div className="mb-4 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* ステップ1: 自社情報 */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 mb-4">
                まず、自社の情報を登録してください。メールドメインでコンタクトを自動マッチングします。
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  会社名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="例: 株式会社ネクストステージ"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  メールドメイン
                </label>
                <input
                  type="text"
                  value={companyDomain}
                  onChange={(e) => setCompanyDomain(e.target.value)}
                  placeholder="例: nextstage.co.jp"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  このドメインのメールアドレスを持つコンタクトが自動的に自社メンバーとして判定されます
                </p>
              </div>
            </div>
          )}

          {/* ステップ2: チームメンバー */}
          {currentStep === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-3">
                一緒に仕事をするチームメンバーを登録してください（後から追加可能）。
              </p>
              {members.map((member, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => updateMember(i, 'name', e.target.value)}
                    placeholder="名前"
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    value={member.email}
                    onChange={(e) => updateMember(i, 'email', e.target.value)}
                    placeholder="メールアドレス"
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => removeMemberRow(i)}
                    disabled={members.length <= 1}
                    className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addMemberRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                メンバーを追加
              </button>
              <p className="text-[10px] text-slate-400">
                スキップして後から追加することもできます
              </p>
            </div>
          )}

          {/* ステップ3: プロジェクト */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 mb-4">
                現在進行中のプロジェクト名を登録してください（後から追加可能）。
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  プロジェクト名
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="例: Webサイトリニューアル"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  スキップして後から追加することもできます
                </p>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            戻る
          </button>
          <div className="flex items-center gap-2">
            {currentStep < 2 && (
              <button
                onClick={() => { setError(null); setCurrentStep(currentStep + 1); }}
                className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                スキップ
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? '保存中...' : currentStep === 2 ? '完了' : '次へ'}
              {currentStep < 2 && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
