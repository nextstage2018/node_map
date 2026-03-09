'use client';

import { useState } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import {
  Bot, Inbox, Building2, Settings, BookOpen,
  MessageSquare, ListTodo, Briefcase, GitBranch,
  Clock, Brain, Flag, ChevronRight, Lightbulb,
  Calendar, FileText, BarChart, CheckCircle,
  ArrowRight, Layers, Users, FolderOpen
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'はじめに', icon: BookOpen },
  { id: 'secretary', label: '秘書', icon: Bot },
  { id: 'inbox', label: 'インボックス', icon: Inbox },
  { id: 'organizations', label: '組織・プロジェクト', icon: Building2 },
  { id: 'settings', label: '設定', icon: Settings },
];

function SectionCard({ title, children, icon: Icon }: {
  title: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 mb-4">
      <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-blue-600" />}
        {title}
      </h3>
      <div className="text-sm text-slate-600 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function ExampleBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 my-2 text-sm text-slate-700 font-mono">
      {children}
    </div>
  );
}

function FlowStep({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 my-3 text-sm">
      {steps.map((step, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 whitespace-nowrap">
            {step}
          </span>
          {i < steps.length - 1 && <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />}
        </span>
      ))}
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${colorMap[color] || colorMap.slate}`}>
      {label}
    </span>
  );
}

// ─── Tab Contents ───

function OverviewTab() {
  return (
    <div>
      <SectionCard title="NodeMapとは" icon={Lightbulb}>
        <p className="mb-3">
          NodeMapは「情報を受け取り → 整理し → 活用する」ためのコミュニケーション＆ビジネスログツールです。
          AI秘書に話しかけるだけで、プロジェクト管理・メッセージ対応・タスク整理をサポートします。
        </p>
      </SectionCard>

      <SectionCard title="データの入口は2つだけ" icon={FolderOpen}>
        <p className="mb-3">NodeMapでは手動でデータを「登録」する必要はありません。以下の2つの経路から自動的にデータが整理されます。</p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <FileText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">会議録</p>
              <p className="text-slate-600">検討ツリータブから登録、またはMeetGeek連携で自動取り込み。AIが解析し、検討ツリー・ナレッジ・タスク候補を自動生成します。</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <MessageSquare className="w-5 h-5 text-slate-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">チャネルメッセージ</p>
              <p className="text-slate-600">Slack・Chatworkの連携チャネルから自動同期。ビジネスイベントやナレッジとして蓄積されます。</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="5階層のデータ構造" icon={Layers}>
        <FlowStep steps={['組織', 'プロジェクト', 'テーマ（任意）', 'マイルストーン', 'タスク']} />
        <p className="mt-2">
          組織の中にプロジェクトがあり、プロジェクトの中にマイルストーン（1週間単位の目標）、
          その下にタスクがぶら下がります。テーマは任意の中間レイヤーです。
        </p>
      </SectionCard>

      <SectionCard title="タスクとジョブの違い" icon={ListTodo}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="font-medium text-slate-800 mb-1 flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-blue-600" /> タスク
            </p>
            <p>思考を伴う作業。マイルストーン配下に必ず配置。AIと壁打ちしながら進められます。</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="font-medium text-slate-800 mb-1 flex items-center gap-1">
              <Briefcase className="w-4 h-4 text-slate-600" /> ジョブ
            </p>
            <p>定型業務。プロジェクトへの紐づけは任意。AIに構造化や対応を任せられます。</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="画面構成" icon={BookOpen}>
        <div className="space-y-2">
          {[
            { icon: Bot, label: '秘書', desc: 'ホーム画面。AIに話しかけてすべての操作の起点に' },
            { icon: Inbox, label: 'インボックス', desc: 'メール・Slack・Chatworkの受信メッセージ一覧' },
            { icon: Building2, label: '組織・プロジェクト', desc: '組織とプロジェクトの管理。タイムライン・検討ツリー等' },
            { icon: Settings, label: '設定', desc: 'チャネル接続・プロフィール・ナレッジ確認' },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3 p-2">
              <item.icon className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-slate-800">{item.label}</span>
                <span className="text-slate-500"> — {item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function SecretaryTab() {
  return (
    <div>
      <SectionCard title="AI秘書の使い方" icon={Bot}>
        <p className="mb-3">
          ホーム画面のチャットでAI秘書に話しかけると、意図を自動判定して適切な操作を実行します。
          テキスト入力のほか、画面に表示されるカード型UIや選択チップからも操作できます。
        </p>
      </SectionCard>

      <SectionCard title="話しかけ方の例" icon={MessageSquare}>
        <div className="space-y-2">
          <p className="font-medium text-slate-700 mb-1">日常の確認</p>
          <ExampleBox>
            「今日の状況を教えて」<br />
            「未読メッセージある？」<br />
            「今日の予定を確認して」
          </ExampleBox>

          <p className="font-medium text-slate-700 mb-1 mt-4">タスク・プロジェクト操作</p>
          <ExampleBox>
            「タスクを作成して」<br />
            「マイルストーンの進捗を教えて」<br />
            「〇〇プロジェクトのタスク一覧」
          </ExampleBox>

          <p className="font-medium text-slate-700 mb-1 mt-4">作成・登録</p>
          <ExampleBox>
            「組織を作成して」<br />
            「プロジェクトを作って」<br />
            「会議録をアップロードしたい」
          </ExampleBox>

          <p className="font-medium text-slate-700 mb-1 mt-4">分析・相談</p>
          <ExampleBox>
            「週間の活動サマリーを見せて」<br />
            「このタスクの進め方を相談したい」<br />
            「ナレッジを整理して」
          </ExampleBox>
        </div>
      </SectionCard>

      <SectionCard title="カード型選択UI" icon={ChevronRight}>
        <p className="mb-2">秘書は状況に応じてカード型のUIを表示します。テキスト入力なしでタップ操作できます。</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <Badge color="blue" label="アクション選択" />
            <span>プロジェクト文脈での次のアクション候補</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge color="slate" label="プロジェクト選択" />
            <span>プロジェクト未指定時にPJを選ぶ</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge color="green" label="マイルストーン選択" />
            <span>タスク作成時にMSを選ぶ</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge color="indigo" label="マイルストーン一覧" />
            <span>開閉式で進捗・期日・タスク件数を確認</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="動的選択肢（チップボタン）" icon={Lightbulb}>
        <p>
          AIの回答の下に、青いチップボタンが表示されることがあります。
          これは今の文脈に合った次のアクション候補です。タップするとそのまま秘書に指示が送られます。
        </p>
      </SectionCard>
    </div>
  );
}

function InboxTab() {
  return (
    <div>
      <SectionCard title="インボックスとは" icon={Inbox}>
        <p>
          メール・Slack・Chatworkから届いたメッセージをまとめて確認できる画面です。
          チャネルごとのフィルタや既読管理に対応しています。
        </p>
      </SectionCard>

      <SectionCard title="基本の使い方" icon={MessageSquare}>
        <div className="space-y-3">
          <div>
            <p className="font-medium text-slate-700 mb-1">メッセージ一覧</p>
            <p>左側にメッセージ一覧、右側に選択中のメッセージ詳細が表示されます。未読メッセージにはバッジが付きます。</p>
          </div>
          <div>
            <p className="font-medium text-slate-700 mb-1">フィルタ</p>
            <p>チャネル種別（Slack / Chatwork / メール）や、既読・未読でフィルタリングできます。</p>
          </div>
          <div>
            <p className="font-medium text-slate-700 mb-1">AI返信下書き</p>
            <p>メッセージを選択して「返信」すると、AIが文脈に合った返信文を下書き生成します。過去のやり取りや相手の情報も考慮されます。</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="秘書からのアクセス" icon={Bot}>
        <p>ホーム画面で「未読メッセージある？」と聞くと、秘書がインボックスの概要を教えてくれます。</p>
      </SectionCard>
    </div>
  );
}

function OrganizationsTab() {
  return (
    <div>
      <SectionCard title="組織・プロジェクト管理" icon={Building2}>
        <p>
          組織の中にプロジェクトを作り、プロジェクトごとにタイムライン・検討ツリー・タスクなどを管理します。
          左側にツリー構造のナビゲーション、右側にタブコンテンツが表示されます。
        </p>
      </SectionCard>

      <SectionCard title="組織の作成" icon={Users}>
        <p>「組織・プロジェクト」画面の右上ボタン、または秘書に「組織を作成して」と依頼します。ドメイン重複チェックがあるため、同じドメインの組織は1つだけです。</p>
      </SectionCard>

      <SectionCard title="プロジェクト詳細の5つのタブ" icon={FolderOpen}>
        <div className="space-y-3 mt-2">
          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-blue-500" /> タイムライン
            </p>
            <p>プロジェクトのビジネスログを時系列で表示します。会議・メッセージ・タスク完了・ファイル共有などが自動記録されます。</p>
            <p className="text-xs text-slate-400 mt-1">※ 読み取り専用。手動追加はできません。</p>
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <GitBranch className="w-4 h-4 text-blue-500" /> 検討ツリー
            </p>
            <p>会議録をここから登録すると、AIが自動解析して検討項目をツリー構造で整理します。意思決定の経緯が可視化されます。</p>
            <FlowStep steps={['会議録登録', 'AI解析', 'ツリー自動生成', 'ビジネスイベント追加']} />
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-blue-500" /> 思考マップ
            </p>
            <p>マイルストーン間の思考経路を可視化します。タスクの会話ログからAIが思考の流れを構造化します。</p>
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <ListTodo className="w-4 h-4 text-blue-500" /> タスク
            </p>
            <p>テーマ → マイルストーン → タスクの階層で管理します。マイルストーンは1週間単位の目標で、週末に到達判定されます。</p>
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Briefcase className="w-4 h-4 text-blue-500" /> ジョブ
            </p>
            <p>定型業務のリストです。AIに構造化や対応を任せることができます。</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="タイムラインの自動記録" icon={BarChart}>
        <p className="mb-2">タイムラインには以下の種別が自動で記録されます。</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Badge color="blue" label="会議" />
          <Badge color="slate" label="メッセージ" />
          <Badge color="green" label="タスク完了" />
          <Badge color="amber" label="ファイル共有" />
          <Badge color="red" label="マイルストーン" />
          <Badge color="indigo" label="週次サマリー" />
        </div>
      </SectionCard>
    </div>
  );
}

function SettingsTab() {
  return (
    <div>
      <SectionCard title="設定画面の概要" icon={Settings}>
        <p>チャネル接続の管理、プロフィール設定、ナレッジの確認ができます。</p>
      </SectionCard>

      <SectionCard title="チャネル接続" icon={MessageSquare}>
        <div className="space-y-2">
          <p>以下のサービスと連携できます。設定画面の「チャネル」タブから接続してください。</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="font-medium">Google Calendar</span>
              <span className="text-slate-500">— 予定の確認・空き時間検索</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded">
              <FileText className="w-4 h-4 text-green-500" />
              <span className="font-medium">Gmail</span>
              <span className="text-slate-500">— メール同期</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded">
              <MessageSquare className="w-4 h-4 text-purple-500" />
              <span className="font-medium">Slack</span>
              <span className="text-slate-500">— チャネルメッセージ同期</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded">
              <MessageSquare className="w-4 h-4 text-teal-500" />
              <span className="font-medium">Chatwork</span>
              <span className="text-slate-500">— ルームメッセージ同期</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="プロフィール・AI設定" icon={Users}>
        <p>
          「プロフィール」タブでは、AIの応答スタイルや性格タイプを設定できます。
          これにより秘書やタスクAIの口調・思考パターンがカスタマイズされます。
        </p>
      </SectionCard>

      <SectionCard title="ナレッジ" icon={Brain}>
        <p>
          「ナレッジ」タブでは、会議録やメッセージから自動抽出されたキーワード・知見を確認できます。
          ナレッジはAIが自動的に参照し、プロジェクトの文脈理解に活用します。
        </p>
      </SectionCard>
    </div>
  );
}

// ─── Main ───

export default function GuidePage() {
  const [activeTab, setActiveTab] = useState('overview');

  const tabContent: Record<string, React.ReactNode> = {
    overview: <OverviewTab />,
    secretary: <SecretaryTab />,
    inbox: <InboxTab />,
    organizations: <OrganizationsTab />,
    settings: <SettingsTab />,
  };

  return (
    <AppLayout>
      <ContextBar title="ガイド" subtitle="NodeMapの使い方" />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Tab navigation */}
          <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {tabContent[activeTab]}
        </div>
      </div>
    </AppLayout>
  );
}
