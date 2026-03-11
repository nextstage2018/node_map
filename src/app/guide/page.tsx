'use client';

import { useState } from 'react';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import {
  Bot, Inbox, Building2, Settings, BookOpen,
  MessageSquare, ListTodo, Briefcase, GitBranch,
  Clock, Brain, Flag, ChevronRight, Lightbulb,
  Calendar, FileText, BarChart, CheckCircle,
  ArrowRight, Layers, Users, FolderOpen,
  HardDrive, ClipboardList, KanbanSquare,
  UserCheck, User, Sparkles, ThumbsUp, ThumbsDown,
  Pencil, GripVertical, Eye, RefreshCw, Hash, Bell, Send
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'はじめに', icon: BookOpen },
  { id: 'secretary', label: '秘書', icon: Bot },
  { id: 'tasks', label: 'タスク', icon: KanbanSquare },
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
        <FlowStep steps={['組織', 'プロジェクト', 'ゴール（フェーズ）', 'マイルストーン', 'タスク']} />
        <p className="mt-2">
          組織の中にプロジェクトがあり、ゴール（フェーズ）でプロジェクトの段階を管理します。
          マイルストーン（1週間単位の目標）の下にタスクがぶら下がります。
        </p>
      </SectionCard>

      <SectionCard title="タスクとジョブの違い" icon={ListTodo}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="font-medium text-slate-800 mb-1 flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-blue-600" /> タスク
            </p>
            <p>思考を伴う作業。マイルストーン配下に配置。カンバンボードで管理し、AIと壁打ちしながら進められます。Slack・Chatworkからの自動提案にも対応。</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="font-medium text-slate-800 mb-1 flex items-center gap-1">
              <Briefcase className="w-4 h-4 text-slate-600" /> ジョブ
            </p>
            <p>定型業務ややることメモ。プロジェクトへの紐づけは任意。AIに構造化や対応を任せられます。</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">※ 詳しくは「タスク」タブのガイドをご覧ください。</p>
      </SectionCard>

      <SectionCard title="画面構成" icon={BookOpen}>
        <div className="space-y-2">
          {[
            { icon: Bot, label: '秘書', desc: 'ホーム画面。AIに話しかけてすべての操作の起点に' },
            { icon: KanbanSquare, label: 'タスク', desc: 'カンバンボードでタスク管理。AI提案の承認・詳細編集・AIに相談' },
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

function TasksTab() {
  return (
    <div>
      <SectionCard title="タスク管理の全体像" icon={KanbanSquare}>
        <p className="mb-3">
          サイドメニューの「タスク」を開くと、自分が関わるタスクをカンバンボード形式で一覧できます。
          カードをドラッグして状況を変えたり、クリックして詳細を確認・編集したりできます。
        </p>
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-slate-600">
          <p className="font-medium text-slate-700 mb-1">ポイント</p>
          <p>タスクは手動で作ることもできますが、Slack・Chatworkのメッセージや会議録からAIが自動で提案してくれるのが特長です。</p>
        </div>
      </SectionCard>

      <SectionCard title="カンバンボード" icon={GripVertical}>
        <p className="mb-3">
          タスクは4つの列に分かれて表示されます。カードをドラッグ＆ドロップするだけで状況を更新できます。
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="p-2 bg-slate-50 rounded border border-slate-200 text-center">
            <p className="text-xs font-medium text-slate-500">未着手</p>
            <p className="text-xs text-slate-400 mt-0.5">Todo</p>
          </div>
          <div className="p-2 bg-blue-50 rounded border border-blue-200 text-center">
            <p className="text-xs font-medium text-blue-600">進行中</p>
            <p className="text-xs text-blue-400 mt-0.5">In Progress</p>
          </div>
          <div className="p-2 bg-amber-50 rounded border border-amber-200 text-center">
            <p className="text-xs font-medium text-amber-600">レビュー</p>
            <p className="text-xs text-amber-400 mt-0.5">Review</p>
          </div>
          <div className="p-2 bg-green-50 rounded border border-green-200 text-center">
            <p className="text-xs font-medium text-green-600">完了</p>
            <p className="text-xs text-green-400 mt-0.5">Done</p>
          </div>
        </div>

        <div className="space-y-2 mt-3">
          <p className="font-medium text-slate-700 text-sm">個人タスクとチームタスク</p>
          <div className="flex gap-2 items-start">
            <Badge color="blue" label="個人" />
            <span className="text-sm text-slate-600">自分だけのタスク。他の人には見えません。</span>
          </div>
          <div className="flex gap-2 items-start">
            <Badge color="indigo" label="チーム" />
            <span className="text-sm text-slate-600">チームメンバーと共有するタスク。依頼者や担当者が自動でセットされます。</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">画面上部の切り替えボタンで個人/チームを切り替えられます。</p>
        </div>
      </SectionCard>

      <SectionCard title="タスク詳細パネル" icon={Eye}>
        <p className="mb-3">
          カンバン上のカードをクリックすると、右側にタスクの詳細パネルが開きます。ここでタスクの情報を確認・編集できます。
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-2">
            <Pencil className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-slate-800">タイトル</span>
              <span className="text-slate-500"> — クリックするとその場で編集できます。Enterで保存、Escでキャンセルです。</span>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2">
            <Calendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-slate-800">期限</span>
              <span className="text-slate-500"> — 日付を選ぶとすぐに保存されます。期限切れは赤、今日は黄色、余裕があれば緑で表示されます。</span>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2">
            <UserCheck className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-slate-800">依頼者</span>
              <span className="text-slate-500"> — メッセージの送信者が自動でセットされます（後述の自動判定ルール参照）。</span>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2">
            <User className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-slate-800">担当者</span>
              <span className="text-slate-500"> — メッセージのTO先（メンション先）が自動でセットされます。</span>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2">
            <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-slate-800">AI要約</span>
              <span className="text-slate-500"> — タスクに関するAIの会話がある場合、自動で要約が表示されます。</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="AIタスク提案のしくみ" icon={Sparkles}>
        <p className="mb-3">
          Slack・Chatworkのメッセージや会議録から、AIが「これはタスクにした方がいいかも」というものを自動で提案してくれます。
        </p>
        <FlowStep steps={['メッセージ受信', 'AIがアクション検知', '提案カード表示', 'あなたが承認/却下']} />

        <div className="mt-3 space-y-2">
          <p className="font-medium text-slate-700 text-sm">AIが検知するメッセージの例</p>
          <ExampleBox>
            「資料を作成して送ってください」<br />
            「来週までに確認をお願いします」<br />
            「至急対応してほしい件があります」
          </ExampleBox>

          <p className="font-medium text-slate-700 text-sm mt-3">提案カードでできること</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 text-green-500" />
              <span className="text-sm"><span className="font-medium">承認</span> — タスクとして登録されます。タイトル・期限・担当者を編集して承認できます。</span>
            </div>
            <div className="flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-red-400" />
              <span className="text-sm"><span className="font-medium">却下</span> — タスクにしません。AIはこの判断を学習し、次回から似たメッセージの提案を控えます。</span>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200 text-xs text-slate-600">
          <p className="font-medium text-slate-700 mb-1">AIの学習機能</p>
          <p>却下した提案のパターンをAIが学習します。たとえば「了解しました」のような挨拶メッセージを何度か却下すると、以降は同じようなメッセージからは提案しなくなります。</p>
        </div>
      </SectionCard>

      <SectionCard title="依頼者・担当者の自動判定ルール" icon={UserCheck}>
        <p className="mb-3">
          チャネルメッセージからタスクが提案される際、「誰からの依頼か」「誰が担当すべきか」を以下のルールで自動判定します。
        </p>

        <div className="space-y-3">
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
            <p className="font-medium text-slate-800 mb-1 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-500" /> 依頼者 = メッセージの送り主
            </p>
            <p className="text-sm text-slate-600">
              「〇〇をお願いします」と書いた人が依頼者になります。
              社内メンバーでもクライアントでも同じルールです。
            </p>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="font-medium text-slate-800 mb-1 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> 担当候補 = TO先・メンション先
            </p>
            <p className="text-sm text-slate-600">
              SlackのTO先（@メンション）やChatworkのTO先がそのまま担当候補になります。
              承認時に変更もできます。
            </p>
          </div>
        </div>

        <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="font-medium text-slate-700 text-sm mb-2">具体例</p>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 font-mono text-xs bg-blue-50 px-1.5 py-0.5 rounded shrink-0">Slack</span>
              <div>
                <p className="font-mono text-xs bg-slate-100 px-2 py-1 rounded mb-1">田中さん: @佐藤 提案書の確認をお願いします</p>
                <p>→ 依頼者: 田中さん、担当候補: 佐藤さん</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-teal-500 font-mono text-xs bg-teal-50 px-1.5 py-0.5 rounded shrink-0">CW</span>
              <div>
                <p className="font-mono text-xs bg-slate-100 px-2 py-1 rounded mb-1">[To:佐藤] 来週までに見積もり作成をお願いします</p>
                <p>→ 依頼者: 送信者、担当候補: 佐藤さん</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-slate-600">
          <p className="font-medium text-slate-700 mb-1">大事なルール: 1プロジェクト = 1チャネル</p>
          <p>
            タスクが正しいプロジェクトに紐づくためには、プロジェクトの「メンバー」タブでSlackチャネル（またはChatworkルーム）を登録しておく必要があります。
            1つのチャネル = 1つのプロジェクトという対応関係がNodeMapの基本ルールです。
          </p>
        </div>
      </SectionCard>

      <SectionCard title="AIに相談する" icon={Brain}>
        <p className="mb-2">
          タスクの詳細パネルにある「AIに相談」ボタンをタップすると、そのタスクについてAIと壁打ちできます。
        </p>
        <div className="space-y-2 text-sm text-slate-600">
          <p>AIはタスクの内容・プロジェクトの背景・過去の会話を踏まえて、一緒に考えてくれます。</p>
          <ExampleBox>
            「この提案書のアウトラインを考えて」<br />
            「クライアントへの報告をどう構成するか相談したい」<br />
            「このタスクの進め方がわからない」
          </ExampleBox>
          <p className="text-xs text-slate-400">※ AIとの会話内容は自動で要約され、タスク詳細パネルの「AI要約」に反映されます。</p>
        </div>
      </SectionCard>

      <SectionCard title="タスク作成のまとめ" icon={CheckCircle}>
        <p className="mb-3 text-sm text-slate-600">タスクを作る方法は3通りあります。おすすめは自動提案からの承認です。</p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
            <Sparkles className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">AI自動提案から承認（おすすめ）</p>
              <p className="text-sm text-slate-600">Slack・Chatwork・会議録からAIが検知。承認するだけでタスク化されます。依頼者・担当者も自動セット。</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <Bot className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">秘書に頼む</p>
              <p className="text-sm text-slate-600">ホーム画面で「タスクを作成して」と話しかけると、秘書がプロジェクト・マイルストーンを聞いて作成します。</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <ListTodo className="w-5 h-5 text-slate-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">カンバンから手動作成</p>
              <p className="text-sm text-slate-600">カンバンボードの「＋」ボタンから直接作成することもできます。</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="カレンダー連携" icon={Calendar}>
        <p className="mb-3">
          タスクをGoogleカレンダーに自動登録できます。「いつ何をやるか」がカレンダー上で可視化され、工数管理にも活用できます。
        </p>
        <div className="space-y-3">
          <div>
            <p className="font-medium text-slate-700 mb-1">カレンダー予定の種類</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <p className="text-xs font-semibold text-blue-700">[NM-Task]</p>
                <p className="text-[10px] text-blue-600 mt-0.5">タスクの作業予定</p>
                <p className="text-[10px] text-slate-500 mt-0.5">空き判定: 除外（空きとみなす）</p>
              </div>
              <div className="p-2.5 bg-green-50 rounded-lg border border-green-100 text-center">
                <p className="text-xs font-semibold text-green-700">[NM-Meeting]</p>
                <p className="text-[10px] text-green-600 mt-0.5">会議の予定</p>
                <p className="text-[10px] text-slate-500 mt-0.5">空き判定: 含む（実拘束時間）</p>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-100 text-center">
                <p className="text-xs font-semibold text-amber-700">[NM-Job]</p>
                <p className="text-[10px] text-amber-600 mt-0.5">ジョブの予定</p>
                <p className="text-[10px] text-slate-500 mt-0.5">空き判定: 除外（空きとみなす）</p>
              </div>
            </div>
          </div>
          <div>
            <p className="font-medium text-slate-700 mb-1">工数管理</p>
            <p className="text-sm text-slate-600">タスク作成時に見積もり工数（時間）を設定 → カレンダーに作業ブロックを配置 → 完了時に実績時間を記録。見積もりと実績の差から精度を改善できます。</p>
          </div>
          <div>
            <p className="font-medium text-slate-700 mb-1">会議アジェンダの自動注入</p>
            <p className="text-sm text-slate-600">会議のカレンダー予定には、未確定事項・決定確認・タスク進捗から自動生成されたアジェンダが説明欄に注入されます。毎朝5:00に初回生成、21:00に最終更新されます。</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="繰り返しルール" icon={RefreshCw}>
        <p className="mb-3">
          定期的な会議・タスク・ジョブを自動生成するルールを設定できます。プロジェクトの「ジョブ」タブ下部で管理します。
        </p>
        <div className="space-y-3">
          <div>
            <p className="font-medium text-slate-700 mb-1">3つの種別</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                <Badge color="blue">会議</Badge>
                <p className="text-sm text-slate-600">定例MTGを自動生成。カレンダー同期ONで[NM-Meeting]予定も登録。MeetGeekと自動照合して「第N回」をカウント。</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-100">
                <Badge color="green">タスク</Badge>
                <p className="text-sm text-slate-600">月次レポートなど定期タスクを事前生成日数前に自動作成。最新マイルストーンに自動配置。</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-amber-50 rounded border border-amber-100">
                <Badge color="amber">ジョブ</Badge>
                <p className="text-sm text-slate-600">週次清掃チェックなど定型業務を自動生成。</p>
              </div>
            </div>
          </div>
          <div>
            <p className="font-medium text-slate-700 mb-1">設定項目</p>
            <div className="text-sm text-slate-600 space-y-1">
              <p><span className="font-medium">繰り返し</span> — 毎週月曜、毎月1日、隔週など（テンプレートから選択）</p>
              <p><span className="font-medium">事前生成日数</span> — ルール実行日の何日前にデータを作成するか（デフォルト: 7日）</p>
              <p><span className="font-medium">自動生成</span> — ONで毎日のCronが自動実行。OFFなら手動のみ</p>
              <p><span className="font-medium">カレンダー同期</span> — 会議タイプのみ。ONでGoogleカレンダーにも自動登録</p>
            </div>
          </div>
        </div>
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
          組織の中にプロジェクトを作り、プロジェクト単位であらゆる情報を管理します。
          左側にツリー構造のナビゲーション、右側にタブコンテンツが表示されます。
        </p>
      </SectionCard>

      <SectionCard title="組織レベル" icon={Building2}>
        <p className="mb-2">組織には「設定」タブのみがあります。組織名・ドメイン・関係性（取引先/パートナー等）の基本情報を管理します。</p>
        <p>組織の作成は画面右上ボタン、または秘書に「組織を作成して」と依頼します。同じドメインの組織は1つだけです。</p>
      </SectionCard>

      <SectionCard title="プロジェクト配下の7タブ" icon={FolderOpen}>
        <p className="mb-3 text-slate-500">プロジェクトがすべての情報のハブです。メンバー・チャネル・資料もプロジェクト単位で管理します。</p>
        <div className="space-y-3 mt-2">
          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-blue-500" /> タイムライン
            </p>
            <p>プロジェクトのビジネスログを時系列で表示。会議・メッセージ・タスク完了・ファイル共有などが自動記録されます。</p>
            <p className="text-xs text-slate-400 mt-1">※ 読み取り専用。手動追加はできません。</p>
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <GitBranch className="w-4 h-4 text-blue-500" /> 検討ツリー
            </p>
            <p>会議録を登録すると、AIが自動解析して検討項目をツリー構造で整理します。意思決定の経緯が可視化されます。</p>
            <FlowStep steps={['会議録登録', 'AI解析', 'ツリー自動生成', 'ビジネスイベント追加']} />
            <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100 text-xs text-slate-600">
              <p className="font-medium text-slate-700 mb-1">v3.4 新機能: コンテキスト連携</p>
              <p>AI解析時に過去の未確定事項・決定事項・タスク進捗を自動注入。ノードカードにはバッジ（<span className="text-amber-600">未確定事項</span>・<span className="text-green-600">決定ログ</span>の件数）が表示されます。ノードをクリックすると詳細パネルで未確定事項の停滞日数や決定の変更チェーンを確認できます。</p>
            </div>
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-blue-500" /> 思考マップ
            </p>
            <p>マイルストーン間の思考経路を可視化。タスクの会話ログからAIが思考の流れを構造化します。</p>
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <ListTodo className="w-4 h-4 text-blue-500" /> タスク
            </p>
            <p>ゴール → マイルストーン → タスクの階層で管理。マイルストーンは1週間単位の目標で、週末に到達判定されます。</p>
          </div>

          <div className="p-3 bg-white rounded border border-slate-200">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Briefcase className="w-4 h-4 text-blue-500" /> ジョブ
            </p>
            <p>定型業務ややることメモを管理します。SEOレポートや定例MTGなど定期的な業務はジョブとして登録すると便利です。</p>
            <div className="flex gap-2 mt-2">
              <Badge color="blue" label="定型業務" />
              <Badge color="slate" label="やることメモ" />
            </div>
          </div>

          <div className="p-3 bg-white rounded border border-blue-200 bg-blue-50">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-500" /> メンバー
            </p>
            <p>チャネル管理とメンバー管理を1つのタブに統合。上部でSlack・Chatworkチャネルを登録し、「チャネルからメンバーを自動取り込み」ボタンでメッセージ履歴から参加者を自動検出・追加します。</p>
            <FlowStep steps={['チャネル登録', '自動取り込み', 'メンバー編集・削除']} />
            <div className="mt-2 p-2 bg-white rounded border border-slate-200 text-xs text-slate-500">
              推奨: Slack 1チャネル、Chatwork 1ルーム、メール 任意（現在休眠中）。各メンバーカードを展開して会社名・関係性・連絡先チャネルを編集できます。
            </div>
          </div>

          <div className="p-3 bg-white rounded border border-blue-200 bg-blue-50">
            <p className="font-medium text-slate-800 flex items-center gap-2 mb-1">
              <ClipboardList className="w-4 h-4 text-blue-500" /> 関連資料
            </p>
            <p className="mb-2">プロジェクトの資料を一元管理するタブです。ファイルのアップロードとURL登録の両方に対応しています。</p>

            <div className="mt-2 space-y-2">
              <p className="font-medium text-slate-700 text-xs">2つのサブタブ</p>
              <div className="flex gap-2">
                <Badge color="blue" label="登録資料" />
                <span className="text-xs text-slate-500">自分で登録した資料（アップロード・URL）</span>
              </div>
              <div className="flex gap-2">
                <Badge color="slate" label="受領資料" />
                <span className="text-xs text-slate-500">Slack・Chatwork等から自動取り込まれた資料</span>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-slate-600">
              <p className="font-medium text-slate-700">登録時の機能</p>
              <div className="space-y-1 pl-2">
                <p>• <span className="font-medium">書類種別</span>: 提案資料・見積書・契約書・請求書・レポート・議事録・マニュアル・デザイン・仕様書・その他の10種から選択</p>
                <p>• <span className="font-medium">格納先の指定</span>: マイルストーンまたはジョブの選択が必須。タスクも選択可能</p>
                <p>• <span className="font-medium">命名規則の自動適用</span>: <span className="font-mono bg-slate-100 px-1 rounded">YYYY-MM-DD_種別_資料名.拡張子</span></p>
                <p>• <span className="font-medium">タグの自動付与</span>: 書類種別・MS名・タスク名・ジョブ名・登録者名が自動でタグ付け。手動追加も可能</p>
                <p>• <span className="font-medium">編集・削除</span>: 登録済み資料の種別・格納先・タグの変更、削除に対応</p>
              </div>
            </div>
            <FlowStep steps={['ファイル選択 or URL入力', '種別＋格納先を選択', 'タグ自動付与', 'Drive保存＋DB記録']} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Driveフォルダ構造" icon={HardDrive}>
        <p className="mb-3">Google Driveのフォルダは以下の構造で自動生成されます。組織・プロジェクトまでは作成時に自動生成、それ以降はファイル保存時に動的生成されます。</p>
        <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm text-slate-700 space-y-1">
          <p>[NodeMap] 組織名/</p>
          <p className="pl-4">└── プロジェクト名/</p>
          <p className="pl-12">├── ジョブ/　　　　　← 定型業務の資料</p>
          <p className="pl-12">├── 会議議事録/　　　← MeetGeek等の格納先</p>
          <p className="pl-12">└── マイルストーン/</p>
          <p className="pl-20">└── MS名/</p>
          <p className="pl-28">└── タスク名/　← ドキュメント蓄積先</p>
        </div>
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          <p>ファイル名ルール: <span className="font-mono bg-slate-100 px-1 rounded">YYYY-MM-DD_種別_原名.ext</span></p>
          <p>メタデータタグ: 書類種別・MS名・タスク名・ジョブ名・登録者名で自動タグ付け＋手動追加可能</p>
          <p>フォルダ自動生成: 組織・プロジェクトは作成時、ジョブ/会議議事録/MS/タスクはファイル保存時に動的生成</p>
        </div>
      </SectionCard>

      <SectionCard title="MeetGeek連携" icon={Calendar}>
        <p className="mb-2">
          MeetGeek（オンライン会議録サービス）と連携すると、会議終了後に自動でNodeMapに取り込まれます。
        </p>
        <FlowStep steps={['会議終了', 'Webhook受信', '参加者からPJ自動判定', '議事録DB保存', 'AI解析', 'Drive保存']} />
        <div className="space-y-2 mt-3 text-xs text-slate-600">
          <p>• 取り込みデータ: 会議詳細・サマリー・全文トランスクリプト・ハイライト（アクションアイテム等）</p>
          <p>• プロジェクト自動判定: 参加者メール → コンタクト → 組織 → プロジェクトの順で照合</p>
          <p>• AI解析の結果: 検討ツリー自動更新、ビジネスイベント追加、ナレッジ抽出、タスク候補生成</p>
          <p>• Drive保存: PJ配下の「会議議事録」フォルダに年月別で自動保存</p>
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

      <SectionCard title="3つの常設データ（v3.4）" icon={ClipboardList}>
        <p className="mb-3">プロジェクトごとに以下の3つのデータが自動で蓄積・更新されます。AI解析の精度向上と会議準備の効率化に使われます。</p>
        <div className="space-y-2">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="font-medium text-slate-800 mb-1">未確定事項トラッカー</p>
            <p className="text-xs text-slate-600">会議で結論が出なかった事項を自動追跡。滞留日数に応じて優先度が自動算出され、3週間以上放置されると「停滞」に変わります。次の会議で解決が検出されると自動クローズされます。</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="font-medium text-slate-800 mb-1">意思決定ログ</p>
            <p className="text-xs text-slate-600">「決まったこと」を不変のログとして記録。決定が変更された場合は新しいレコードが作成され、変更チェーンとして辿れます。検討ツリーのノードとも連動しています。</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="font-medium text-slate-800 mb-1">会議アジェンダ</p>
            <p className="text-xs text-slate-600">翌営業日の会議アジェンダが毎日自動生成されます。未確定事項・直近の決定確認・タスク進捗から構成され、見積もり時間も自動算出されます。</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="チャネルボット（メンション応答）" icon={Hash}>
        <p className="mb-3">
          Slack・Chatworkのチャネルで <span className="font-mono bg-slate-100 px-1 rounded text-sm">@NodeMap</span> にメンションすると、プロジェクト情報を返答します。読み取り専用で、変更操作はNodeMap画面に誘導します。
        </p>
        <div className="space-y-3">
          <div>
            <p className="font-medium text-slate-700 mb-1.5">使えるコマンド（6種）</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                <span className="font-mono text-xs text-blue-600 shrink-0">課題は？</span>
                <span className="text-slate-500">→ 未確定事項リスト</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                <span className="font-mono text-xs text-blue-600 shrink-0">決定事項は？</span>
                <span className="text-slate-500">→ 直近2週間の決定</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                <span className="font-mono text-xs text-blue-600 shrink-0">タスク状況</span>
                <span className="text-slate-500">→ 進行中タスク一覧</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                <span className="font-mono text-xs text-blue-600 shrink-0">アジェンダ</span>
                <span className="text-slate-500">→ 次回会議の議題</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                <span className="font-mono text-xs text-blue-600 shrink-0">今週のまとめ</span>
                <span className="text-slate-500">→ 週次サマリー</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                <span className="font-mono text-xs text-blue-600 shrink-0">ヘルプ</span>
                <span className="text-slate-500">→ コマンド一覧</span>
              </div>
            </div>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="font-medium text-slate-800 mb-1">公開レベルについて</p>
            <p className="text-xs text-slate-600">
              社外チャネル（クライアント・パートナー）では、<strong>未確定事項は非表示</strong>になります。決定事項・タスク進捗は社外にも表示されます。社内の検討途中の情報が漏れないよう自動的にフィルタされます。
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="チャネルボット（定期配信）" icon={Bell}>
        <p className="mb-3">
          プロジェクトのSlack・Chatworkチャネルに、週次レポートやアラートを自動配信します。
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <Calendar className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">月曜ブリーフィング（9:00配信）</p>
              <p className="text-xs text-slate-600">今週のタスク一覧・予定会議・未確定事項の件数をまとめて配信。週の頭に全体像を把握できます。</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
            <BarChart className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">金曜レポート（17:00配信）</p>
              <p className="text-xs text-slate-600">今週の完了タスク・新規決定事項・新たな未確定事項をまとめた成果レポート。振り返りに最適です。</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <Bell className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-800">アラート（毎日9:30チェック）</p>
              <p className="text-xs text-slate-600">停滞中の未確定事項・期限超過タスク・マイルストーン期限接近（2日以内）があればチャネルに通知。問題がなければ配信されません。</p>
            </div>
          </div>
        </div>
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="font-medium text-slate-800 mb-1">社外チャネルの配信内容</p>
          <p className="text-xs text-slate-600">
            メンション応答と同様に、社外チャネルでは未確定事項・停滞アラートは配信されません。タスク進捗と決定事項のみが共有されます。
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function SettingsTab() {
  return (
    <div>
      <SectionCard title="設定画面の概要" icon={Settings}>
        <p>設定画面には4つのタブがあります。チャネル接続・プロジェクト種別・プロフィール・通知設定です。</p>
      </SectionCard>

      <SectionCard title="チャネル接続" icon={MessageSquare}>
        <div className="space-y-2">
          <p>以下のサービスと連携できます。「チャンネル接続」タブから接続してください。Google連携はOAuth認証で一括接続です。</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-100">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="font-medium">Google Calendar</span>
              <span className="text-slate-500">— 予定の確認・空き時間検索</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-100">
              <FolderOpen className="w-4 h-4 text-blue-500" />
              <span className="font-medium">Google Drive</span>
              <span className="text-slate-500">— ファイル保存・管理</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-slate-500">Gmail</span>
              <span className="text-slate-400">— メール同期（現在休眠中）</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
              <MessageSquare className="w-4 h-4 text-purple-500" />
              <span className="font-medium">Slack</span>
              <span className="text-slate-500">— チャネルメッセージ同期</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200">
              <MessageSquare className="w-4 h-4 text-teal-500" />
              <span className="font-medium">Chatwork</span>
              <span className="text-slate-500">— ルームメッセージ同期</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="プロジェクト種別" icon={Layers}>
        <p>プロジェクトのテンプレートを管理できます。種別ごとにタスクテンプレートを設定しておくと、プロジェクト作成時に自動適用されます。</p>
      </SectionCard>

      <SectionCard title="プロフィール・AI設定" icon={Users}>
        <p className="mb-3">
          「プロフィール」タブでは、表示名・タイムゾーン・メール署名のほか、AIの動作をカスタマイズする2つの設定があります。
        </p>
        <div className="space-y-2">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="font-medium text-slate-800 mb-1">性格タイプ（16タイプ診断）</p>
            <p>MBTI型を設定すると、AIの思考アプローチが変わります。例えばINTJなら戦略的・効率重視、ENFJなら共感的・チーム志向の応答になります。</p>
            <p className="text-xs text-slate-500 mt-1">反映先: 秘書チャット、タスクAI会話、相談回答、ジョブ構造化</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="font-medium text-slate-800 mb-1">応答スタイル（3段階）</p>
            <p>「端的重視」は結論ファーストで短く、「通常」はバランス型、「補足説明重視」は背景や理由も丁寧に返します。</p>
            <p className="text-xs text-slate-500 mt-1">反映先: 秘書チャット、タスクAI会話、相談回答、ジョブ構造化</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="通知設定" icon={Settings}>
        <p className="text-slate-400">現在準備中です。</p>
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
    tasks: <TasksTab />,
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
