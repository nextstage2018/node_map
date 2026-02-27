'use client';

import { ReactNode } from 'react';

interface ContextBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode; // 追加のフィルター・検索UI等
}

export default function ContextBar({ title, subtitle, actions, children }: ContextBarProps) {
  return (
    <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-400 truncate">{subtitle}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2 ml-2">
            {children}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {actions}
        </div>
      )}
    </div>
  );
}
