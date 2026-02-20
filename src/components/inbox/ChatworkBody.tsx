'use client';

interface ChatworkBodyProps {
  body: string;
  className?: string;
}

/**
 * Chatworkメッセージ本文のリッチレンダリングコンポーネント
 *
 * cleanChatworkBody()で整形済みのテキストを受け取り、
 * 以下のマーカーを視覚的にレンダリング：
 * - ■ タイトル → 情報ブロックヘッダー
 * - ``` ... ``` → コードブロック
 * - > 引用 → 引用ブロック
 * - >> 引用返信 → 引用返信マーク
 * - ──── → 水平線
 * - @メンション → ハイライト
 */
export default function ChatworkBody({ body, className = '' }: ChatworkBodyProps) {
  if (!body) return null;

  const blocks = parseFormattedBlocks(body);

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, index) => (
        <BlockRenderer key={index} block={block} />
      ))}
    </div>
  );
}

interface FormattedBlock {
  type: 'text' | 'info' | 'code' | 'quote' | 'hr';
  content: string;
  title?: string;
}

/**
 * cleanChatworkBody()の出力テキストを構造化ブロックに分解
 */
function parseFormattedBlocks(text: string): FormattedBlock[] {
  const blocks: FormattedBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // コードブロック（```で囲まれた部分）
    if (line.trim() === '```') {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // 閉じ```をスキップ
      blocks.push({ type: 'code', content: codeLines.join('\n') });
      continue;
    }

    // 水平線（────）
    if (/^─{8,}$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // 情報ブロックヘッダー（■ タイトル）
    if (line.trim().startsWith('■ ')) {
      const title = line.trim().substring(2);
      // タイトルの後に続く本文を情報ブロックとしてまとめる
      const contentLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        // 次のブロックレベル要素が来たら終了
        if (nextLine.trim() === '```' || /^─{8,}$/.test(nextLine.trim()) || nextLine.trim().startsWith('■ ')) {
          break;
        }
        // 空行が2つ続いたら終了
        if (nextLine.trim() === '' && contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
          break;
        }
        contentLines.push(nextLine);
        i++;
      }
      blocks.push({
        type: 'info',
        title,
        content: contentLines.join('\n').trim(),
      });
      continue;
    }

    // 引用ブロック（> で始まる行の連続）
    if (line.trim().startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().substring(2));
        i++;
      }
      blocks.push({ type: 'quote', content: quoteLines.join('\n') });
      continue;
    }

    // 空行はスキップ（ブロック間の区切り）
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 通常テキスト（連続する非ブロック行をまとめる）
    const textLines: string[] = [];
    while (i < lines.length) {
      const nextLine = lines[i];
      if (
        nextLine.trim() === '```' ||
        /^─{8,}$/.test(nextLine.trim()) ||
        nextLine.trim().startsWith('■ ') ||
        nextLine.trim().startsWith('> ')
      ) {
        break;
      }
      textLines.push(nextLine);
      i++;
    }
    const textContent = textLines.join('\n').trim();
    if (textContent) {
      blocks.push({ type: 'text', content: textContent });
    }
  }

  return blocks;
}

function BlockRenderer({ block }: { block: FormattedBlock }) {
  switch (block.type) {
    case 'info':
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          {block.title && (
            <div className="font-semibold text-blue-800 text-xs mb-1 pb-1 border-b border-blue-200">
              {block.title}
            </div>
          )}
          {block.content && (
            <div className="text-slate-700 text-[13px] whitespace-pre-wrap leading-relaxed mt-1">
              <FormattedText text={block.content} />
            </div>
          )}
        </div>
      );

    case 'code':
      return (
        <div className="bg-slate-800 text-green-300 rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto">
          <pre className="whitespace-pre-wrap">{block.content}</pre>
        </div>
      );

    case 'quote':
      return (
        <div className="border-l-[3px] border-slate-300 pl-3 py-1 text-slate-500 text-[13px] italic">
          <div className="whitespace-pre-wrap leading-relaxed">
            <FormattedText text={block.content} />
          </div>
        </div>
      );

    case 'hr':
      return <hr className="border-slate-200 my-2" />;

    case 'text':
    default:
      return (
        <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-[13px]">
          <FormattedText text={block.content} />
        </div>
      );
  }
}

/**
 * テキスト内の@メンション・引用返信マークをハイライト表示
 */
function FormattedText({ text }: { text: string }) {
  // URL, @メンション、>> 引用返信マーク をハイライト
  const parts = text.split(/(https?:\/\/[^\s<>"{}|\\^`[\]]+|@[^\s@\n]+|@全員|>> )/g);

  return (
    <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}>
      {parts.map((part, i) => {
        if (part.match(/^https?:\/\//)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline break-all"
            >
              {part.length > 60 ? part.slice(0, 57) + '...' : part}
            </a>
          );
        }
        if (part.startsWith('@')) {
          return (
            <span key={i} className="text-blue-600 font-medium">
              {part}
            </span>
          );
        }
        if (part === '>> ') {
          return (
            <span key={i} className="text-slate-400 text-xs mr-1">
              ↩ 返信:
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
