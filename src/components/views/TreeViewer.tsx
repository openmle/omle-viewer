// Single-tree SVG viewer.
// Layout: top-down binary tree using a recursive leaf-counting algorithm.
// If inference explain data is available, highlights the decision path.

import React, { useMemo, useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import type { Tree, TreeEnsemble } from '@openmle/omle.js';
import { tensorToData } from '@openmle/omle.js';
import { tvTensor } from '../shared/tensorValue.ts';
import { useApp } from '../../App.tsx';

const NODE_W = 140;
const NODE_H = 44;
const H_GAP  = 16;   // horizontal gap between sibling subtrees
const V_GAP  = 52;   // vertical gap between levels

const MAX_NODES_FULL = 255;   // show full tree up to this size
const MAX_DEPTH_CLIP = 5;     // depth limit when tree is too large

interface Props {
  ensembleName: string;
  treeIndex: number;
  tree: Tree;
  ensemble?: TreeEnsemble;
  featureNames?: string[];
  inputLabel?: string | null;
  standalone?: boolean;
}

interface LayoutNode {
  idx: number;
  x: number;       // center x in graph coords
  y: number;       // top-y in graph coords
  left: number | null;
  right: number | null;
  isLeaf: boolean;
}

export function TreeViewer({ ensembleName, treeIndex, tree, ensemble, featureNames = [], inputLabel, standalone = false }: Props) {
  const { state } = useApp();
  const { inferenceSteps, inferenceStepIdx, model } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [vt, setVt] = useState({ tx: 0, ty: 40, scale: 1 });
  const panRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  // Explain path for this tree (from inference playback)
  const pathNodeIdxSet = useMemo<Set<number>>(() => {
    const activeStep = inferenceSteps && inferenceStepIdx >= 0 ? inferenceSteps[inferenceStepIdx] : null;
    if (!activeStep || activeStep.nodeId !== `node:${ensembleName}`) return new Set();
    if (activeStep.explain?.type !== 'tree_ensemble') return new Set();
    const ensembleExplain = activeStep.explain;
    const item = ensembleExplain.trees.find((it: import('@openmle/omle.js').TreeExplainItem) => it.treeIndex === treeIndex);
    if (!item) return new Set();
    return new Set((item.path as import('@openmle/omle.js').TreePathStep[]).map(s => s.nodeIndex));
  }, [inferenceSteps, inferenceStepIdx, ensembleName, treeIndex]);

  const nodeCount = tree.num_nodes ?? tree.node_kind?.length ?? 0;
  const clipped = nodeCount > MAX_NODES_FULL;
  const maxDepth = clipped ? MAX_DEPTH_CLIP : Infinity;

  const layout = useMemo(() => buildLayout(tree, maxDepth), [tree, maxDepth]);

  // Compute bounding box (guard against empty layout)
  const hasLayout = layout.length > 0;
  const minX = hasLayout ? Math.min(...layout.map(n => n.x)) - NODE_W / 2 - 20 : 0;
  const maxX = hasLayout ? Math.max(...layout.map(n => n.x)) + NODE_W / 2 + 20 : 400;
  const minY = hasLayout ? Math.min(...layout.map(n => n.y)) - 20 : 0;
  const maxY = hasLayout ? Math.max(...layout.map(n => n.y)) + NODE_H + 20 : 200;
  const graphW = maxX - minX;
  const graphH = maxY - minY;

  // Auto-center when tree changes (useLayoutEffect runs after DOM paint, never during render)
  useLayoutEffect(() => {
    if (!containerRef.current || !hasLayout) return;
    const cw = containerRef.current.clientWidth || 800;
    const ch = containerRef.current.clientHeight || 600;
    const scale = Math.min(1, Math.min((cw - 40) / Math.max(graphW, 1), (ch - 40) / Math.max(graphH, 1)));
    setVt({ tx: (cw - graphW * scale) / 2 - minX * scale, ty: (ch - graphH * scale) / 2 - minY * scale, scale });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // ctrlKey is set by macOS for trackpad pinch; use proportional zoom for smooth feel
      const delta = e.ctrlKey ? e.deltaY * 0.01 : e.deltaY * 0.001;
      const factor = Math.exp(-delta);
      setVt(v => {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const ns = Math.max(0.06, Math.min(4, v.scale * factor));
        const sf = ns / v.scale;
        return { scale: ns, tx: mx - sf * (mx - v.tx), ty: my - sf * (my - v.ty) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    panRef.current = { startX: e.clientX, startY: e.clientY, startTx: vt.tx, startTy: vt.ty };
  }, [vt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panRef.current) return;
    const d = panRef.current;
    setVt(v => ({ ...v, tx: d.startTx + (e.clientX - d.startX), ty: d.startTy + (e.clientY - d.startY) }));
  }, []);

  const handleMouseUp = useCallback(() => { panRef.current = null; }, []);

  const handleFit = () => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min(1, Math.min((cw - 40) / Math.max(graphW, 1), (ch - 40) / Math.max(graphH, 1)));
    setVt({ tx: (cw - graphW * scale) / 2 - minX * scale, ty: (ch - graphH * scale) / 2 - minY * scale, scale });
  };

  // Pre-extract tensor data for rendering
  const treeArrays: TreeArrays = useMemo(() => {
    const leafValT = tvTensor(tree.leaf_value, model);
    const leafVecT = tvTensor(tree.leaf_vector, model);
    const splitT   = tvTensor(tree.split_threshold, model);
    const leafValData = leafValT ? tensorToData(leafValT).data as Float64Array : null;
    const leafVecData = leafVecT ? tensorToData(leafVecT).data as Float64Array : null;
    return {
      splitThresholds: splitT ? tensorToData(splitT).data as Float64Array : null,
      leafValues: leafValData?.length ? leafValData : null,
      leafWidth: tree.leaf_width ?? 1,
      leafVector: leafVecData?.length ? leafVecData : null,
      leafVectorIndex: tree.leaf_vector_index ?? null,
    };
  }, [tree, model]);

  // Build a lookup map for edges
  const nodeMap = new Map<number, LayoutNode>(layout.map(n => [n.idx, n]));

  const taskType  = tree.task_type ?? ensemble?.task_type;
  const leafWidth = tree.leaf_width ?? 1;

  const propsBar: [string, string][] = [
    ['Task',       taskType ?? '—'],
    ['Features',   featureNames.length > 0 ? String(featureNames.length) : '—'],
    ['Nodes',      String(nodeCount)],
    ['Leaf width', String(leafWidth)],
    ...(inputLabel ? [['Input', inputLabel] as [string, string]] : []),
  ];

  return (
    <div style={styles.root}>
      {/* Props bar */}
      <div style={styles.propsRow}>
        {propsBar.map(([k, v]) => (
          <div key={k} style={styles.propCell}>
            <span style={styles.propLabel}>{k}</span>
            <span style={styles.propValue}>{v}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>{standalone ? 'Tree' : `Tree #${treeIndex}`}</span>
        {clipped && (
          <span style={styles.clipped}>
            ⚠ {nodeCount} nodes — showing first {MAX_DEPTH_CLIP} levels only
          </span>
        )}
        {pathNodeIdxSet.size > 0 && (
          <span style={styles.pathHint}>Decision path highlighted</span>
        )}
      </div>

      {/* Canvas — containerRef lives here so clientWidth/Height reflect the SVG area */}
      <div ref={containerRef} style={styles.canvas}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <button style={styles.toolBtn} onClick={() => setVt(v => ({ ...v, scale: Math.min(v.scale * 1.2, 4) }))}>+</button>
          <button style={styles.toolBtn} onClick={() => setVt(v => ({ ...v, scale: Math.max(v.scale / 1.2, 0.06) }))}>−</button>
          <button style={styles.toolBtn} onClick={handleFit}>⊡</button>
        </div>

        {/* SVG */}
        <svg
          ref={svgRef}
          style={{ ...styles.svg, cursor: panRef.current ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g transform={`translate(${vt.tx},${vt.ty}) scale(${vt.scale})`}>
            {/* Edges */}
            {layout.map(n => (
              <React.Fragment key={`e-${n.idx}`}>
                {n.left  !== null && <TreeEdge from={n} to={nodeMap.get(n.left)!}  side="left"  highlighted={pathNodeIdxSet.has(n.left)} />}
                {n.right !== null && <TreeEdge from={n} to={nodeMap.get(n.right)!} side="right" highlighted={pathNodeIdxSet.has(n.right)} />}
              </React.Fragment>
            ))}
            {/* Nodes */}
            {layout.map(n => (
              <TreeNode
                key={n.idx}
                n={n}
                tree={tree}
                arrays={treeArrays}
                featureNames={featureNames}
                onPath={pathNodeIdxSet.has(n.idx)}
              />
            ))}
          </g>
        </svg>

        {/* Scale indicator */}
        <div style={styles.scale}>{Math.round(vt.scale * 100)}%</div>
      </div>
    </div>
  );
}

// ── SVG primitives ────────────────────────────────────────────────────────────

interface TreeArrays {
  splitThresholds: Float64Array | null;
  // leaf_value: per-node flat array (ensemble trees, leaf_width scalars per node)
  leafValues: Float64Array | null;
  leafWidth: number;
  // leaf_vector + leaf_vector_index: indirected storage used by standalone trees
  leafVector: Float64Array | null;
  leafVectorIndex: number[] | null;
}

function TreeNode({ n, tree, arrays, featureNames, onPath }: { n: LayoutNode; tree: Tree; arrays: TreeArrays; featureNames: string[]; onPath: boolean }) {
  const x = n.x - NODE_W / 2;
  const y = n.y;

  const borderColor = onPath ? 'var(--t-node-path-b)' : n.isLeaf ? 'var(--t-ok-bg)' : 'var(--t-tree-edge)';
  const bg          = onPath ? 'var(--t-node-path)' : n.isLeaf ? 'var(--t-tree-leaf-bg)' : 'var(--t-tree-node-bg)';

  const { line1, line2 } = n.isLeaf
    ? leafLines(n.idx, arrays)
    : { line1: splitLabel(n.idx, tree, arrays, featureNames), line2: depthHint(n.idx, tree) };

  return (
    <g>
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={6} ry={6}
        fill={bg} stroke={borderColor} strokeWidth={onPath ? 1.5 : 1} />
      {onPath && <rect x={x} y={y} width={NODE_W} height={3} rx={3} ry={3} fill="var(--t-node-path-top)" />}
      <text x={n.x} y={y + (line2 ? 16 : 22)} textAnchor="middle"
        fill={n.isLeaf ? 'var(--t-tree-leaf)' : 'var(--t-tree-node)'} fontSize={11} fontFamily="monospace">
        {line1}
      </text>
      {line2 && (
        <text x={n.x} y={y + 31} textAnchor="middle"
          fill="var(--t-text4)" fontSize={9} fontFamily="monospace">
          {line2}
        </text>
      )}
    </g>
  );
}

function TreeEdge({ from, to, side, highlighted }: {
  from: LayoutNode; to: LayoutNode; side: 'left' | 'right'; highlighted: boolean;
}) {
  void side;
  const x1 = from.x;
  const y1 = from.y + NODE_H;
  const x2 = to.x;
  const y2 = to.y;
  const my = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;

  return (
    <path d={d} fill="none"
      stroke={highlighted ? 'var(--t-tree-edge-p)' : 'var(--t-tree-edge)'}
      strokeWidth={highlighted ? 1.5 : 1} />
  );
}

// ── Layout algorithm ──────────────────────────────────────────────────────────

function buildLayout(tree: Tree, maxDepth: number): LayoutNode[] {
  const result: LayoutNode[] = [];
  const nodeCount = tree.node_kind?.length ?? 0;
  // Cap recursion at nodeCount to prevent infinite loops from malformed/cyclic trees
  const depthCap = Math.min(maxDepth, nodeCount + 1);

  function leafCount(idx: number, depth: number): number {
    if (depth >= depthCap) return 1;
    const kind = tree.node_kind?.[idx] ?? 'LEAF';
    if (kind === 'LEAF') return 1;
    const offset = tree.children_offset?.[idx] ?? 0;
    const left  = tree.children_index?.[offset] ?? -1;
    const right = tree.children_index?.[offset + 1] ?? -1;
    if (left < 0 || right < 0) return 1;
    return leafCount(left, depth + 1) + leafCount(right, depth + 1);
  }

  function place(idx: number, depth: number, minLeafX: number): number {
    if (depth >= depthCap) {
      result.push({ idx, x: minLeafX * (NODE_W + H_GAP) + NODE_W / 2, y: depth * (NODE_H + V_GAP), left: null, right: null, isLeaf: true });
      return 1;
    }
    const kind = tree.node_kind?.[idx] ?? 'LEAF';
    if (kind === 'LEAF') {
      result.push({ idx, x: minLeafX * (NODE_W + H_GAP) + NODE_W / 2, y: depth * (NODE_H + V_GAP), left: null, right: null, isLeaf: true });
      return 1;
    }
    const offset = tree.children_offset?.[idx] ?? 0;
    const left   = tree.children_index?.[offset] ?? -1;
    const right  = tree.children_index?.[offset + 1] ?? -1;
    if (left < 0 || right < 0) {
      result.push({ idx, x: minLeafX * (NODE_W + H_GAP) + NODE_W / 2, y: depth * (NODE_H + V_GAP), left: null, right: null, isLeaf: true });
      return 1;
    }
    const lw = leafCount(left, depth + 1);
    place(left, depth + 1, minLeafX);
    place(right, depth + 1, minLeafX + lw);
    const total = lw + leafCount(right, depth + 1);
    const cx = (minLeafX + total / 2) * (NODE_W + H_GAP) - H_GAP / 2;
    result.push({ idx, x: cx, y: depth * (NODE_H + V_GAP), left, right, isLeaf: false });
    return total;
  }

  if (nodeCount > 0) place(0, 0, 0);
  return result;
}

// ── Node label helpers ────────────────────────────────────────────────────────

function splitLabel(idx: number, tree: Tree, arrays: TreeArrays, featureNames: string[]): string {
  const feat = tree.split_feature?.[idx];
  const threshold = arrays.splitThresholds?.[idx];
  const op = tree.split_op?.[idx] ?? 'LESS_THAN';
  if (feat === undefined) return '?';
  const opSym = opSymbol(op);
  const name = featureNames[feat] ?? `f${feat}`;
  return threshold !== undefined ? `${name} ${opSym} ${fmtNum(threshold)}` : `${name} ${opSym} ?`;
}

function getLeafSlice(idx: number, arrays: TreeArrays): number[] | null {
  const lw = arrays.leafWidth;
  if (arrays.leafVector && arrays.leafVectorIndex) {
    const start = arrays.leafVectorIndex[idx];
    if (start === undefined) return null;
    return Array.from({ length: lw }, (_, j) => arrays.leafVector![start + j] ?? NaN);
  }
  if (arrays.leafValues) {
    if (lw <= 1) {
      const v = arrays.leafValues[idx];
      return v !== undefined ? [v] : null;
    }
    const start = idx * lw;
    return Array.from({ length: lw }, (_, j) => arrays.leafValues![start + j] ?? NaN);
  }
  return null;
}

function leafLines(idx: number, arrays: TreeArrays): { line1: string; line2: string | null } {
  const vals = getLeafSlice(idx, arrays);
  if (!vals) return { line1: '▶ leaf', line2: null };
  if (vals.length <= 1) {
    return { line1: `▶ ${fmtNum(vals[0])}`, line2: null };
  }
  const first3 = vals.slice(0, 3).map(v => isNaN(v) ? '?' : fmtNum(v));
  return {
    line1: `▶ ${first3.join('  ')}`,
    line2: vals.length > 3 ? `+${vals.length - 3} more` : null,
  };
}

function depthHint(idx: number, tree: Tree): string | null {
  const offset = tree.children_offset?.[idx] ?? 0;
  const left   = tree.children_index?.[offset];
  const right  = tree.children_index?.[offset + 1];
  if (left === undefined) return null;
  const lKind = tree.node_kind?.[left]  ?? 'LEAF';
  const rKind = tree.node_kind?.[right!] ?? 'LEAF';
  if (lKind === 'LEAF' && rKind === 'LEAF') return null;
  return `${lKind === 'LEAF' ? '·' : '↓'} / ${rKind === 'LEAF' ? '·' : '↓'}`;
}

function opSymbol(op: string): string {
  switch (op) {
    case 'LESS_THAN':        return '<';
    case 'LESS_OR_EQUAL':    return '≤';
    case 'GREATER_THAN':     return '>';
    case 'GREATER_OR_EQUAL': return '≥';
    case 'EQUAL':            return '=';
    case 'NOT_EQUAL':        return '≠';
    default:                 return '?';
  }
}

function fmtNum(v: number): string {
  if (!isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
  return parseFloat(v.toPrecision(4)).toString();
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    background: 'var(--t-canvas)', position: 'relative',
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
  },

  propsRow: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-border)', flexShrink: 0, flexWrap: 'wrap' },
  propCell: { display: 'flex', flexDirection: 'column', padding: '8px 16px', borderRight: '1px solid var(--t-border)' },
  propLabel: { fontSize: 9, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  propValue: { fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' },

  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 16px 8px',
    borderBottom: '1px solid var(--t-line)',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 14, fontWeight: 700, color: 'var(--t-accent2)' },
  headerMeta:  { fontSize: 11, color: 'var(--t-text4)' },
  clipped:     { fontSize: 11, color: 'var(--t-warn)', background: 'var(--t-warn-bg)', border: '1px solid var(--t-node-warn-b)', borderRadius: 4, padding: '2px 8px' },
  pathHint:    { fontSize: 11, color: 'var(--t-accent)', background: 'var(--t-accent-bg)', border: '1px solid var(--t-frame)', borderRadius: 4, padding: '2px 8px' },
  canvas: { flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 },
  toolbar: {
    position: 'absolute', top: 10, left: 10, zIndex: 10,
    display: 'flex', flexDirection: 'column', gap: 2,
    background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 8,
    padding: 4, boxShadow: '0 2px 8px var(--t-node-shadow)',
  },
  toolBtn: {
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-text4)',
    fontSize: 14, width: 28, height: 28, borderRadius: 5,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  svg: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  scale: { position: 'absolute', bottom: 12, left: 12, fontSize: 10, color: 'var(--t-faint)', fontFamily: 'monospace', zIndex: 10 },
};
