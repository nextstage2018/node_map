import { useState, useRef, useEffect } from "react";

// --- データ ---
const DEMO_MESSAGES = [
  {
    id: 1,
    role: "assistant",
    type: "briefing",
    content: "おはようございます。本日の状況をお伝えします。",
    timestamp: "09:00",
  },
  {
    id: 2,
    role: "assistant",
    type: "card",
    cardType: "inbox",
    content: "新着メッセージ 3件",
    items: [
      { id: "m1", priority: "high", from: "鈴木一郎（○○社）", subject: "見積もりの件", channel: "email", time: "08:45" },
      { id: "m2", priority: "medium", from: "田中太郎", subject: "来週MTGの日程", channel: "slack", time: "08:30" },
      { id: "m3", priority: "low", from: "広告レポート", subject: "月次レポート配信", channel: "email", time: "07:00" },
    ],
  },
  {
    id: 3,
    role: "assistant",
    type: "card",
    cardType: "actions",
    content: "対応が必要なこと",
    items: [
      { text: "鈴木様への見積もり返信（急ぎ）", urgency: "high" },
      { text: "田中様の日程調整", urgency: "medium" },
      { text: "提案書の締切が明日", urgency: "high" },
    ],
  },
  {
    id: 4,
    role: "assistant",
    type: "text",
    content: "どこから始めますか？",
    timestamp: "09:00",
  },
];

const DEMO_SCENARIOS = {
  "鈴木": [
    {
      role: "assistant",
      type: "card",
      cardType: "message-detail",
      content: "鈴木様からのメールです。",
      message: {
        from: "鈴木一郎（○○株式会社）",
        channel: "email",
        subject: "Webサイトリニューアル 見積もりについて",
        body: "先日はお打ち合わせありがとうございました。\nWebサイトリニューアルの件、見積もりを3/5までにいただけますでしょうか。\nデザイン案もあわせてお送りいただけると幸いです。",
        time: "08:45",
      },
    },
    {
      role: "assistant",
      type: "text",
      content: "見積もりの依頼です。どう対応しますか？",
    },
  ],
  "日程": [
    {
      role: "assistant",
      type: "text",
      content: "田中様とのMTG日程調整ですね。来週の空き状況を確認しました。",
    },
    {
      role: "assistant",
      type: "card",
      cardType: "job-approval",
      content: "以下の内容で田中様にSlackで送信します。",
      draft: "田中様\n\nMTGの日程について、以下の候補でいかがでしょうか。\n\n① 3/5（水）14:00〜\n② 3/6（木）10:00〜\n③ 3/7（金）15:00〜\n\nご都合の良い日時をお知らせください。",
      jobType: "日程調整",
    },
  ],
  "タスク": [
    {
      role: "assistant",
      type: "card",
      cardType: "task-created",
      content: "タスクを登録しました。",
      task: {
        title: "Webリニューアル見積もり作成",
        priority: "高",
        deadline: "3/5",
        project: "○○社 Webリニューアル",
        phase: "構想",
      },
    },
    {
      role: "assistant",
      type: "text",
      content: "見積もり作成を始めますか？それとも先に他のメッセージを確認しますか？",
    },
  ],
  "提案書": [
    {
      role: "assistant",
      type: "card",
      cardType: "task-resume",
      content: "「Webリニューアル提案書」の続きですね。",
      task: {
        title: "Webリニューアル提案書",
        phase: "進行中",
        lastActivity: "競合分析セクションまで完了",
        remaining: ["実装スケジュール", "概算費用", "リスクと対策"],
      },
    },
    {
      role: "assistant",
      type: "text",
      content: "どのセクションから進めますか？",
    },
  ],
  "思考マップ": [
    {
      role: "assistant",
      type: "card",
      cardType: "navigate",
      content: "思考マップを開きます。",
      destination: "/thought-map",
      description: "田中さんの思考マップ（全体マップモード）",
    },
  ],
  "ログ": [
    {
      role: "assistant",
      type: "text",
      content: "○○社の直近1週間のサマリーです。",
    },
    {
      role: "assistant",
      type: "card",
      cardType: "log-summary",
      content: "○○社 活動サマリー",
      items: [
        { label: "メッセージ", value: "12件", detail: "Slack 8件、メール 4件" },
        { label: "タスク", value: "2件進行中", detail: "提案書作成、見積もり" },
        { label: "ジョブ", value: "3件完了", detail: "日程調整2件、返信1件" },
      ],
      navigateTo: "/business-log",
    },
  ],
};

// --- コンポーネント ---

const ChannelBadge = ({ channel }) => {
  const colors = { email: "bg-blue-100 text-blue-700", slack: "bg-purple-100 text-purple-700", chatwork: "bg-green-100 text-green-700" };
  const labels = { email: "Email", slack: "Slack", chatwork: "CW" };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${colors[channel] || "bg-gray-100"}`}>{labels[channel] || channel}</span>;
};

const PriorityDot = ({ level }) => {
  const colors = { high: "bg-red-500", medium: "bg-yellow-500", low: "bg-green-500" };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[level]}`} />;
};

// インボックスカード
const InboxCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
      <span className="text-base">📨</span>
      <span className="text-sm font-medium text-gray-700">{data.content}</span>
    </div>
    <div className="divide-y divide-gray-100">
      {data.items.map((item, i) => (
        <div key={i} className="px-3 py-2 flex items-center gap-2 hover:bg-blue-50 cursor-pointer transition-colors">
          <PriorityDot level={item.priority} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{item.from}</div>
            <div className="text-xs text-gray-500 truncate">{item.subject}</div>
          </div>
          <ChannelBadge channel={item.channel} />
          <span className="text-xs text-gray-400">{item.time}</span>
        </div>
      ))}
    </div>
  </div>
);

// アクションカード
const ActionsCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
      <span className="text-base">📋</span>
      <span className="text-sm font-medium text-amber-800">{data.content}</span>
    </div>
    <div className="p-3 space-y-2">
      {data.items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.urgency === "high" ? "bg-red-500" : "bg-yellow-500"}`} />
          <span className="text-sm text-gray-700">{item.text}</span>
        </div>
      ))}
    </div>
  </div>
);

// メッセージ詳細カード
const MessageDetailCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-2 mb-1">
        <ChannelBadge channel={data.message.channel} />
        <span className="text-sm font-medium text-gray-900">{data.message.from}</span>
      </div>
      <div className="text-xs text-gray-500">{data.message.subject}</div>
    </div>
    <div className="p-3">
      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{data.message.body}</p>
    </div>
    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex gap-2">
      <button className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors">返信する</button>
      <button className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-md hover:bg-amber-600 transition-colors">ジョブにする</button>
      <button className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-md hover:bg-emerald-700 transition-colors">タスクにする</button>
    </div>
  </div>
);

// ジョブ承認カード
const JobApprovalCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
      <span className="text-base">⚡</span>
      <span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full">{data.jobType}</span>
      <span className="text-sm font-medium text-blue-800">{data.content}</span>
    </div>
    <div className="p-3">
      <div className="bg-gray-50 rounded p-3 border border-gray-200">
        <p className="text-sm text-gray-700 whitespace-pre-line font-mono leading-relaxed">{data.draft}</p>
      </div>
    </div>
    <div className="px-3 py-2 bg-blue-50 border-t border-blue-200 flex gap-2">
      <button className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors font-medium">承認して送信</button>
      <button className="px-4 py-1.5 bg-white text-gray-700 text-sm rounded-md border border-gray-300 hover:bg-gray-50 transition-colors">修正する</button>
    </div>
  </div>
);

// タスク作成カード
const TaskCreatedCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-emerald-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
      <span className="text-base">✅</span>
      <span className="text-sm font-medium text-emerald-800">{data.content}</span>
    </div>
    <div className="p-3 space-y-1.5">
      <div className="text-sm font-medium text-gray-900">{data.task.title}</div>
      <div className="flex gap-3 text-xs text-gray-600">
        <span>優先度: <span className="text-red-600 font-medium">{data.task.priority}</span></span>
        <span>締切: {data.task.deadline}</span>
        <span>フェーズ: {data.task.phase}</span>
      </div>
      <div className="text-xs text-gray-500">📁 {data.task.project}</div>
    </div>
  </div>
);

// タスク再開カード
const TaskResumeCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-emerald-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
      <span className="text-base">📝</span>
      <span className="text-sm font-medium text-emerald-800">{data.task.title}</span>
      <span className="text-xs px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full">{data.task.phase}</span>
    </div>
    <div className="p-3 space-y-2">
      <div className="text-xs text-gray-500">前回: {data.task.lastActivity}</div>
      <div className="text-xs text-gray-700 font-medium">残りの項目:</div>
      {data.task.remaining.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
          <span className="w-4 h-4 rounded border border-gray-300 flex items-center justify-center text-xs">{ }</span>
          {item}
        </div>
      ))}
    </div>
  </div>
);

// ナビゲーションカード
const NavigateCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-indigo-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2">
      <span className="text-base">🗺️</span>
      <span className="text-sm font-medium text-indigo-800">{data.content}</span>
    </div>
    <div className="p-3">
      <div className="text-sm text-gray-600 mb-2">{data.description}</div>
      <button className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors">
        {data.destination === "/thought-map" ? "🗺️ 思考マップを開く" : "📊 ビジネスログを開く"}
      </button>
    </div>
  </div>
);

// ログサマリーカード
const LogSummaryCard = ({ data }) => (
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
      <span className="text-base">📊</span>
      <span className="text-sm font-medium text-gray-700">{data.content}</span>
    </div>
    <div className="p-3 space-y-2">
      {data.items.map((item, i) => (
        <div key={i} className="flex items-center justify-between">
          <span className="text-sm text-gray-700">{item.label}</span>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-900">{item.value}</span>
            <div className="text-xs text-gray-500">{item.detail}</div>
          </div>
        </div>
      ))}
    </div>
    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
      <button className="text-sm text-blue-600 hover:text-blue-800">→ 詳細をビジネスログで見る</button>
    </div>
  </div>
);

// カード振り分け
const MessageCard = ({ msg }) => {
  if (msg.type === "card") {
    switch (msg.cardType) {
      case "inbox": return <InboxCard data={msg} />;
      case "actions": return <ActionsCard data={msg} />;
      case "message-detail": return <MessageDetailCard data={msg} />;
      case "job-approval": return <JobApprovalCard data={msg} />;
      case "task-created": return <TaskCreatedCard data={msg} />;
      case "task-resume": return <TaskResumeCard data={msg} />;
      case "navigate": return <NavigateCard data={msg} />;
      case "log-summary": return <LogSummaryCard data={msg} />;
      default: return null;
    }
  }
  return null;
};

// チャットバブル
const ChatBubble = ({ msg }) => {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-xs bg-blue-600 text-white px-3 py-2 rounded-2xl rounded-br-sm text-sm">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.type === "card") {
    return (
      <div className="flex justify-start">
        <div className="max-w-sm w-full">
          <MessageCard msg={msg} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-xs bg-white border border-gray-200 px-3 py-2 rounded-2xl rounded-bl-sm text-sm text-gray-800 shadow-sm">
        {msg.content}
      </div>
    </div>
  );
};

// サイドナビ
const SideNav = ({ active, onNavigate }) => {
  const items = [
    { id: "secretary", icon: "💬", label: "秘書" },
    { id: "thought-map", icon: "🗺️", label: "思考" },
    { id: "business-log", icon: "📊", label: "ログ" },
    { id: "contacts", icon: "👥", label: "連絡先" },
    { id: "organizations", icon: "🏢", label: "組織" },
    { id: "settings", icon: "⚙️", label: "設定" },
  ];
  return (
    <div className="w-16 bg-slate-900 flex flex-col items-center py-4 gap-1 shrink-0">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
        <span className="text-white text-xs font-bold">NM</span>
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
            active === item.id ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <span className="text-base">{item.icon}</span>
          <span className="text-[9px]">{item.label}</span>
        </button>
      ))}
    </div>
  );
};

// サジェストチップ（認識揺らぎ対策の重要UI）
const SuggestChips = ({ suggestions, onSelect }) => (
  <div className="flex flex-wrap gap-1.5 px-4 pb-2">
    {suggestions.map((s, i) => (
      <button
        key={i}
        onClick={() => onSelect(s.text)}
        className="px-3 py-1 bg-gray-100 hover:bg-blue-100 text-xs text-gray-700 hover:text-blue-700 rounded-full border border-gray-200 hover:border-blue-300 transition-colors"
      >
        {s.icon} {s.label}
      </button>
    ))}
  </div>
);

// --- メインApp ---
export default function SecretaryMock() {
  const [messages, setMessages] = useState(DEMO_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeNav, setActiveNav] = useState("secretary");
  const bottomRef = useRef(null);

  const suggestions = [
    { icon: "📨", label: "メールを見せて", text: "鈴木さんのメール見せて" },
    { icon: "📅", label: "日程調整して", text: "田中さんの日程調整しといて" },
    { icon: "📝", label: "提案書の続き", text: "提案書の続きやろう" },
    { icon: "📊", label: "○○社の状況", text: "○○社の最近のログ確認したい" },
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const findScenario = (text) => {
    const lower = text.toLowerCase();
    for (const [key, scenario] of Object.entries(DEMO_SCENARIOS)) {
      if (lower.includes(key.toLowerCase()) || lower.includes(key)) return scenario;
    }
    // デフォルト: 理解を示して選択肢を提示（認識揺らぎ対策）
    return [
      {
        role: "assistant",
        type: "text",
        content: `「${text}」ですね。以下のどれに近いですか？`,
      },
      {
        role: "assistant",
        type: "card",
        cardType: "actions",
        content: "こちらのことでしょうか？",
        items: [
          { text: "メッセージの確認・返信", urgency: "medium" },
          { text: "ジョブ（AI代行）の依頼", urgency: "medium" },
          { text: "タスクの作成・続行", urgency: "medium" },
          { text: "情報の検索・確認", urgency: "low" },
        ],
      },
    ];
  };

  const handleSend = (text) => {
    const sendText = text || input;
    if (!sendText.trim()) return;

    const userMsg = { id: Date.now(), role: "user", type: "text", content: sendText };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const scenario = findScenario(sendText);
      const newMsgs = scenario.map((s, i) => ({ ...s, id: Date.now() + i + 1 }));
      setMessages((prev) => [...prev, ...newMsgs]);
      setIsTyping(false);
    }, 800);
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      {/* サイドナビ */}
      <SideNav active={activeNav} onNavigate={setActiveNav} />

      {/* メインエリア */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ヘッダー */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">AI</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-900">秘書</span>
              <span className="text-xs text-green-600 ml-2">● オンライン</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Lv.2 文体学習中</span>
          </div>
        </div>

        {/* チャットエリア */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} />
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* サジェストチップ */}
        <SuggestChips suggestions={suggestions} onSelect={handleSend} />

        {/* 入力エリア */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="秘書に話しかける..."
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              送信
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
