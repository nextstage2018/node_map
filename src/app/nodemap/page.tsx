'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/shared/Header';
import NetworkGraph from '@/components/nodemap/NetworkGraph';
import MapControls from '@/components/nodemap/MapControls';
import MapStats from '@/components/nodemap/MapStats';
import { useNodeMap } from '@/hooks/useNodeMap';

export default function NodeMapPage() {
  const {
    data,
    compareData,
    users,
    mapState,
    clusterDiff,
    isLoading,
    availableTasks,
    setViewMode,
    selectTask,
    selectUser,
    toggleCompareMode,
  } = useNodeMap();

  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 800, height: 600 });
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const colorByDomain = selectedDomainId !== null;

  // グラフコンテナのサイズを監視
  useEffect(() => {
    const updateSize = () => {
      if (graphContainerRef.current) {
        const rect = graphContainerRef.current.getBoundingClientRect();
        setGraphSize({
          width: Math.max(rect.width - 2, 400),
          height: Math.max(rect.height - 2, 400),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [mapState.isCompareMode]);

  const currentUser = users.find((u) => u.id === mapState.selectedUserId);
  const compareUser = users.find((u) => u.id === mapState.compareUserId);

  // 領域フィルターが選択されている場合、ノードをフィルタリング
  const filteredData = selectedDomainId
    ? {
        ...data,
        nodes: data.nodes.filter(
          (n) => n.domainId === selectedDomainId || n.type === 'person'
        ),
      }
    : data;

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 flex overflow-hidden">
          {/* 左サイドバー：コントロール */}
          <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto p-4">
            <MapControls
              viewMode={mapState.viewMode}
              selectedTaskId={mapState.selectedTaskId}
              selectedUserId={mapState.selectedUserId}
              users={users}
              availableTasks={availableTasks}
              isCompareMode={mapState.isCompareMode}
              compareUserId={mapState.compareUserId}
              selectedDomainId={selectedDomainId}
              onViewModeChange={setViewMode}
              onTaskSelect={selectTask}
              onUserSelect={selectUser}
              onCompareToggle={toggleCompareMode}
              onDomainFilter={setSelectedDomainId}
            />
          </div>

          {/* メインコンテンツ：グラフ */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin text-3xl mb-2">⟳</div>
                  <p className="text-sm text-slate-500">マップを読み込み中...</p>
                </div>
              </div>
            ) : filteredData.nodes.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="text-4xl mb-3">🗺️</div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">思考マップ</h3>
                  <p className="text-sm text-slate-500">
                    メッセージの閲覧やタスクでのAI会話を通じて、
                    キーワード・人名・プロジェクト名が自動的にノードとして蓄積されます。
                  </p>
                </div>
              </div>
            ) : mapState.isCompareMode ? (
              /* 比較モード：2画面並列 */
              <div className="flex-1 flex">
                <div className="flex-1 flex flex-col border-r border-slate-200">
                  <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: currentUser?.avatarColor }}
                    />
                    <span className="text-sm font-medium text-slate-700">{currentUser?.displayName}</span>
                    <span className="text-xs text-slate-400 ml-auto">{data.nodes.length} ノード</span>
                  </div>
                  <div ref={graphContainerRef} className="flex-1">
                    <NetworkGraph
                      nodes={data.nodes}
                      edges={data.edges}
                      clusters={data.clusters}
                      viewMode={mapState.viewMode}
                      selectedTaskId={mapState.selectedTaskId}
                      width={graphSize.width / 2}
                      height={graphSize.height}
                      userColor={currentUser?.avatarColor}
                    />
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: compareUser?.avatarColor }}
                    />
                    <span className="text-sm font-medium text-slate-700">{compareUser?.displayName}</span>
                    <span className="text-xs text-slate-400 ml-auto">{compareData.nodes.length} ノード</span>
                  </div>
                  <div className="flex-1">
                    <NetworkGraph
                      nodes={compareData.nodes}
                      edges={compareData.edges}
                      clusters={compareData.clusters}
                      viewMode={mapState.viewMode}
                      selectedTaskId={mapState.selectedTaskId}
                      width={graphSize.width / 2}
                      height={graphSize.height}
                      userColor={compareUser?.avatarColor}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* 通常モード */
              <div ref={graphContainerRef} className="flex-1">
                <NetworkGraph
                  nodes={filteredData.nodes}
                  edges={filteredData.edges}
                  clusters={filteredData.clusters}
                  viewMode={mapState.viewMode}
                  selectedTaskId={mapState.selectedTaskId}
                  width={graphSize.width}
                  height={graphSize.height}
                  userColor={currentUser?.avatarColor}
                  colorByDomain={colorByDomain}
                />
              </div>
            )}
          </div>

          {/* 右サイドバー：統計 */}
          <div className="w-64 border-l border-slate-200 bg-white overflow-y-auto p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">統計情報</h3>
            <MapStats
              nodes={filteredData.nodes}
              edges={filteredData.edges}
              clusters={filteredData.clusters}
              clusterDiff={clusterDiff}
              selectedTaskId={mapState.selectedTaskId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
