'use client';

import { useState, useRef, KeyboardEvent } from 'react';

interface SeedTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function SeedTagInput({
  tags,
  onChange,
  placeholder = 'タグを入力（Enterで追加）',
}: SeedTagInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1 px-2 py-1.5 border border-slate-200 rounded-lg
        focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent
        bg-white cursor-text min-h-[36px]"
      onClick={() => inputRef.current?.focus()}
    >
      {/* タグチップ */}
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700
            text-xs rounded-full border border-blue-200"
        >
          {tag}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            className="text-blue-400 hover:text-blue-600 transition-colors leading-none"
          >
            &times;
          </button>
        </span>
      ))}

      {/* 入力フィールド */}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (input.trim()) addTag(input);
        }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder:text-slate-400"
      />
    </div>
  );
}
