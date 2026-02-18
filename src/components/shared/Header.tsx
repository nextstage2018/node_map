import { APP_NAME } from '@/lib/constants';

export default function Header() {
  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">N</span>
        </div>
        <h1 className="text-lg font-bold text-gray-900">{APP_NAME}</h1>
      </div>
      <nav className="ml-8 flex items-center gap-1">
        <a
          href="/inbox"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700"
        >
          📥 インボックス
        </a>
        <span className="px-3 py-1.5 rounded-lg text-sm text-gray-400 cursor-not-allowed">
          📋 タスク（Phase 2）
        </span>
        <span className="px-3 py-1.5 rounded-lg text-sm text-gray-400 cursor-not-allowed">
          🧠 思考マップ（Phase 4）
        </span>
      </nav>
    </header>
  );
}
