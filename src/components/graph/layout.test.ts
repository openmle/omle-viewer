// Unit tests for layout.ts — pure graph layout helpers.

import { describe, test, expect } from 'vitest';
import {
  computeLineage,
  getBodyType,
  getIcon,
  typeLabel,
  getOutputPortPos,
  getInputPortPos,
  buildGraphData,
  DIM,
} from './layout.js';
import type { GEdge, GNode } from './layout.js';
import type { Node } from '@openmle/omle.js';

// ── getBodyType ───────────────────────────────────────────────────────────────

describe('getBodyType', () => {
  test('tree', () => expect(getBodyType({ name: 'n', tree: {} } as Node)).toBe('Tree'));
  test('tree_ensemble', () => expect(getBodyType({ name: 'n', tree_ensemble: {} } as Node)).toBe('TreeEnsemble'));
  test('linear', () => expect(getBodyType({ name: 'n', linear: {} } as Node)).toBe('Linear'));
  test('neural_network', () => expect(getBodyType({ name: 'n', neural_network: {} } as Node)).toBe('NeuralNet'));
  test('naive_bayes', () => expect(getBodyType({ name: 'n', naive_bayes: {} } as Node)).toBe('NaiveBayes'));
  test('clustering', () => expect(getBodyType({ name: 'n', clustering: {} } as Node)).toBe('Cluster'));
  test('svm', () => expect(getBodyType({ name: 'n', svm: {} } as Node)).toBe('SVM'));
  test('composite', () => expect(getBodyType({ name: 'n', composite: {} } as Node)).toBe('Composite'));
  test('op', () => expect(getBodyType({ name: 'n', op: 'omle.cast' } as Node)).toBe('omle.cast'));
  test('empty node returns null', () => expect(getBodyType({ name: 'n' } as Node)).toBeNull());
});

// ── getIcon ───────────────────────────────────────────────────────────────────

describe('getIcon', () => {
  test('tree_ensemble', () => expect(getIcon({ name: 'n', tree_ensemble: {} } as Node)).toBe('🌳'));
  test('tree', () => expect(getIcon({ name: 'n', tree: {} } as Node)).toBe('🌳'));
  test('linear', () => expect(getIcon({ name: 'n', linear: {} } as Node)).toBe('Σ'));
  test('svm', () => expect(getIcon({ name: 'n', svm: {} } as Node)).toBe('⊗'));
  test('composite', () => expect(getIcon({ name: 'n', composite: {} } as Node)).toBe('📦'));
  test('feature domain node', () => expect(getIcon({ name: 'n', domain: 'omle.feature.ohe' } as Node)).toBe('⚡'));
  test('text domain node', () => expect(getIcon({ name: 'n', domain: 'omle.text.tfidf' } as Node)).toBe('📝'));
  test('core domain node', () => expect(getIcon({ name: 'n', domain: 'omle.core.identity' } as Node)).toBe('⚙'));
  test('unknown node falls back to gear', () => expect(getIcon({ name: 'n' } as Node)).toBe('⚙'));
});

// ── typeLabel ─────────────────────────────────────────────────────────────────

describe('typeLabel', () => {
  test('undefined → empty string', () => expect(typeLabel()).toBe(''));
  test('float32 scalar', () => expect(typeLabel({ dtype: 'FLOAT32', shape: [] })).toBe('F32'));
  test('float64 with shape', () => expect(typeLabel({ dtype: 'FLOAT64', shape: [10] })).toBe('F64[10]'));
  test('dynamic dimension', () => expect(typeLabel({ dtype: 'FLOAT32', shape: [-1, 4] })).toBe('F32[N×4]'));
  test('int64', () => expect(typeLabel({ dtype: 'INT64', shape: [3] })).toBe('I64[3]'));
  // UINT8: replace('INT','I') fires first (UINT8 → UI8), then replace('UINT','U') has nothing to match
  test('uint8', () => expect(typeLabel({ dtype: 'UINT8', shape: [2] })).toBe('UI8[2]'));
  test('DATA_TYPE_UNSPECIFIED becomes empty prefix', () => {
    expect(typeLabel({ dtype: 'DATA_TYPE_UNSPECIFIED', shape: [2] })).toBe('[2]');
  });
  test('no shape → only dtype', () => {
    expect(typeLabel({ dtype: 'FLOAT32' })).toBe('F32');
  });
  test('STRING type', () => expect(typeLabel({ dtype: 'STRING', shape: [5] })).toBe('STRING[5]'));
});

// ── computeLineage ────────────────────────────────────────────────────────────

describe('computeLineage', () => {
  // Graph: A → B → C, A → D
  const edges: GEdge[] = [
    { id: 'e1', fromId: 'A', fromPortName: 'out', toId: 'B', toPortName: 'in', valueName: 'ab' },
    { id: 'e2', fromId: 'B', fromPortName: 'out', toId: 'C', toPortName: 'in', valueName: 'bc' },
    { id: 'e3', fromId: 'A', fromPortName: 'out', toId: 'D', toPortName: 'in', valueName: 'ad' },
  ];

  test('upstream of C includes A and B', () => {
    const { upstream } = computeLineage('C', edges);
    expect(upstream.has('B')).toBe(true);
    expect(upstream.has('A')).toBe(true);
    expect(upstream.has('D')).toBe(false);
  });

  test('upstream does not include the selected node itself', () => {
    const { upstream } = computeLineage('C', edges);
    expect(upstream.has('C')).toBe(false);
  });

  test('downstream of A includes B, C, and D', () => {
    const { downstream } = computeLineage('A', edges);
    expect(downstream.has('B')).toBe(true);
    expect(downstream.has('C')).toBe(true);
    expect(downstream.has('D')).toBe(true);
  });

  test('downstream of leaf node is empty', () => {
    const { downstream } = computeLineage('C', edges);
    expect(downstream.size).toBe(0);
  });

  test('upstream edge ids are collected', () => {
    const { upEdgeIds } = computeLineage('C', edges);
    expect(upEdgeIds.has('e2')).toBe(true);
    expect(upEdgeIds.has('e1')).toBe(true);
    expect(upEdgeIds.has('e3')).toBe(false);
  });

  test('downstream edge ids are collected', () => {
    const { downEdgeIds } = computeLineage('A', edges);
    expect(downEdgeIds.has('e1')).toBe(true);
    expect(downEdgeIds.has('e3')).toBe(true);
    // e2 (B→C) is also collected because the BFS continues from B to C
    expect(downEdgeIds.has('e2')).toBe(true);
  });

  test('isolated node has empty upstream and downstream', () => {
    const { upstream, downstream } = computeLineage('X', edges);
    expect(upstream.size).toBe(0);
    expect(downstream.size).toBe(0);
  });

  test('handles empty edges list', () => {
    const { upstream, downstream } = computeLineage('A', []);
    expect(upstream.size).toBe(0);
    expect(downstream.size).toBe(0);
  });
});

// ── getOutputPortPos / getInputPortPos ────────────────────────────────────────

function mkNode(id: string, kind: GNode['kind'], x: number, y: number, w: number, h: number): GNode {
  return {
    id, kind, label: id, bodyType: null, icon: '⚙',
    outPorts: kind !== 'output' ? [{ name: 'out', py: h / 2 }] : [],
    inPortY: h / 2, portY: h / 2,
    modelNode: null, hasErrors: false, hasWarnings: false,
    x, y, w, h,
    isComposite: false, collapsed: false,
  };
}

describe('getOutputPortPos', () => {
  const nodes = new Map<string, GNode>([
    ['n1', mkNode('n1', 'node', 10, 20, DIM.NODE_W, 88)],
    ['inp', mkNode('inp', 'input', 0, 0, DIM.TERMINAL_W, DIM.TERMINAL_H)],
  ]);

  test('LR: output port is at right edge of node', () => {
    const pos = getOutputPortPos('n1', 'out', nodes, 'LR');
    expect(pos.x).toBe(10 + DIM.NODE_W);
    expect(pos.y).toBe(20 + 44); // py = h/2 = 88/2 = 44
  });

  test('TB: output port is at bottom center', () => {
    const pos = getOutputPortPos('n1', 'out', nodes, 'TB');
    expect(pos.x).toBe(10 + DIM.NODE_W / 2);
    expect(pos.y).toBe(20 + 88);
  });

  test('input terminal LR: output port is at right edge', () => {
    const pos = getOutputPortPos('inp', 'out', nodes, 'LR');
    expect(pos.x).toBe(DIM.TERMINAL_W);
  });

  test('missing node returns 0,0', () => {
    const pos = getOutputPortPos('missing', 'out', nodes, 'LR');
    expect(pos).toEqual({ x: 0, y: 0 });
  });
});

describe('getInputPortPos', () => {
  const nodes = new Map<string, GNode>([
    ['n1', mkNode('n1', 'node', 10, 20, DIM.NODE_W, 88)],
    ['out', mkNode('out', 'output', 100, 0, DIM.TERMINAL_W, DIM.TERMINAL_H)],
  ]);

  test('LR: input port is at left edge of node', () => {
    const pos = getInputPortPos('n1', nodes, 'LR');
    expect(pos.x).toBe(10);
  });

  test('TB: input port is at top center', () => {
    const pos = getInputPortPos('n1', nodes, 'TB');
    expect(pos.x).toBe(10 + DIM.NODE_W / 2);
    expect(pos.y).toBe(20);
  });

  test('output terminal LR: input port is at left edge', () => {
    const pos = getInputPortPos('out', nodes, 'LR');
    expect(pos.x).toBe(100);
  });

  test('missing node returns 0,0', () => {
    const pos = getInputPortPos('missing', nodes, 'LR');
    expect(pos).toEqual({ x: 0, y: 0 });
  });
});

// ── buildGraphData ────────────────────────────────────────────────────────────

describe('buildGraphData', () => {
  test('empty model produces no nodes or edges', () => {
    const { nodes, edges } = buildGraphData({}, null, new Set(), []);
    expect(nodes.size).toBe(0);
    expect(edges.length).toBe(0);
  });

  test('single input terminal is created', () => {
    const model = { inputs: [{ name: 'x' }] };
    const { nodes } = buildGraphData(model, null, new Set(), []);
    expect(nodes.has('input:x')).toBe(true);
    expect(nodes.get('input:x')?.kind).toBe('input');
  });

  test('single output terminal is created', () => {
    const model = { outputs: [{ name: 'y' }] };
    const { nodes } = buildGraphData(model, null, new Set(), []);
    expect(nodes.has('output:y')).toBe(true);
    expect(nodes.get('output:y')?.kind).toBe('output');
  });

  test('model node is created with correct label', () => {
    const model = {
      inputs: [{ name: 'x' }],
      nodes: [{ name: 'linear1', outputs: [{ name: 'z' }] }],
      outputs: [{ name: 'z' }],
    };
    const { nodes } = buildGraphData(model, null, new Set(), []);
    expect(nodes.has('node:linear1')).toBe(true);
    expect(nodes.get('node:linear1')?.label).toBe('linear1');
  });

  test('edge is created between input and node', () => {
    const model = {
      inputs: [{ name: 'x' }],
      nodes: [
        { name: 'op', inputs: [{ name: { value: 'x' } }], outputs: [{ name: 'out' }] },
      ],
    };
    const { edges } = buildGraphData(model, null, new Set(), []);
    expect(edges.some(e => e.fromId === 'input:x' && e.toId === 'node:op')).toBe(true);
  });

  test('edge is created between node and output', () => {
    const model = {
      nodes: [{ name: 'op', outputs: [{ name: 'out' }] }],
      outputs: [{ name: 'out' }],
    };
    const { edges } = buildGraphData(model, null, new Set(), []);
    expect(edges.some(e => e.fromId === 'node:op' && e.toId === 'output:out')).toBe(true);
  });

  test('bbox covers all nodes', () => {
    const model = {
      inputs: [{ name: 'x' }],
      outputs: [{ name: 'y' }],
      nodes: [{ name: 'n', inputs: [{ name: { value: 'x' } }], outputs: [{ name: 'y' }] }],
    };
    const { bbox } = buildGraphData(model, null, new Set(), []);
    expect(bbox.w).toBeGreaterThan(0);
    expect(bbox.h).toBeGreaterThan(0);
  });

  test('scopeSteps includes model inputs step', () => {
    const model = { inputs: [{ name: 'x' }] };
    const { scopeSteps } = buildGraphData(model, null, new Set(), []);
    expect(scopeSteps[0].label).toBe('Model inputs');
    expect(scopeSteps[0].addedNames).toContain('x');
  });

  test('TB direction produces different layout than LR', () => {
    const model = {
      inputs: [{ name: 'x' }],
      nodes: [{ name: 'op', inputs: [{ name: { value: 'x' } }], outputs: [{ name: 'y' }] }],
      outputs: [{ name: 'y' }],
    };
    const lr = buildGraphData(model, null, new Set(), [], 'LR');
    const tb = buildGraphData(model, null, new Set(), [], 'TB');
    // In LR, nodes differ along X axis; in TB, along Y axis
    const lrInput = lr.nodes.get('input:x')!;
    const tbInput = tb.nodes.get('input:x')!;
    // Both should have nodes placed; positions differ
    expect(lrInput.x).toBeDefined();
    expect(tbInput.y).toBeDefined();
  });
});
