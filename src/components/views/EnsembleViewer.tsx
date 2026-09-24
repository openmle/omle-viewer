// Ensemble viewer — lists every tree in a TreeEnsemble with key stats.
// Double-clicking a row navigates into the individual TreeViewer.

import React from 'react';
import type { TreeEnsemble, Tree } from '@openmle/omle.js';
import { tensorToData } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';
import { tvTensor } from '../shared/tensorValue.ts';

interface Props {
  nodeName: string;
  ensemble: TreeEnsemble;
  featureNames?: string[];
  inputLabel?: string | null;
}

export function EnsembleViewer({ nodeName, ensemble, featureNames = [], inputLabel }: Props) {
  const { dispatch, state } = useApp();
  const { inferenceSteps, inferenceStepIdx } = state;

  const trees = ensemble.trees ?? [];

  // Find the active explain for this node (if inference has been run)
  const activeStep = inferenceSteps && inferenceStepIdx >= 0 ? inferenceSteps[inferenceStepIdx] : null;
  const explainRaw = activeStep?.nodeId === `node:${nodeName}` && activeStep.explain?.type === 'tree_ensemble'
    ? activeStep.explain
    : null;
  const explain = explainRaw?.type === 'tree_ensemble' ? explainRaw : null;

  const drillInto = (treeIndex: number) => {
    const tree = trees[treeIndex];
    dispatch({
      type: 'NAV_PUSH',
      entry: {
        view: { kind: 'tree', ensembleName: nodeName, treeIndex },
        label: `Tree #${treeIndex}${tree ? ` (${treeNodeCount(tree)} nodes)` : ''}`,
      },
    });
  };

  // base_scores is a TensorValue with one entry per output column, not a
  // Scalar. It was read as `base_score`, a field omle.proto does not carry, so
  // the row silently never rendered.
  const baseScoresT = tvTensor(ensemble.base_scores, state.model);
  const baseScores = baseScoresT
    ? Array.from(tensorToData(baseScoresT).data as ArrayLike<number>).map(Number)
    : null;
  const baseScoreLabel = baseScores && baseScores.length > 0
    ? baseScores.map(fmtNum).join(', ')
    : null;

  const propsBar: [string, string][] = [
    ['Task',        ensemble.task_type   ?? '—'],
    ['Aggregation', ensemble.aggregation ?? '—'],
    ['Trees',       String(trees.length)],
    ['Features',    featureNames.length > 0 ? String(featureNames.length) : '—'],
    ...(baseScoreLabel != null ? [['Base score', baseScoreLabel] as [string, string]] : []),
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

      {/* Column headers */}
      <div style={styles.colHeader}>
        <span style={{ ...styles.col, ...styles.colIdx }}>#</span>
        <span style={{ ...styles.col, ...styles.colNodes }}>Nodes</span>
        <span style={{ ...styles.col, ...styles.colRoot }}>Root split</span>
        <span style={{ ...styles.col, ...styles.colLeaf }}>Leaf value</span>
        {explain && <span style={{ ...styles.col, ...styles.colPath }}>Decision path</span>}
        <span style={styles.colHint}>double-click to inspect</span>
      </div>

      {/* Rows */}
      <div style={styles.list}>
        {trees.map((tree, i) => {
          const item = explain?.trees.find((it: import('@openmle/omle.js').TreeExplainItem) => it.treeIndex === i);
          return (
            <TreeRow
              key={i}
              index={i}
              tree={tree}
              featureNames={featureNames}
              model={state.model}
              explainItem={item ?? null}
              showPath={!!explain}
              onDblClick={() => drillInto(i)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Tree row ──────────────────────────────────────────────────────────────────

interface TreeRowProps {
  index: number;
  tree: Tree;
  featureNames: string[];
  model: import('@openmle/omle.js').OMLEModel | null;
  explainItem: import('@openmle/omle.js').TreeExplainItem | null;
  showPath: boolean;
  onDblClick: () => void;
}

function TreeRow({ index, tree, featureNames, model, explainItem, showPath, onDblClick }: TreeRowProps) {
  const [hovered, setHovered] = React.useState(false);
  const nodeCount = treeNodeCount(tree);
  const rootSplit = rootSplitLabel(tree, featureNames, model);

  return (
    <div
      style={{ ...styles.row, background: hovered ? 'var(--t-hover)' : 'transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onDblClick}
      title="Double-click to inspect tree structure"
    >
      <span style={{ ...styles.col, ...styles.colIdx, color: 'var(--t-text4)' }}>{index}</span>
      <span style={{ ...styles.col, ...styles.colNodes, color: 'var(--t-text4)' }}>{nodeCount}</span>
      <span style={{ ...styles.col, ...styles.colRoot, color: 'var(--t-text3)', fontFamily: 'monospace', fontSize: 11 }}>
        {rootSplit}
      </span>
      <span style={{ ...styles.col, ...styles.colLeaf, color: 'var(--t-tree-leaf)', fontFamily: 'monospace', fontSize: 11 }}>
        {explainItem ? fmtNum(explainItem.leafValue[0] ?? 0) : '—'}
      </span>
      {showPath && (
        <span style={{ ...styles.col, ...styles.colPath }}>
          {explainItem
            ? <PathChips path={explainItem.path} />
            : <span style={{ color: 'var(--t-muted)', fontSize: 10 }}>—</span>
          }
        </span>
      )}
    </div>
  );
}

function PathChips({ path }: { path: import('@openmle/omle.js').TreePathStep[] }) {
  return (
    <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {path.map((step, i) => (
        <span
          key={i}
          style={{
            fontSize: 9,
            padding: '1px 4px',
            borderRadius: 3,
            background: step.goLeft ? 'var(--t-ok-bg)' : 'var(--t-err-bg)',
            border: `1px solid ${step.goLeft ? 'var(--t-edge-out)' : 'var(--t-err)'}`,
            color: step.goLeft ? 'var(--t-edge-out)' : 'var(--t-err)',
            fontFamily: 'monospace',
          }}
        >
          f{step.featureIndex}{step.goLeft ? '←' : '→'}
        </span>
      ))}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function treeNodeCount(tree: Tree): number {
  return tree.num_nodes ?? tree.node_kind?.length ?? 0;
}

function rootSplitLabel(tree: Tree, featureNames: string[], model: import('@openmle/omle.js').OMLEModel | null): string {
  if (!tree.node_kind || tree.node_kind[0] === 'LEAF') return 'leaf';
  const feat = tree.split_feature?.[0];
  const op = tree.split_op?.[0] ?? 'LESS_THAN';
  if (feat === undefined) return '?';
  const opSym = splitOpSymbol(op);
  const name = featureNames[feat] ?? `f${feat}`;
  const splitT = tvTensor(tree.split_threshold, model);
  const thresholds = splitT ? tensorToData(splitT).data as Float64Array : null;
  const threshold = thresholds?.[0];
  return threshold !== undefined
    ? `${name} ${opSym} ${fmtNum(threshold)}`
    : `${name} ${opSym} ?`;
}

function splitOpSymbol(op: string): string {
  switch (op) {
    case 'LESS_THAN':          return '<';
    case 'LESS_OR_EQUAL':      return '≤';
    case 'GREATER_THAN':       return '>';
    case 'GREATER_OR_EQUAL':   return '≥';
    case 'EQUAL':              return '=';
    case 'NOT_EQUAL':          return '≠';
    case 'IN_SET':             return '∈';
    case 'NOT_IN_SET':         return '∉';
    default:                   return '?';
  }
}

function fmtNum(v: number): string {
  if (!isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(3);
  return parseFloat(v.toPrecision(5)).toString();
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    background: 'var(--t-canvas)', fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
  },

  propsRow: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-border)', flexShrink: 0, flexWrap: 'wrap' },
  propCell: { display: 'flex', flexDirection: 'column', padding: '8px 16px', borderRight: '1px solid var(--t-border)' },
  propLabel: { fontSize: 9, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  propValue: { fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' },

  colHeader: {
    display: 'flex', alignItems: 'center',
    padding: '4px 20px',
    borderBottom: '1px solid var(--t-line)',
    fontSize: 10, fontWeight: 700, color: 'var(--t-muted)', letterSpacing: '0.06em',
    flexShrink: 0,
  },
  colHint: { marginLeft: 'auto', fontSize: 10, color: 'var(--t-faint)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0 },
  list: { flex: 1, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center',
    padding: '5px 20px',
    borderBottom: '1px solid var(--t-line)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  col: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 },
  colIdx:   { width: 36, flexShrink: 0 },
  colNodes: { width: 60, flexShrink: 0 },
  colRoot:  { flex: 1, minWidth: 120 },
  colLeaf:  { width: 90, flexShrink: 0 },
  colPath:  { width: 180, flexShrink: 0 },
};
