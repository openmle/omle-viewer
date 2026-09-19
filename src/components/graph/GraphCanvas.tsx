// Main graph canvas: pan/zoom SVG with node cards, edges, mini-map, scope view, inference playback.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../App.tsx';
import {
  buildGraphData, computeLineage,
  type GNode,
} from './layout.ts';
import { NodeCard } from './NodeCard.tsx';
import { EdgePath } from './EdgePath.tsx';
import { MiniMap } from './MiniMap.tsx';
import { ScopeView } from './ScopeView.tsx';
import { StepOverlay } from './StepOverlay.tsx';
import { ExplainPanel } from './ExplainPanel.tsx';

interface ViewState { tx: number; ty: number; scale: number }

// Active pan drag
interface PanDrag { startX: number; startY: number; startTx: number; startTy: number }

// Active node drag
interface NodeDrag {
  nodeId: string;
  startMX: number; startMY: number;   // mouse position in screen px
  startNX: number; startNY: number;   // node position in graph coords
  moved: boolean;
}

export function GraphCanvas() {
  const { state, dispatch } = useApp();
  const { model, validation, selection, inferenceSteps, inferenceStepIdx, navHistory, navCursor } = state;

  // Composite path is driven by the nav entry, not local state
  const currentView = navHistory[navCursor]?.view;
  const compositePath: string[] = currentView?.kind === 'composite' ? currentView.compositePath : [];
  // Stable key representing the current graph content (changes only when canvas changes)
  const compositeKey = compositePath.join('\0');

  const [view, setView] = useState<ViewState>({ tx: 40, ty: 40, scale: 1 });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [showScope, setShowScope] = useState(false);
  const [direction, setDirection] = useState<'LR' | 'TB'>('LR');

  // Per-node position overrides set by manual drag
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panDrag = useRef<PanDrag | null>(null);
  const nodeDrag = useRef<NodeDrag | null>(null);
  const justDragged = useRef(false);
  // Keep a stable ref to view.scale for use inside mousemove
  const viewRef = useRef(view);
  viewRef.current = view;
  const prevNavCursorRef = useRef(navCursor);

  const graphData = useMemo(
    () => model ? buildGraphData(model, validation, collapsed, compositePath, direction) : null,

    [model, validation, collapsed, compositePath, direction],
  );

  // Reset manual positions only when the graph content changes (not detail-page navigation)
  useEffect(() => {
    setNodePositions(new Map());

  }, [model, compositeKey, direction]);

  // When navigating backward from a composite view, restore selection to the composite node
  useEffect(() => {
    const prevCursor = prevNavCursorRef.current;
    prevNavCursorRef.current = navCursor;
    if (navCursor >= prevCursor) return;

    const fromEntry = navHistory[prevCursor];
    if (fromEntry?.view.kind !== 'composite') return;

    const fromPath = fromEntry.view.compositePath;
    const newView = navHistory[navCursor]?.view ?? { kind: 'top_graph' as const };
    const newPath = newView.kind === 'composite' ? newView.compositePath : [];

    if (fromPath.length > newPath.length) {
      const nodeName = fromPath[newPath.length];
      dispatch({ type: 'SET_SELECTION', selection: {
        kind: 'node', id: nodeName,
        ...(newPath.length > 0 ? { compositePath: newPath } : {}),
      } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navCursor]);

  // Nodes with manual position overrides applied — used for both NodeCard and EdgePath
  const displayNodes = useMemo<Map<string, GNode>>(() => {
    if (!graphData) return new Map();
    if (nodePositions.size === 0) return graphData.nodes;
    const m = new Map(graphData.nodes);
    for (const [id, pos] of nodePositions) {
      const n = m.get(id);
      if (n) m.set(id, { ...n, x: pos.x, y: pos.y });
    }
    return m;
  }, [graphData, nodePositions]);

  // Derive graph-node id from selection
  const featureSourceInputId = (() => {
    if (selection?.kind !== 'feature' || !model) return null;
    const feat = selection.index !== undefined
      ? model.model_schema?.features?.[selection.index]
      : model.model_schema?.features?.find((f, i) => (f.name ?? String(i)) === selection.id);
    if (!feat) return null;
    const inputNames = new Set((model.inputs ?? []).map(i => i.name));
    if (feat.source && inputNames.has(feat.source)) return `input:${feat.source}`;
    if (!feat.source && feat.name && inputNames.has(feat.name)) return `input:${feat.name}`;
    if (feat.range?.prefix && inputNames.has(feat.range.prefix)) return `input:${feat.range.prefix}`;
    if ((model.inputs?.length ?? 0) === 1) return `input:${model.inputs![0].name}`;
    return null;
  })();

  const selectedNodeId = !selection ? null
    : selection.kind === 'node' ? `node:${selection.id}`
    : selection.kind === 'input' ? `input:${selection.id}`
    : selection.kind === 'output' ? `output:${selection.id}`
    : selection.kind === 'feature' ? featureSourceInputId
    : null;

  const lineage = useMemo(
    () => selectedNodeId && graphData && graphData.nodes.has(selectedNodeId)
      ? computeLineage(selectedNodeId, graphData.edges)
      : null,
    [selectedNodeId, graphData],
  );

  // ── Inference playback ──────────────────────────────────────────────────────

  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop playback when steps are cleared
  useEffect(() => {
    if (!inferenceSteps) { setIsPlaying(false); }
  }, [inferenceSteps]);

  // Keep a ref so the interval callback always sees the latest step index
  const stepIdxRef = useRef(inferenceStepIdx);
  stepIdxRef.current = inferenceStepIdx;

  // Auto-advance
  useEffect(() => {
    if (!isPlaying || !inferenceSteps) return;
    playIntervalRef.current = setInterval(() => {
      const next = stepIdxRef.current + 1;
      if (next >= inferenceSteps.length) {
        setIsPlaying(false);
        dispatch({ type: 'SET_INFERENCE_STEP_IDX', idx: inferenceSteps.length - 1 });
      } else {
        dispatch({ type: 'SET_INFERENCE_STEP_IDX', idx: next });
      }
    }, 700);
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying, inferenceSteps, dispatch]);

  // Scroll the active node into rough center when step changes
  useEffect(() => {
    if (inferenceStepIdx < 0 || !inferenceSteps || !containerRef.current) return;
    const step = inferenceSteps[inferenceStepIdx];
    const node = displayNodes.get(step.nodeId);
    if (!node) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const nodeCX = node.x + node.w / 2;
    const nodeCY = node.y + node.h / 2;
    setView(v => {
      const screenX = nodeCX * v.scale + v.tx;
      const screenY = nodeCY * v.scale + v.ty;
      const marginX = cw * 0.3;
      const marginY = ch * 0.3;
      if (screenX < marginX || screenX > cw - marginX || screenY < marginY || screenY > ch - marginY) {
        return { ...v, tx: cw / 2 - nodeCX * v.scale, ty: ch / 2 - nodeCY * v.scale };
      }
      return v;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inferenceStepIdx]);

  // Which nodes have been executed so far (steps 0..inferenceStepIdx)
  const executedNodeIds = useMemo<Set<string>>(() => {
    if (!inferenceSteps || inferenceStepIdx < 0) return new Set();
    const s = new Set<string>();
    for (let i = 0; i <= inferenceStepIdx; i++) s.add(inferenceSteps[i].nodeId);
    return s;
  }, [inferenceSteps, inferenceStepIdx]);

  const activeStep = inferenceSteps && inferenceStepIdx >= 0 ? inferenceSteps[inferenceStepIdx] : null;
  const activeNodeId = activeStep?.nodeId ?? null;

  // Edges that carry data for the current step (inputs to active node + outputs from it)
  const activeEdgeIds = useMemo<Set<string>>(() => {
    if (!activeNodeId || !graphData) return new Set();
    const s = new Set<string>();
    for (const e of graphData.edges) {
      if (e.toId === activeNodeId || e.fromId === activeNodeId) s.add(e.id);
    }
    return s;
  }, [activeNodeId, graphData]);

  // Auto-fit only when the graph content changes (not detail-page navigation)
  useEffect(() => {
    if (!graphData || !containerRef.current) return;
    const { w, h } = graphData.bbox;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min(1, Math.min((cw - 80) / Math.max(w, 1), (ch - 80) / Math.max(h, 1)));
    setView({ tx: (cw - w * scale) / 2, ty: (ch - h * scale) / 2, scale });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, compositeKey, direction]);

  // ── Input handlers ──────────────────────────────────────────────────────────

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.ctrlKey ? e.deltaY * 0.01 : e.deltaY * 0.001;
      const factor = Math.exp(-delta);
      setView(v => {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const newScale = Math.max(0.06, Math.min(4, v.scale * factor));
        const sf = newScale / v.scale;
        return { scale: newScale, tx: mx - sf * (mx - v.tx), ty: my - sf * (my - v.ty) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Check if mousedown landed on a node (or inside one)
    const nodeEl = (e.target as Element).closest('[data-node]') as Element | null;
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node');
      if (!nodeId) return;
      const node = displayNodes.get(nodeId);
      if (!node) return;
      nodeDrag.current = {
        nodeId,
        startMX: e.clientX,
        startMY: e.clientY,
        startNX: node.x,
        startNY: node.y,
        moved: false,
      };
      e.preventDefault();
      return;
    }
    // Background pan
    const v = viewRef.current;
    panDrag.current = { startX: e.clientX, startY: e.clientY, startTx: v.tx, startTy: v.ty };
    e.preventDefault();
  }, [displayNodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (nodeDrag.current) {
      const d = nodeDrag.current;
      const scale = viewRef.current.scale;
      const dx = (e.clientX - d.startMX) / scale;
      const dy = (e.clientY - d.startMY) / scale;
      if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        d.moved = true;
      }
      if (d.moved) {
        setNodePositions(prev => {
          const next = new Map(prev);
          next.set(d.nodeId, { x: d.startNX + dx, y: d.startNY + dy });
          return next;
        });
      }
      return;
    }
    if (panDrag.current) {
      const d = panDrag.current;
      setView(v => ({ ...v, tx: d.startTx + (e.clientX - d.startX), ty: d.startTy + (e.clientY - d.startY) }));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (nodeDrag.current?.moved) {
      justDragged.current = true;
      // Clear on next tick so the click event (which fires after mouseup) can check it
      setTimeout(() => { justDragged.current = false; }, 0);
    }
    nodeDrag.current = null;
    panDrag.current = null;
  }, []);

  // ── Node interaction ────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node: GNode) => {
    if (justDragged.current) return;
    if (node.kind === 'input') {
      if (compositePath.length > 0) {
        dispatch({ type: 'SET_SELECTION', selection: { kind: 'input', id: node.id.replace(/^input:/, ''), compositePath } });
      } else {
        dispatch({ type: 'SET_SELECTION', selection: { kind: 'input', id: node.label } });
      }
    } else if (node.kind === 'output') {
      if (compositePath.length > 0) {
        // Use the internal name so selectedNodeId matches the graph node id for lineage
        const internalName = node.id.replace(/^output:/, '');
        dispatch({ type: 'SET_SELECTION', selection: { kind: 'output', id: internalName, compositePath } });
      } else {
        dispatch({ type: 'SET_SELECTION', selection: { kind: 'output', id: node.label } });
      }
    } else if (node.modelNode) {
      dispatch({ type: 'SET_SELECTION', selection: {
        kind: 'node', id: node.modelNode.name,
        ...(compositePath.length > 0 ? { compositePath } : {}),
      } });
    }
  }, [dispatch, compositePath, model]);

  const handleEnterComposite = useCallback((nodeId: string) => {
    const name = nodeId.replace(/^node:/, '');
    const newPath = [...compositePath, name];
    dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'composite', compositePath: newPath }, label: `Composite: ${name}` } });
  }, [compositePath, dispatch]);

  const handleDblClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (justDragged.current) return;
    const nodeEl = (e.target as Element).closest('[data-node]') as Element | null;
    if (!nodeEl) return;
    const nodeId = nodeEl.getAttribute('data-node');
    if (!nodeId) return;
    const gnode = displayNodes.get(nodeId);
    const node = gnode?.modelNode;
    if (!node) return;

    if (node.composite) {
      handleEnterComposite(nodeId);
    } else if (node.tree_ensemble) {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'tree_ensemble', nodeName: node.name }, label: `TreeEnsemble: ${node.name}` } });
    } else if (node.tree) {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'tree', ensembleName: node.name, treeIndex: 0 }, label: `Tree: ${node.name}` } });
    } else if (node.clustering) {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'clustering', nodeName: node.name }, label: `Clustering: ${node.name}` } });
    } else if (node.linear) {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'linear', nodeName: node.name }, label: `Linear: ${node.name}` } });
    } else if (node.naive_bayes) {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'naive_bayes', nodeName: node.name }, label: `NaiveBayes: ${node.name}` } });
    } else if (node.svm) {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'svm', nodeName: node.name }, label: `SVM: ${node.name}` } });
    } else if (node.neural_network) {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'neural_network', nodeName: node.name }, label: `NeuralNetwork: ${node.name}` } });
    } else if (node.op === 'KNN') {
      dispatch({ type: 'NAV_PUSH', entry: { view: { kind: 'knn', nodeName: node.name }, label: `KNN: ${node.name}` } });
    }
  }, [displayNodes, handleEnterComposite, dispatch]);

  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  }, []);

  const handleFitView = useCallback(() => {
    if (!graphData || !containerRef.current) return;
    const { w, h } = graphData.bbox;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min(1, Math.min((cw - 80) / Math.max(w, 1), (ch - 80) / Math.max(h, 1)));
    setView({ tx: (cw - w * scale) / 2, ty: (ch - h * scale) / 2, scale });
  }, [graphData]);

  const handleMiniMapNavigate = useCallback((gx: number, gy: number) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    setView(v => ({ ...v, tx: cw / 2 - gx * v.scale, ty: ch / 2 - gy * v.scale }));
  }, []);

  if (!model || !graphData) return null;

  const isNodeDragging = Boolean(nodeDrag.current?.moved);
  const isPanDragging = Boolean(panDrag.current);
  const cursor = isNodeDragging ? 'grabbing' : isPanDragging ? 'grabbing' : 'grab';

  const nodes = [...displayNodes.values()];

  return (
    <div ref={containerRef} style={styles.root}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <ToolBtn label="+" title="Zoom in" onClick={() => setView(v => ({ ...v, scale: Math.min(v.scale * 1.2, 4) }))} />
        <ToolBtn label="−" title="Zoom out" onClick={() => setView(v => ({ ...v, scale: Math.max(v.scale / 1.2, 0.06) }))} />
        <ToolBtn label="⊡" title="Fit to view" onClick={handleFitView} />
        <ToolBtn label="⊞" title="Scope view" active={showScope} onClick={() => setShowScope(s => !s)} />
        <ToolBtn label={direction === 'LR' ? '↕' : '↔'} title={direction === 'LR' ? 'Switch to top-down layout' : 'Switch to left-right layout'} onClick={() => setDirection(d => d === 'LR' ? 'TB' : 'LR')} />
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        style={{ ...styles.svg, cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDblClick}
      >
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {/* Edges */}
          {graphData.edges.map(edge => {
            const isActiveEdge = activeNodeId ? activeEdgeIds.has(edge.id) : false;
            const isInputEdge = activeNodeId ? edge.toId === activeNodeId : false;
            const isOutputEdge = activeNodeId ? edge.fromId === activeNodeId : false;
            const isCompletedEdge = !activeNodeId && executedNodeIds.has(edge.fromId);
            return (
              <EdgePath
                key={edge.id}
                edge={edge}
                nodes={displayNodes}
                direction={direction}
                hovered={hoveredEdgeId === edge.id}
                selected={
                  isActiveEdge ||
                  (lineage ? (lineage.upEdgeIds.has(edge.id) || lineage.downEdgeIds.has(edge.id)) : false)
                }
                dimmed={
                  activeNodeId
                    ? !isActiveEdge
                    : (compositePath.length === 0 && !!lineage && !lineage.upEdgeIds.has(edge.id) && !lineage.downEdgeIds.has(edge.id))
                }
                inferenceRole={isInputEdge ? 'input' : isOutputEdge ? 'output' : isCompletedEdge ? 'done' : undefined}
                onHover={id => setHoveredEdgeId(id)}
                onLeave={() => setHoveredEdgeId(null)}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isActive = node.id === activeNodeId;
            const isDone = !isActive && executedNodeIds.has(node.id);
            const isPending = !!activeNodeId && !isActive && !isDone;
            return (
              <NodeCard
                key={node.id}
                node={node}
                direction={direction}
                selected={node.id === selectedNodeId}
                dimmed={
                  isPending ||
                  (compositePath.length === 0 && !!lineage && !activeNodeId &&
                    !lineage.upstream.has(node.id) &&
                    !lineage.downstream.has(node.id) &&
                    node.id !== selectedNodeId)
                }
                inferenceState={isActive ? 'active' : isDone ? 'done' : undefined}
                hovered={hoveredNodeId === node.id}
                onHover={id => setHoveredNodeId(id)}
                onLeave={() => setHoveredNodeId(null)}
                onClick={() => handleNodeClick(node)}
                onEnterComposite={node.isComposite ? () => handleEnterComposite(node.id) : undefined}
                onToggleCollapse={() => handleToggleCollapse(node.id)}
              />
            );
          })}

          {/* Step value overlay */}
          {activeStep && activeNodeId && (() => {
            const node = displayNodes.get(activeNodeId);
            return node ? (
              <StepOverlay
                step={activeStep}
                node={node}
                canvasW={(containerRef.current?.clientWidth ?? 800) / view.scale}
                canvasH={(containerRef.current?.clientHeight ?? 600) / view.scale}
              />
            ) : null;
          })()}
        </g>
      </svg>

      <MiniMap
        nodes={displayNodes}
        edges={graphData.edges}
        bbox={graphData.bbox}
        viewport={view}
        containerRef={containerRef}
        onNavigate={handleMiniMapNavigate}
      />

      {/* Structured model explain panel */}
      {activeStep?.explain && (
        <ExplainPanel explain={activeStep.explain} nodeName={activeStep.nodeName} />
      )}

      {showScope && (
        <ScopeView
          steps={graphData.scopeSteps}
          selectedNodeId={selectedNodeId}
          onSelectNode={nodeId => {
            if (!nodeId) return;
            dispatch({ type: 'SET_SELECTION', selection: { kind: 'node', id: nodeId.replace(/^node:/, '') } });
          }}
        />
      )}

      {/* Inference playback bar */}
      {inferenceSteps && inferenceSteps.length > 0 && (
        <PlaybackBar
          steps={inferenceSteps}
          stepIdx={inferenceStepIdx}
          isPlaying={isPlaying}
          onPlay={() => {
            if (inferenceStepIdx >= inferenceSteps.length - 1) {
              dispatch({ type: 'SET_INFERENCE_STEP_IDX', idx: 0 });
            }
            setIsPlaying(true);
          }}
          onPause={() => setIsPlaying(false)}
          onFirst={() => { setIsPlaying(false); dispatch({ type: 'SET_INFERENCE_STEP_IDX', idx: 0 }); }}
          onLast={() => { setIsPlaying(false); dispatch({ type: 'SET_INFERENCE_STEP_IDX', idx: inferenceSteps.length - 1 }); }}
          onPrev={() => { setIsPlaying(false); dispatch({ type: 'SET_INFERENCE_STEP_IDX', idx: Math.max(0, inferenceStepIdx - 1) }); }}
          onNext={() => { setIsPlaying(false); dispatch({ type: 'SET_INFERENCE_STEP_IDX', idx: Math.min(inferenceSteps.length - 1, inferenceStepIdx + 1) }); }}
          onClose={() => { setIsPlaying(false); dispatch({ type: 'SET_INFERENCE_STEPS', steps: null }); }}
        />
      )}

      {/* Scale indicator */}
      <div style={styles.scaleIndicator}>{Math.round(view.scale * 100)}%</div>
    </div>
  );
}

// ── Playback bar ──────────────────────────────────────────────────────────────

interface PlaybackBarProps {
  steps: import('@openmle/omle.js').StepSnapshot[];
  stepIdx: number;
  isPlaying: boolean;
  onPlay: () => void; onPause: () => void;
  onFirst: () => void; onLast: () => void;
  onPrev: () => void; onNext: () => void;
  onClose: () => void;
}

function PlaybackBar({ steps, stepIdx, isPlaying, onPlay, onPause, onFirst, onLast, onPrev, onNext, onClose }: PlaybackBarProps) {
  const step = steps[stepIdx];
  const pct = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 0;
  const hasWarn = step?.warnings.length > 0;

  return (
    <div style={pbStyles.root}>
      <div style={pbStyles.inner}>
        {/* Controls */}
        <button style={pbStyles.btn} onClick={onFirst} title="First step">⏮</button>
        <button style={pbStyles.btn} onClick={onPrev} title="Previous">⏪</button>
        <button style={{ ...pbStyles.btn, ...pbStyles.btnPlay }} onClick={isPlaying ? onPause : onPlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button style={pbStyles.btn} onClick={onNext} title="Next">⏩</button>
        <button style={pbStyles.btn} onClick={onLast} title="Last step">⏭</button>

        {/* Progress track */}
        <div style={pbStyles.track}>
          <div style={{ ...pbStyles.fill, width: `${pct}%` }} />
          {/* Step markers */}
          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                ...pbStyles.marker,
                left: `${steps.length > 1 ? (i / (steps.length - 1)) * 100 : 0}%`,
                background: s.warnings.length > 0 ? 'var(--t-warn)' : i <= stepIdx ? 'var(--t-accent)' : 'var(--t-faint)',
              }}
              title={s.nodeName}
            />
          ))}
        </div>

        {/* Step label */}
        <span style={pbStyles.label}>
          {stepIdx + 1} / {steps.length}
          {step && (
            <span style={{ ...pbStyles.nodeName, ...(hasWarn ? pbStyles.nodeNameWarn : {}) }}>
              {step.nodeName}
            </span>
          )}
          {hasWarn && <span style={pbStyles.warnBadge}>⚠ {step.warnings.length}</span>}
        </span>

        <button style={pbStyles.closeBtn} onClick={onClose} title="Close playback">✕</button>
      </div>
    </div>
  );
}

const pbStyles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
    zIndex: 20, minWidth: 480, maxWidth: '90%',
  },
  inner: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--t-bg)', border: '1px solid var(--t-trim)',
    borderRadius: 10, padding: '6px 12px',
    boxShadow: '0 4px 20px var(--t-node-shadow)',
  },
  btn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--t-accent)', fontSize: 13, padding: '2px 4px', borderRadius: 4,
  },
  btnPlay: { color: 'var(--t-accent2)', fontSize: 15 },
  track: {
    flex: 1, height: 4, background: 'var(--t-surface)', borderRadius: 2,
    position: 'relative', cursor: 'pointer', minWidth: 80,
  },
  fill: { height: '100%', background: 'var(--t-accent)', borderRadius: 2, transition: 'width 0.3s' },
  marker: {
    position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
    width: 6, height: 6, borderRadius: '50%', transition: 'background 0.2s',
  },
  label: { fontSize: 11, color: 'var(--t-text4)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 },
  nodeName: { color: 'var(--t-accent)', fontFamily: 'monospace', fontSize: 10 },
  nodeNameWarn: { color: 'var(--t-warn)' },
  warnBadge: { fontSize: 9, color: 'var(--t-warn)', background: 'var(--t-warn-bg)', border: '1px solid var(--t-node-warn-b)', borderRadius: 8, padding: '1px 5px' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-muted)', fontSize: 12, padding: '0 2px' },
};

function ToolBtn({ label, title, active, onClick }: { label: string; title?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      style={{ ...btnStyles.base, ...(active ? btnStyles.active : {}) }}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--t-canvas)',
  },
  svg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  toolbar: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: 'var(--t-surface)',
    border: '1px solid var(--t-frame)',
    borderRadius: 8,
    padding: 4,
    boxShadow: '0 2px 8px var(--t-node-shadow)',
  },
  scaleIndicator: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    fontSize: 10,
    color: 'var(--t-faint)',
    fontFamily: 'monospace',
    zIndex: 10,
  },
};

const btnStyles: Record<string, React.CSSProperties> = {
  base: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--t-text4)',
    fontSize: 14,
    width: 28,
    height: 28,
    borderRadius: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.1s, background 0.1s',
  },
  active: {
    background: 'var(--t-hover)',
    color: 'var(--t-accent)',
  },
};
