'use client';

import { useState } from 'react';
import {
  ArrowDown, ArrowRight, Bot, Calendar, CheckCircle, Clock,
  Database, FileText, GitBranch, Inbox, Layers, MessageSquare,
  Mic, RefreshCw, Send, Sparkles, Users, Zap, Eye, Flag,
  ClipboardList, BarChart, Bell, Brain, Lightbulb
} from 'lucide-react';

// ─── 共通コンポーネント ───

function FlowNode({
  icon: Icon, label, sublabel, color, type
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sublabel?: string;
  color: string;
  type: 'auto' | 'manual' | 'ai' | 'data' | 'output';
}) {
  const colorMap: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700' },
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  icon: 'text-green-600',  badge: 'bg-green-100 text-green-700' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
    slate:  { bg: 'bg-slate-50',  border: 'border-slate-200',  icon: 'text-slate-600',  badge: 'bg-slate-100 text-slate-700' },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-600',    badge: 'bg-red-100 text-red-700' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  };
  const c = colorMap[color] || colorMap.slate;
  const typeLabel: Record<string, string> = {
    auto: '自動', manual: '手動', ai: 'AI', data: 'データ', output: '出力'
  };
  const typeBadgeColor: Record<string, string> = {
    auto: 'bg-green-100 text-green-700',
    manual: 'bg-amber-100 text-amber-700',
    ai: 'bg-purple-100 text-purple-700',
    data: 'bg-blue-100 text-blue-700',
    output: 'bg-indigo-100 text-indigo-700',
  };

  return (
    <div className={`relative rounded-lg border-2 ${c.border} ${c.bg} p-3 min-w-[140px]`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${c.icon} shrink-0`} />
        <span className="text-sm font-semibold text-slate-800">{label}</span>
      </div>
      {sublabel && <p className="text-xs text-slate-500 ml-6">{sublabel}</p>}
      <span className={`absolute -top-2.5 right-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeColor[type]}`}>
        {typeLabel[type]}
      </span>
    </div>
  );
}

function FlowArrow({ direction = 'down', label }: { direction?: 'down' | 'right'; label?: string }) {
  if (direction === 'right') {
    return (
      <div className="flex items-center gap-1 px-2 shrink-0">
        <div className="w-8 h-0.5 bg-slate-300" />
        <ArrowRight className="w-4 h-4 text-slate-400" />
        {label && <span className="text-[10px] text-slate-400 whitespace-nowrap">{label}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-0.5 h-4 bg-slate-300" />
      <ArrowDown className="w-4 h-4 text-slate-400" />
      {label && <span className="text-[10px] text-slate-400">{label}</span>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, description }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
        <Icon className="w-5 h-5 text-blue-600" />
        {title}
      </h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Legend() {
  const items = [
    { label: '手動', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { label: '自動', color: 'bg-green-100 text-green-700 border-green-200' },
    { label: 'AI処理', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    { label: 'データ', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { label: '出力', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-6 p-3 bg-white rounded-lg border border-slate-200">
      <span className="text-xs font-medium text-slate-500 mr-1 self-center">凡例:</span>
      {items.map(item => (
        <span key={item.label} className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${item.color}`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

// ─── フローセクション ───

function MeetingFlow() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <SectionTitle
        icon={Mic}
        title="経路1: 会議録パイプライン"
        description="会議の内容がAI解析を通じて、検討ツリー・タスク・決定事項に自動変換されます"
      />

      {/* ステップ1: 入口 */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <FlowNode icon={Mic} label="Google Meet会議" sublabel="Gemini「メモを取る」ON" color="amber" type="manual" />
        <FlowArrow direction="right" />
        <FlowNode icon={FileText} label="Gemini会議メモ" sublabel="Google Docs自動生成" color="green" type="auto" />
        <FlowArrow direction="right" />
        <FlowNode icon={RefreshCw} label="Cron取り込み" sublabel="48時間スキャン" color="green" type="auto" />
      </div>
      <FlowArrow />

      {/* ステップ2: AI解析 */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <FlowNode icon={Database} label="meeting_records" sublabel="会議録データ保存" color="blue" type="data" />
        <FlowArrow direction="right" />
        <FlowNode icon={Sparkles} label="Claude AI解析" sublabel="統一パイプライン" color="purple" type="ai" />
      </div>
      <FlowArrow />

      {/* ステップ3: 出力（多方向） */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <FlowNode icon={GitBranch} label="検討ツリー" sublabel="3-7テーマ × 子ノード" color="indigo" type="output" />
        <FlowNode icon={ClipboardList} label="タスク提案" sublabel="担当者ごとに集約" color="indigo" type="output" />
        <FlowNode icon={CheckCircle} label="決定事項" sublabel="decision_log" color="indigo" type="output" />
        <FlowNode icon={Lightbulb} label="未確定事項" sublabel="open_issues" color="indigo" type="output" />
        <FlowNode icon={Flag} label="MS提案" sublabel="自動承認→milestones" color="indigo" type="output" />
        <FlowNode icon={BarChart} label="ビジネスイベント" sublabel="タイムライン自動追加" color="indigo" type="output" />
      </div>
      <FlowArrow />

      {/* ステップ4: 通知 */}
      <div className="flex flex-wrap items-center gap-3">
        <FlowNode icon={Send} label="Slack通知" sublabel="Block Kitカード" color="green" type="auto" />
        <FlowNode icon={Send} label="Chatwork通知" sublabel="ネイティブタスク" color="green" type="auto" />
        <FlowNode icon={FileText} label="プロジェクトログ" sublabel="Google Docs追記" color="green" type="auto" />
      </div>

      {/* 手動入力の補足 */}
      <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
        <p className="text-xs text-amber-700">
          <span className="font-semibold">手動入力も可能:</span> 検討ツリータブからテキスト入力 → 同じAI解析パイプラインが実行されます
        </p>
      </div>
    </div>
  );
}

function ChannelFlow() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <SectionTitle
        icon={MessageSquare}
        title="経路2: チャネルメッセージ同期"
        description="Slack・Chatworkのメッセージが自動取り込みされ、タスクや通知の起点になります"
      />

      <div className="flex flex-wrap items-center gap-3 mb-2">
        <FlowNode icon={MessageSquare} label="Slack / Chatwork" sublabel="チャネルメッセージ" color="amber" type="manual" />
        <FlowArrow direction="right" />
        <FlowNode icon={RefreshCw} label="Cron同期" sublabel="メッセージ取り込み" color="green" type="auto" />
        <FlowArrow direction="right" />
        <FlowNode icon={Inbox} label="inbox_messages" sublabel="受信メッセージDB" color="blue" type="data" />
      </div>
      <FlowArrow />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <FlowNode icon={BarChart} label="ビジネスイベント" sublabel="自動生成" color="green" type="auto" />
        <FlowNode icon={GitBranch} label="検討ツリー統合" sublabel="チャネルトピック" color="green" type="auto" />
        <FlowNode icon={Brain} label="ナレッジ抽出" sublabel="キーワード自動抽出" color="green" type="auto" />
      </div>

      {/* ボットメンション */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-xs font-semibold text-slate-700 mb-2">@NodeMap メンション応答（7種）:</p>
        <div className="flex flex-wrap gap-1.5">
          {['課題', '決定事項', 'タスク', 'アジェンダ', 'まとめ', 'メニュー', 'タスク作成'].map(item => (
            <span key={item} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskFlow() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <SectionTitle
        icon={ClipboardList}
        title="タスクライフサイクル"
        description="タスクは3つの経路で生成され、完了するとMS進捗更新・外部同期まで自動実行されます"
      />

      {/* 生成元 */}
      <p className="text-xs font-semibold text-slate-600 mb-2">タスクの生成元（3経路）:</p>
      <div className="grid grid-cols-3 gap-3 mb-2">
        <FlowNode icon={Sparkles} label="会議録AI提案" sublabel="検討ツリータブで承認" color="purple" type="ai" />
        <FlowNode icon={MessageSquare} label="チャネルメッセージ" sublabel="@NodeMap タスク作成" color="green" type="auto" />
        <FlowNode icon={ClipboardList} label="手動作成" sublabel="カンバンで直接追加" color="amber" type="manual" />
      </div>
      <FlowArrow />

      {/* カンバン */}
      <FlowNode icon={Layers} label="統合カンバン" sublabel="todo → in_progress → review → done" color="blue" type="data" />
      <FlowArrow />

      {/* 完了時の連鎖 */}
      <p className="text-xs font-semibold text-slate-600 mb-2">タスク完了時の自動処理:</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FlowNode icon={Flag} label="MS進捗更新" sublabel="全完了→achieved" color="green" type="auto" />
        <FlowNode icon={Send} label="Slack同期" sublabel="カード完了表示" color="green" type="auto" />
        <FlowNode icon={Send} label="Chatwork同期" sublabel="タスク完了" color="green" type="auto" />
        <FlowNode icon={BarChart} label="タイムライン" sublabel="完了イベント追加" color="green" type="auto" />
      </div>
    </div>
  );
}

function WeeklyCycle() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <SectionTitle
        icon={Calendar}
        title="週次サイクル（自動配信）"
        description="定期配信とアジェンダ生成が自動で回り、会議の準備と振り返りを支援します"
      />

      <div className="space-y-3">
        {/* 会議前 */}
        <div className="flex items-start gap-3">
          <div className="w-20 shrink-0 text-right">
            <span className="text-xs font-semibold text-slate-500">会議前日</span>
            <p className="text-[10px] text-slate-400">21:00</p>
          </div>
          <div className="w-0.5 bg-blue-200 self-stretch shrink-0" />
          <div className="flex-1">
            <FlowNode icon={ClipboardList} label="アジェンダ自動生成" sublabel="MS進捗 + 未確定事項 + 決定確認 → プロジェクトログDoc" color="green" type="auto" />
          </div>
        </div>

        {/* 月曜 */}
        <div className="flex items-start gap-3">
          <div className="w-20 shrink-0 text-right">
            <span className="text-xs font-semibold text-blue-600">月曜</span>
            <p className="text-[10px] text-slate-400">09:00</p>
          </div>
          <div className="w-0.5 bg-blue-200 self-stretch shrink-0" />
          <div className="flex-1">
            <FlowNode icon={Bell} label="週次ブリーフィング" sublabel="今週のアジェンダ・タスク・会議予定 → 全PJチャネル" color="green" type="auto" />
          </div>
        </div>

        {/* 毎日 */}
        <div className="flex items-start gap-3">
          <div className="w-20 shrink-0 text-right">
            <span className="text-xs font-semibold text-amber-600">毎日</span>
            <p className="text-[10px] text-slate-400">09:30</p>
          </div>
          <div className="w-0.5 bg-amber-200 self-stretch shrink-0" />
          <div className="flex-1">
            <FlowNode icon={Zap} label="アラート配信" sublabel="期限超過タスク / stale未確定事項 / MS期限接近" color="red" type="auto" />
          </div>
        </div>

        {/* 金曜 */}
        <div className="flex items-start gap-3">
          <div className="w-20 shrink-0 text-right">
            <span className="text-xs font-semibold text-green-600">金曜</span>
            <p className="text-[10px] text-slate-400">17:00</p>
          </div>
          <div className="w-0.5 bg-green-200 self-stretch shrink-0" />
          <div className="flex-1">
            <FlowNode icon={BarChart} label="週次レポート" sublabel="完了タスク + 新規決定事項 + 新たな未確定事項 → 全PJチャネル" color="green" type="auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CronOverview() {
  const cronJobs = [
    { time: '06:00', label: 'カレンダー同期', icon: Calendar, desc: 'Google Calendar → NodeMap' },
    { time: '07:00', label: 'Gemini会議メモ取込', icon: Mic, desc: '48時間以内のMeet → meeting_records' },
    { time: '09:00', label: '月曜ブリーフィング', icon: Bell, desc: '全PJチャネルに今週の予定' },
    { time: '09:30', label: 'アラート', icon: Zap, desc: '期限超過・stale・MS接近' },
    { time: '17:00', label: '金曜レポート', icon: BarChart, desc: '全PJチャネルに今週の成果' },
    { time: '21:00', label: 'コンタクト分析', icon: Users, desc: 'プロフィール・パターン自動計算' },
    { time: '22:30', label: 'キーワード抽出', icon: Brain, desc: 'メッセージ → ナレッジ' },
    { time: '01:00', label: 'ビジネスイベント生成', icon: BarChart, desc: 'メッセージ → タイムライン' },
    { time: '01:30', label: '検討ツリー統合', icon: GitBranch, desc: 'チャネルメッセージ → ツリー' },
    { time: '04:30', label: '未確定事項更新', icon: Lightbulb, desc: '滞留日数・stale判定' },
    { time: '05:00', label: 'アジェンダ生成', icon: ClipboardList, desc: '翌営業日分を自動作成' },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <SectionTitle
        icon={Clock}
        title="Cronジョブ一覧（自動バッチ処理）"
        description="毎日自動で実行される裏方の処理。すべて自動で動き、手動操作は不要です"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {cronJobs.map(job => (
          <div key={job.time + job.label} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-xs font-mono text-slate-400 w-12 shrink-0">{job.time}</span>
            <job.icon className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-medium text-slate-700">{job.label}</span>
              <span className="text-[10px] text-slate-400 ml-1.5">{job.desc}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-3">※ 時刻はJST。実際のUTC変換はvercel.jsonで設定</p>
    </div>
  );
}

function DataTable() {
  const tables = [
    { name: 'meeting_records', source: '会議録', created: 'Cron / 手動', usedBy: 'AI解析 → 検討ツリー・タスク・決定事項', color: 'blue' },
    { name: 'inbox_messages', source: 'Slack / CW', created: 'Cron同期', usedBy: 'インボックス・ボット応答・タスク生成', color: 'blue' },
    { name: 'decision_tree_nodes', source: 'AI解析', created: '自動（会議録解析時）', usedBy: '検討ツリー表示・ノード状態管理', color: 'indigo' },
    { name: 'tasks', source: 'AI提案 / メッセージ / 手動', created: '承認 or 自動 or 手動', usedBy: 'カンバン・カレンダー・外部同期', color: 'green' },
    { name: 'milestones', source: 'AI提案', created: '自動承認', usedBy: 'タスク階層・週次サイクル・進捗管理', color: 'green' },
    { name: 'decision_log', source: 'AI解析', created: '自動抽出', usedBy: 'ボット応答・アジェンダ・変更チェーン', color: 'purple' },
    { name: 'open_issues', source: 'AI解析', created: '自動検出', usedBy: 'ボット応答・アジェンダ・staleアラート', color: 'purple' },
    { name: 'business_events', source: '各種パイプライン', created: '自動', usedBy: 'タイムライン表示（読み取り専用）', color: 'slate' },
    { name: 'task_suggestions', source: 'AI解析', created: '自動', usedBy: '検討ツリータブで承認 → tasks', color: 'amber' },
    { name: 'boss_feedback_learnings', source: 'AI解析', created: '自動抽出', usedBy: 'タスクAI会話に判断基準を注入', color: 'purple' },
    { name: 'project_channels', source: 'メンバータブ', created: '手動登録', usedBy: 'チャネル同期・ボット応答・通知先', color: 'amber' },
    { name: 'contact_persons', source: 'チャネル自動取込 / 手動', created: '自動 or 手動', usedBy: '担当者解決・メンバー管理', color: 'slate' },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <SectionTitle
        icon={Database}
        title="主要データテーブルの流れ"
        description="各テーブルがどこで生成され、どこで使われているか"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 pr-3 font-semibold text-slate-600">テーブル</th>
              <th className="text-left py-2 pr-3 font-semibold text-slate-600">データ元</th>
              <th className="text-left py-2 pr-3 font-semibold text-slate-600">生成方法</th>
              <th className="text-left py-2 font-semibold text-slate-600">活用先</th>
            </tr>
          </thead>
          <tbody>
            {tables.map(t => (
              <tr key={t.name} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-mono text-slate-700 font-medium">{t.name}</td>
                <td className="py-2 pr-3 text-slate-500">{t.source}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    t.created.includes('自動') ? 'bg-green-50 text-green-700' :
                    t.created.includes('手動') ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-50 text-slate-600'
                  }`}>{t.created}</span>
                </td>
                <td className="py-2 text-slate-500">{t.usedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverallDiagram() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
      <SectionTitle
        icon={Eye}
        title="全体マップ"
        description="NodeMapのデータの流れを一枚で俯瞰"
      />

      {/* 入口 */}
      <div className="text-center mb-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">入口（2つだけ）</p>
      </div>
      <div className="flex justify-center gap-6 mb-2">
        <FlowNode icon={Mic} label="会議（Gemini）" color="amber" type="manual" />
        <FlowNode icon={MessageSquare} label="チャネル（Slack/CW）" color="amber" type="manual" />
      </div>

      <div className="flex justify-center">
        <FlowArrow />
      </div>

      {/* 処理 */}
      <div className="text-center mb-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">自動処理</p>
      </div>
      <div className="flex justify-center gap-4 mb-2 flex-wrap">
        <FlowNode icon={RefreshCw} label="Cron取り込み" color="green" type="auto" />
        <FlowNode icon={Sparkles} label="Claude AI解析" color="purple" type="ai" />
      </div>

      <div className="flex justify-center">
        <FlowArrow />
      </div>

      {/* データ生成 */}
      <div className="text-center mb-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">自動生成データ</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <FlowNode icon={GitBranch} label="検討ツリー" color="indigo" type="output" />
        <FlowNode icon={ClipboardList} label="タスク提案" color="indigo" type="output" />
        <FlowNode icon={CheckCircle} label="決定事項" color="indigo" type="output" />
        <FlowNode icon={Lightbulb} label="未確定事項" color="indigo" type="output" />
        <FlowNode icon={Flag} label="マイルストーン" color="indigo" type="output" />
        <FlowNode icon={BarChart} label="タイムライン" color="indigo" type="output" />
        <FlowNode icon={Brain} label="ナレッジ" color="indigo" type="output" />
        <FlowNode icon={Users} label="コンタクト" color="indigo" type="output" />
      </div>

      <div className="flex justify-center">
        <FlowArrow />
      </div>

      {/* 活用 */}
      <div className="text-center mb-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">活用先</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FlowNode icon={Layers} label="カンバン" sublabel="タスク管理" color="blue" type="data" />
        <FlowNode icon={Send} label="チャネル通知" sublabel="Slack / Chatwork" color="green" type="auto" />
        <FlowNode icon={Calendar} label="カレンダー" sublabel="予定・アジェンダ" color="blue" type="data" />
        <FlowNode icon={FileText} label="プロジェクトログ" sublabel="Google Docs（正史）" color="blue" type="data" />
      </div>
    </div>
  );
}

// ─── メインコンポーネント ───

export default function DataFlowTab() {
  const [section, setSection] = useState<'overview' | 'meeting' | 'channel' | 'task' | 'cycle' | 'cron' | 'table'>('overview');

  const sections = [
    { id: 'overview' as const, label: '全体マップ', icon: Eye },
    { id: 'meeting' as const, label: '会議録', icon: Mic },
    { id: 'channel' as const, label: 'チャネル', icon: MessageSquare },
    { id: 'task' as const, label: 'タスク', icon: ClipboardList },
    { id: 'cycle' as const, label: '週次サイクル', icon: Calendar },
    { id: 'cron' as const, label: 'Cron一覧', icon: Clock },
    { id: 'table' as const, label: 'データ一覧', icon: Database },
  ];

  return (
    <div>
      <Legend />

      {/* セクション切替 */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {sections.map(s => {
          const Icon = s.icon;
          const isActive = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* セクション内容 */}
      {section === 'overview' && <OverallDiagram />}
      {section === 'meeting' && <MeetingFlow />}
      {section === 'channel' && <ChannelFlow />}
      {section === 'task' && <TaskFlow />}
      {section === 'cycle' && <WeeklyCycle />}
      {section === 'cron' && <CronOverview />}
      {section === 'table' && <DataTable />}
    </div>
  );
}
