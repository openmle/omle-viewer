// Explain panel — shown during inference playback when the active node is a
// structured predictor. Dispatches to the model-specific view component.

import React, { useState } from 'react';
import type { ModelExplain } from '@openmle/omle.js';
import { TreeEnsembleView } from './explain/TreeEnsembleView.tsx';
import { LinearView } from './explain/LinearView.tsx';
import { NaiveBayesView } from './explain/NaiveBayesView.tsx';
import { ClusteringView } from './explain/ClusteringView.tsx';

interface ExplainPanelProps {
  explain: ModelExplain;
  nodeName: string;
}

const LABEL: Record<ModelExplain['type'], string> = {
  tree_ensemble: 'Tree Ensemble',
  linear:        'Linear',
  naive_bayes:   'Naïve Bayes',
  clustering:    'Clustering',
};

export function ExplainPanel({ explain, nodeName }: ExplainPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={styles.root}>
      {/* Title bar */}
      <div style={styles.titleBar} onClick={() => setCollapsed(c => !c)}>
        <span style={styles.typeLabel}>{LABEL[explain.type]}</span>
        <span style={styles.nodeName}>{nodeName}</span>
        <span style={styles.collapseBtn}>{collapsed ? '▸' : '▾'}</span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={styles.body}>
          {explain.type === 'tree_ensemble' && <TreeEnsembleView explain={explain} />}
          {explain.type === 'linear'        && <LinearView explain={explain} />}
          {explain.type === 'naive_bayes'   && <NaiveBayesView explain={explain} />}
          {explain.type === 'clustering'    && <ClusteringView explain={explain} />}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position:    'absolute',
    top:         10,
    right:       10,
    width:       320,
    maxHeight:   'calc(100% - 90px)',
    background:  'var(--t-surface)',
    border:      '1px solid var(--t-frame)',
    borderRadius: 8,
    boxShadow:   '0 4px 20px var(--t-node-shadow)',
    zIndex:      15,
    display:     'flex',
    flexDirection: 'column',
    overflow:    'hidden',
    fontFamily:  '"Inter", "Segoe UI", system-ui, sans-serif',
    fontSize:    12,
  },
  titleBar: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    padding:      '6px 10px',
    background:   'var(--t-surface2)',
    borderBottom: '1px solid var(--t-frame)',
    cursor:       'pointer',
    flexShrink:   0,
    userSelect:   'none',
  },
  typeLabel: {
    fontSize:      10,
    fontWeight:    600,
    color:         'var(--t-accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  nodeName: {
    fontSize:     10,
    color:        'var(--t-text4)',
    fontFamily:   'monospace',
    flex:         1,
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  },
  collapseBtn: {
    fontSize:   10,
    color:      'var(--t-muted)',
    flexShrink: 0,
  },
  body: {
    overflowY: 'auto',
    flex:      1,
    minHeight: 0,
  },
};
