'use client';

import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import type { NodeData, EdgeData, ClusterData, MapViewMode, CheckpointData } from '@/lib/types';
import { KNOWLEDGE_DOMAIN_CONFIG, RELATIONSHIP_TYPE_CONFIG, FLOW_TYPE_CONFIG } from '@/lib/constants';

interface NetworkGraphProps {
  nodes: NodeData[];
  edges: EdgeData[];
  clusters: ClusterData[];
  viewMode: MapViewMode;
  selectedTaskId: string | null;
  width?: number;
  height?: number;
  userColor?: string;
  colorByDomain?: boolean;
  checkpoints?: CheckpointData[];
}

// Phase 16: interactionCount に基づくサイズ（後方互換でlevel名キーも残す）
const LEVEL_SIZE: Record<string, number> = {
  recognition: 6,
  understanding: 10,
  mastery: 15,
};

// ノードタイプに応じた形状（circle / diamond / square）
const NODE_SHAPE: Record<string, string> = {
  keyword: 'circle',
  person: 'diamond',
  project: 'square',
};

// Phase 16: interactionCount に基づく色の濃淡（同系色で濃淡表現）
// カウント少＝薄い色、カウント多＝濃い色
const LEVEL_COLOR: Record<string, string> = {
  recognition: '#93C5FD',   // blue-300 (薄い)
  understanding: '#2563EB', // blue-600 (中間)
  mastery: '#1E3A5F',       // blue-900に近い (濃い)
};

/**
 * Phase 16: interactionCount からノードサイズを算出
 * 最小5px、最大18px、カウントに応じて段階的に大きくなる
 */
function getNodeSize(node: NodeData): number {
  const count = node.interactionCount ?? node.frequency ?? 1;
  if (count >= 10) return 18;
  if (count >= 5) return 13;
  if (count >= 3) return 10;
  if (count >= 2) return 8;
  return 6;
}

/**
 * Phase 16: interactionCount から色を算出（同系色の濃淡）
 * カウントが多いほど色が濃くなる
 */
function getNodeColor(node: NodeData): string {
  const count = node.interactionCount ?? node.frequency ?? 1;
  // 段階的に濃くする（blue系）
  if (count >= 10) return '#1E3A8A'; // blue-900
  if (count >= 8) return '#1D4ED8';  // blue-700
  if (count >= 5) return '#2563EB';  // blue-600
  if (count >= 3) return '#3B82F6';  // blue-500
  if (count >= 2) return '#60A5FA';  // blue-400
  return '#93C5FD';                  // blue-300
}

export default function NetworkGraph({
  nodes,
  edges,
  clusters,
  viewMode,
  selectedTaskId,
  width = 800,
  height = 600,
  userColor = '#2563EB',
  colorByDomain = false,
  checkpoints = [],
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null);

  // タスクに関連するノードIDを計算
  const getHighlightedNodeIds = useCallback((): Set<string> => {
    if (!selectedTaskId) return new Set();
    const taskClusters = clusters.filter((c) => c.taskId === selectedTaskId);

    if (viewMode === 'ideation') {
      const ideation = taskClusters.find((c) => c.clusterType === 'ideation');
      return new Set(ideation?.nodeIds || []);
    }
    if (viewMode === 'result') {
      const result = taskClusters.find((c) => c.clusterType === 'result');
      return new Set(result?.nodeIds || []);
    }
    if (viewMode === 'path') {
      const taskEdges = edges.filter((e) => e.taskIds.includes(selectedTaskId));
      const ids = new Set<string>();
      taskEdges.forEach((e) => {
        ids.add(typeof e.sourceNodeId === 'string' ? e.sourceNodeId : e.sourceNodeId);
        ids.add(typeof e.targetNodeId === 'string' ? e.targetNodeId : e.targetNodeId);
      });
      return ids;
    }
    return new Set();
  }, [selectedTaskId, viewMode, clusters, edges]);

  // ハイライトされるエッジIDを計算
  const getHighlightedEdgeIds = useCallback((): Set<string> => {
    if (!selectedTaskId || viewMode !== 'path') return new Set();
    return new Set(
      edges.filter((e) => e.taskIds.includes(selectedTaskId)).map((e) => e.id)
    );
  }, [selectedTaskId, viewMode, edges]);

  // チェックポイントに含まれるノードIDセットを計算
  const getCheckpointNodeIds = useCallback((): Set<string> => {
    if (!selectedTaskId || checkpoints.length === 0) return new Set();
    const taskCps = checkpoints.filter((cp) => cp.taskId === selectedTaskId);
    const ids = new Set<string>();
    taskCps.forEach((cp) => cp.nodeIds.forEach((id) => ids.add(id)));
    return ids;
  }, [selectedTaskId, checkpoints]);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const highlightedNodeIds = getHighlightedNodeIds();
    const highlightedEdgeIds = getHighlightedEdgeIds();
    const checkpointNodeIds = getCheckpointNodeIds();
    const hasSelection = selectedTaskId && viewMode !== 'base';

    // SVG defs: 矢印マーカー定義
    const defs = svg.append('defs');

    // 本流用矢印（青、大きめ）
    defs.append('marker')
      .attr('id', 'arrow-main')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', FLOW_TYPE_CONFIG.main.arrowSize)
      .attr('markerHeight', FLOW_TYPE_CONFIG.main.arrowSize)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', FLOW_TYPE_CONFIG.main.color)
      .attr('fill-opacity', 0.7);

    // 支流用矢印（グレー、小さめ）
    defs.append('marker')
      .attr('id', 'arrow-tributary')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', FLOW_TYPE_CONFIG.tributary.arrowSize)
      .attr('markerHeight', FLOW_TYPE_CONFIG.tributary.arrowSize)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', FLOW_TYPE_CONFIG.tributary.color)
      .attr('fill-opacity', 0.5);

    // ハイライト用矢印
    defs.append('marker')
      .attr('id', 'arrow-highlight')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', userColor)
      .attr('fill-opacity', 0.8);

    // クラスターの描画用データ
    const clustersToDraw = selectedTaskId
      ? clusters.filter((c) => c.taskId === selectedTaskId)
      : [];

    // D3用データ準備
    type SimNode = d3.SimulationNodeDatum & NodeData;
    type SimLink = d3.SimulationLinkDatum<SimNode> & EdgeData;

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = edges
      .filter((e) => nodeMap.has(e.sourceNodeId) && nodeMap.has(e.targetNodeId))
      .map((e) => ({
        ...e,
        source: e.sourceNodeId,
        target: e.targetNodeId,
      }));

    // ズーム
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // クラスター描画（半透明の円で囲む）
    if (clustersToDraw.length > 0) {
      const clusterGroup = g.append('g').attr('class', 'clusters');
      clustersToDraw.forEach((cluster) => {
        const clusterNodes = simNodes.filter((n) => cluster.nodeIds.includes(n.id));
        if (clusterNodes.length === 0) return;

        const color = cluster.clusterType === 'ideation' ? '#2563EB' : '#16A34A';
        const opacity = cluster.clusterType === 'ideation' ? 0.08 : 0.12;

        clusterGroup.append('circle')
          .attr('class', `cluster-${cluster.id}`)
          .attr('fill', color)
          .attr('fill-opacity', opacity)
          .attr('stroke', color)
          .attr('stroke-opacity', 0.3)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', cluster.clusterType === 'ideation' ? '5,5' : 'none');
      });
    }

    // エッジ描画（Phase 10: 本流/支流で描き分け）
    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) => {
        if (hasSelection && highlightedEdgeIds.has(d.id)) return userColor;
        const cfg = FLOW_TYPE_CONFIG[d.flowType] || FLOW_TYPE_CONFIG.tributary;
        return cfg.color;
      })
      .attr('stroke-opacity', (d) => {
        if (hasSelection) return highlightedEdgeIds.has(d.id) ? 0.8 : 0.08;
        const cfg = FLOW_TYPE_CONFIG[d.flowType] || FLOW_TYPE_CONFIG.tributary;
        return cfg.opacity;
      })
      .attr('stroke-width', (d) => {
        if (hasSelection && highlightedEdgeIds.has(d.id)) return 3;
        const cfg = FLOW_TYPE_CONFIG[d.flowType] || FLOW_TYPE_CONFIG.tributary;
        return cfg.width;
      })
      .attr('stroke-dasharray', (d) => {
        if (hasSelection && highlightedEdgeIds.has(d.id)) return 'none';
        const cfg = FLOW_TYPE_CONFIG[d.flowType] || FLOW_TYPE_CONFIG.tributary;
        return cfg.dashArray;
      })
      .attr('marker-end', (d) => {
        // 矢印は方向ありのエッジのみ
        if (d.direction === 'bidirectional') return '';
        if (hasSelection && highlightedEdgeIds.has(d.id)) return 'url(#arrow-highlight)';
        return d.flowType === 'main' ? 'url(#arrow-main)' : 'url(#arrow-tributary)';
      });

    // ノード描画
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer');

    // ノード形状の描画
    node.each(function (d) {
      const el = d3.select(this);
      // Phase 16: interactionCount ベースのサイズ
      const size = getNodeSize(d);
      const isHighlighted = !hasSelection || highlightedNodeIds.has(d.id);
      const isCheckpointed = checkpointNodeIds.has(d.id);

      // ドメイン色分けモード時はドメイン色を使う
      // Phase 9: 人物ノードは関係属性色を適用
      // Phase 16: デフォルトは interactionCount による濃淡
      let fillColor: string;
      if (!isHighlighted) {
        fillColor = '#E2E8F0';
      } else if (d.type === 'person' && d.contactId && d.relationshipType
        && RELATIONSHIP_TYPE_CONFIG[d.relationshipType]) {
        fillColor = RELATIONSHIP_TYPE_CONFIG[d.relationshipType].color;
      } else if (colorByDomain && d.domainId && KNOWLEDGE_DOMAIN_CONFIG[d.domainId]) {
        fillColor = KNOWLEDGE_DOMAIN_CONFIG[d.domainId].color;
      } else {
        fillColor = getNodeColor(d);
      }
      const opacity = isHighlighted ? 1 : 0.3;
      const shape = NODE_SHAPE[d.type] || 'circle';

      if (shape === 'circle') {
        el.append('circle')
          .attr('r', size)
          .attr('fill', fillColor)
          .attr('fill-opacity', opacity)
          .attr('stroke', isHighlighted ? '#fff' : 'none')
          .attr('stroke-width', isHighlighted ? 1.5 : 0);
      } else if (shape === 'diamond') {
        el.append('rect')
          .attr('width', size * 1.6)
          .attr('height', size * 1.6)
          .attr('x', -size * 0.8)
          .attr('y', -size * 0.8)
          .attr('transform', 'rotate(45)')
          .attr('fill', fillColor)
          .attr('fill-opacity', opacity)
          .attr('stroke', isHighlighted ? '#fff' : 'none')
          .attr('stroke-width', isHighlighted ? 1.5 : 0);
      } else {
        el.append('rect')
          .attr('width', size * 1.8)
          .attr('height', size * 1.8)
          .attr('x', -size * 0.9)
          .attr('y', -size * 0.9)
          .attr('rx', 3)
          .attr('fill', fillColor)
          .attr('fill-opacity', opacity)
          .attr('stroke', isHighlighted ? '#fff' : 'none')
          .attr('stroke-width', isHighlighted ? 1.5 : 0);
      }

      // Phase 10: チェックポイントマーカー（◆）
      if (isCheckpointed && selectedTaskId) {
        el.append('polygon')
          .attr('points', '0,-5 4,0 0,5 -4,0')
          .attr('transform', `translate(${size + 6}, ${-size + 2})`)
          .attr('fill', '#F59E0B')
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.5);
      }

      // ラベル
      if (isHighlighted || !hasSelection) {
        el.append('text')
          .text(d.label)
          .attr('text-anchor', 'middle')
          .attr('dy', size + 14)
          .attr('font-size', '11px')
          .attr('fill', '#475569')
          .attr('fill-opacity', isHighlighted ? 1 : 0.5)
          .attr('pointer-events', 'none');
      }
    });

    // ツールチップ
    const tooltip = d3.select('body').append('div')
      .attr('class', 'nodemap-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', '#1E293B')
      .style('color', '#F8FAFC')
      .style('padding', '8px 12px')
      .style('border-radius', '8px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '9999')
      .style('box-shadow', '0 4px 12px rgba(0,0,0,0.3)');

    node.on('mouseover', (event, d) => {
      // Phase 16: interactionCount を主表示に変更
      const count = d.interactionCount ?? d.frequency ?? 0;
      const typeLabel =
        d.type === 'keyword' ? 'キーワード' :
        d.type === 'person' ? '人物' : 'プロジェクト';
      const relationLabel = d.type === 'person' && d.relationshipType && RELATIONSHIP_TYPE_CONFIG[d.relationshipType]
        ? `<br/>関係: ${RELATIONSHIP_TYPE_CONFIG[d.relationshipType].label}` : '';
      const cpLabel = checkpointNodeIds.has(d.id) ? '<br/>📍 チェックポイント記録あり' : '';
      tooltip
        .html(`<strong>${d.label}</strong><br/>種別: ${typeLabel}<br/>インタラクション: ${count}回${relationLabel}${cpLabel}`)
        .style('visibility', 'visible')
        .style('top', `${event.pageY - 10}px`)
        .style('left', `${event.pageX + 15}px`);
    }).on('mouseout', () => {
      tooltip.style('visibility', 'hidden');
    });

    // ドラッグ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drag = d3.drag<any, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(drag);

    // フォースシミュレーション
    const simulation = d3.forceSimulation(simNodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(simLinks as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
        .id((d: d3.SimulationNodeDatum) => (d as SimNode).id)
        .distance(80)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(25))
      .on('tick', () => {
        link
          .attr('x1', (d) => (d.source as SimNode).x || 0)
          .attr('y1', (d) => (d.source as SimNode).y || 0)
          .attr('x2', (d) => (d.target as SimNode).x || 0)
          .attr('y2', (d) => (d.target as SimNode).y || 0);

        node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);

        // クラスター円の位置を更新
        clustersToDraw.forEach((cluster) => {
          const clusterNodes = simNodes.filter((n) => cluster.nodeIds.includes(n.id));
          if (clusterNodes.length === 0) return;
          const cx = d3.mean(clusterNodes, (n) => n.x) || 0;
          const cy = d3.mean(clusterNodes, (n) => n.y) || 0;
          const maxDist = d3.max(clusterNodes, (n) =>
            Math.sqrt(Math.pow((n.x || 0) - cx, 2) + Math.pow((n.y || 0) - cy, 2))
          ) || 0;

          svg.select(`.cluster-${cluster.id}`)
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', maxDist + 40);
        });
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [nodes, edges, clusters, viewMode, selectedTaskId, width, height, userColor, colorByDomain, checkpoints, getHighlightedNodeIds, getHighlightedEdgeIds, getCheckpointNodeIds]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-slate-50 rounded-xl border border-slate-200"
      style={{ minHeight: '400px' }}
    />
  );
}
