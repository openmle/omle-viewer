import React, { useState } from 'react';
import type { TreeEnsembleExplain, TreeExplainItem } from '@openmle/omle.js';

const C = {
  panel:    'var(--t-surface)',
  border:   'var(--t-frame)',
  header:   'var(--t-surface2)',
  text:     'var(--t-text2)',
  dim:      'var(--t-text4)',
  good:     'var(--t-edge-out)',
  bad:      'var(--t-warn)',
  score:    'var(--t-accent2)',
  leaf:     'var(--t-ok)',
  label:    'var(--t-text4)',
  badge:    'var(--t-chip)',
  expand:   'var(--t-muted)',
} as const;

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(2);
  return v.toPrecision(4).replace(/\.?0+$/, '');
}

function opSymbol(op: string): string {
  switch (op) {
    case 'LESS_THAN':        return '<';
    case 'LESS_OR_EQUAL':    return '≤';
    case 'GREATER_THAN':     return '>';
    case 'GREATER_OR_EQUAL': return '≥';
    case 'EQUAL':            return '=';
    case 'NOT_EQUAL':        return '≠';
    case 'IS_MISSING':       return '∅';
    case 'IN_SET':           return '∈';
    case 'NOT_IN_SET':       return '∉';
    default: return op;
  }
}

function ScoreChips({ scores }: { scores: number[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {scores.map((s, i) => (
        <span key={i} style={{ fontSize: 10, color: C.score, background: 'var(--t-chip)', border: `1px solid var(--t-trim)`, borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>
          {scores.length > 1 ? `c${i}: ` : ''}{fmt(s)}
        </span>
      ))}
    </div>
  );
}

function TreeItem({ item, defaultOpen }: { item: TreeExplainItem; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const leafStr = item.leafValue.map(fmt).join(', ');
  const weightStr = item.weight !== 1 ? ` ×${fmt(item.weight)}` : '';

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      {/* Compact header row */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontSize: 9, color: C.expand, fontFamily: 'monospace', width: 8 }}>
          {open ? '▾' : '▸'}
        </span>
        <span style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace', minWidth: 50 }}>
          tree {item.treeIndex}
        </span>
        <span style={{ fontSize: 10, color: C.leaf, fontFamily: 'monospace', flex: 1 }}>
          [{leafStr}]{weightStr}
        </span>
        <span style={{ fontSize: 9, color: C.label, fontFamily: 'monospace' }}>
          {item.path.length} splits
        </span>
      </div>

      {/* Expanded path */}
      {open && (
        <div style={{ paddingLeft: 18, paddingBottom: 6 }}>
          {item.path.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: 8, color: step.goLeft ? C.good : C.bad, width: 6 }}>
                {step.goLeft ? '▶' : '▷'}
              </span>
              <span style={{ fontSize: 10, color: C.text, fontFamily: 'monospace', minWidth: 80, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={step.featureName}>
                {step.featureName}
              </span>
              <span style={{ fontSize: 10, color: C.label, fontFamily: 'monospace', minWidth: 14, textAlign: 'center' }}>
                {opSymbol(step.op)}
              </span>
              <span style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace', minWidth: 50 }}>
                {fmt(step.threshold)}
              </span>
              <span style={{ fontSize: 9, color: 'var(--t-faint)', fontFamily: 'monospace' }}>
                ({fmt(step.value)})
              </span>
              <span style={{ fontSize: 9, color: step.goLeft ? C.good : C.bad, fontFamily: 'monospace' }}>
                {step.goLeft ? '✓L' : '✗R'}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: 8, color: C.leaf, width: 6 }}>↳</span>
            <span style={{ fontSize: 10, color: C.leaf, fontFamily: 'monospace' }}>
              leaf [{leafStr}]
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TreeEnsembleView({ explain }: { explain: TreeEnsembleExplain }) {
  const [showAll, setShowAll] = useState(false);
  const MAX_TREES = 8;
  const trees = explain.trees;
  const visible = showAll ? trees : trees.slice(0, MAX_TREES);

  return (
    <div>
      {/* Header summary */}
      <div style={{ padding: '6px 10px', background: C.header, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            aggregation
          </span>
          <span style={{ fontSize: 10, color: C.text, fontFamily: 'monospace' }}>
            {explain.aggregation}
          </span>
          {explain.baseScore != null && (
            <>
              <span style={{ fontSize: 9, color: C.label }}>base</span>
              <span style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace' }}>{fmt(explain.baseScore)}</span>
            </>
          )}
          <span style={{ fontSize: 9, color: C.label, marginLeft: 'auto' }}>
            {trees.length} tree{trees.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ marginTop: 4 }}>
          <span style={{ fontSize: 9, color: C.label, marginRight: 6 }}>scores</span>
          <ScoreChips scores={explain.classScores} />
        </div>
      </div>

      {/* Tree list */}
      <div>
        {visible.map((item, i) => (
          <TreeItem key={i} item={item} defaultOpen={trees.length === 1} />
        ))}
        {trees.length > MAX_TREES && (
          <div
            style={{ padding: '5px 10px', cursor: 'pointer', fontSize: 10, color: C.expand, textAlign: 'center' }}
            onClick={() => setShowAll(s => !s)}
          >
            {showAll ? '▲ show less' : `▼ show all ${trees.length} trees`}
          </div>
        )}
      </div>
    </div>
  );
}
