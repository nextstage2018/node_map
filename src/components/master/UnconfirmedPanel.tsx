'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Check, X, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

interface UnconfirmedNode {
  id: string;
  label: string;
  category?: string;
  source_type?: string;
  extracted_at?: string;
}

interface UnconfirmedPanelProps {
  onConfirmed: () => void; // 確認後にデータ再読み込み用
}

export default function UnconfirmedPanel({ onConfirmed }: UnconfirmedPanelProps) {
  const [nodes, setNodes] = useState<UnconfirmedNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchUnconfirmed = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/nodes/unconfirmed');
      const data = await res.json();
      if (data.success) setNodes(data.data || []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchUnconfirmed(); }, []);

  const handleConfirm = async (entryId: string) => {
    setProcessingId(entryId);
    try {
      const res = await fetch('/api/nodes/unconfirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });
      const data = await res.json();
      if (data.success) {
        setNodes((prev) => prev.filter((n) => n.id !== entryId));
        onConfirmed();
      }
    } catch { /* ignore */ }
    finally { setProcessingId(null); }
  };

  const handleDelete = async (entryId: string) => {
    setProcessingId(entryId);
    try {
      const res = await fetch(`/api/master/entries?id=${entryId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setNodes((prev) => prev.filter((n) => n.id !== entryId));
        onConfirmed();
      }
    } catch { /* ignore */ }
    finally { setProcessingId(null); }
  };

  const handleConfirmAll = async () => {
    setProcessingId('all');
    for (const node of nodes) {
      try {
        await fetch('/api/nodes/unconfirmed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId: node.id }),
        });
      } catch { /* ignore */ }
    }
    setNodes([]);
    setProcessingId(null);
    onConfirmed();
  };

  if (isLoading) return null;
  if (nodes.length === 0) return null;

  return (
    <Card variant="default" padding="md" className="border-amber-200 bg-amber-50/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-900">
            AI自動抽出の未確認キーワード ({nodes.length}件)
          </h3>
        </div>
        <Button
          onClick={handleConfirmAll}
          variant="outline"
          size="sm"
          disabled={processingId === 'all'}
        >
          {processingId === 'all' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          すべて承認
        </Button>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-amber-100"
          >
            <span className="text-sm font-medium text-slate-900 flex-1">{node.label}</span>
            {node.category && (
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">{node.category}</span>
            )}
            {node.source_type && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 rounded text-blue-500">{node.source_type}</span>
            )}
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => handleConfirm(node.id)}
                disabled={processingId === node.id}
                className="p-1 rounded hover:bg-green-100 text-green-600 transition-colors disabled:opacity-50"
                title="承認"
              >
                {processingId === node.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => handleDelete(node.id)}
                disabled={processingId === node.id}
                className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors disabled:opacity-50"
                title="削除"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
