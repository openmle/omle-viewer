// Graph layout for OMLE DAG visualization.
// Produces positioned GNode/GEdge data ready for SVG rendering.

import type {
  OMLEModel, Node, TensorType, MeasureLevel, OutputRole,
  NameRange, Feature,
} from '@openmle/omle.js';
import type { ValidationResult } from '@openmle/omle.js';

// ── Dimension constants ───────────────────────────────────────────────────────

export const DIM = {
  NODE_W: 228,
  NODE_HEADER_H: 44,
  NODE_PORT_H: 22,
  TERMINAL_W: 160,
  TERMINAL_H: 54,
  TERMINAL_FEATURE_H: 14,
  PORT_R: 5,
  H_GAP: 96,
  V_GAP: 20,
  PADDING: 40,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GPort {
  name: string;
  type?: TensorType;
  role?: OutputRole;
  measure_level?: MeasureLevel;
  py: number;      // y-offset from node top to port center
}

export interface GNode {
  id: string;
  kind: 'input' | 'node' | 'output';
  label: string;
  bodyType: string | null;
  icon: string;
  outPorts: GPort[];
  inPortY: number; // y-offset from node top to input port center
  portY: number;   // y-offset to the single terminal port (input: right side, output: left side)
  modelNode: Node | null;
  hasErrors: boolean;
  hasWarnings: boolean;
  x: number; y: number; w: number; h: number;
  terminalType?: TensorType;
  featureLabels?: string[];
  featureDtypes?: string[];   // parallel to featureLabels — dtype string per feature row
  featureCastLabel?: string;  // e.g. "F64[N×6] → F32[N×6]" when input/feature dtypes differ
  isComposite: boolean;
  collapsed: boolean;
  // For composite scope
  inheritedInputs?: string[];
  inputAliases?: Array<{ from: string; to: string }>;
  outputAliases?: Array<{ from: string; to: string }>;
}

export interface GEdge {
  id: string;
  fromId: string;
  fromPortName: string;
  toId: string;
  toPortName: string;
  valueName: string;
  type?: TensorType;
  measureLevel?: MeasureLevel;
  role?: OutputRole;
}

export interface ScopeStep {
  label: string;
  nodeId: string | null;
  addedNames: string[];
  allNames: string[];
}

export interface GraphData {
  nodes: Map<string, GNode>;
  edges: GEdge[];
  bbox: { w: number; h: number };
  scopeSteps: ScopeStep[];
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildGraphData(
  model: OMLEModel,
  validation: ValidationResult | null,
  collapsed: Set<string>,
  compositePath: string[],
  direction: 'LR' | 'TB' = 'LR',
): GraphData {
  if (compositePath.length > 0) {
    return buildCompositeGraph(model, validation, collapsed, compositePath, direction);
  }
  return buildModelGraph(model, validation, collapsed, direction);
}

export function computeLineage(
  selectedId: string,
  edges: GEdge[],
): { upstream: Set<string>; downstream: Set<string>; upEdgeIds: Set<string>; downEdgeIds: Set<string> } {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const upEdgeIds = new Set<string>();
  const downEdgeIds = new Set<string>();

  const upQ = [selectedId];
  const upVisited = new Set<string>([selectedId]);
  while (upQ.length > 0) {
    const id = upQ.shift()!;
    for (const e of edges) {
      if (e.toId === id) {
        upEdgeIds.add(e.id);
        if (!upVisited.has(e.fromId)) {
          upVisited.add(e.fromId);
          upstream.add(e.fromId);
          upQ.push(e.fromId);
        }
      }
    }
  }

  const downQ = [selectedId];
  const downVisited = new Set<string>([selectedId]);
  while (downQ.length > 0) {
    const id = downQ.shift()!;
    for (const e of edges) {
      if (e.fromId === id) {
        downEdgeIds.add(e.id);
        if (!downVisited.has(e.toId)) {
          downVisited.add(e.toId);
          downstream.add(e.toId);
          downQ.push(e.toId);
        }
      }
    }
  }

  return { upstream, downstream, upEdgeIds, downEdgeIds };
}

export function getOutputPortPos(
  nodeId: string, portName: string, nodes: Map<string, GNode>, direction: 'LR' | 'TB' = 'LR',
): { x: number; y: number } {
  const n = nodes.get(nodeId);
  if (!n) return { x: 0, y: 0 };
  if (direction === 'TB') return { x: n.x + n.w / 2, y: n.y + n.h };
  if (n.kind === 'input') return { x: n.x + n.w, y: n.y + n.portY };
  const port = n.outPorts.find(p => p.name === portName);
  return { x: n.x + n.w, y: n.y + (port ? port.py : n.h / 2) };
}

export function getInputPortPos(
  nodeId: string, nodes: Map<string, GNode>, direction: 'LR' | 'TB' = 'LR',
): { x: number; y: number } {
  const n = nodes.get(nodeId);
  if (!n) return { x: 0, y: 0 };
  if (direction === 'TB') return { x: n.x + n.w / 2, y: n.y };
  if (n.kind === 'output') return { x: n.x, y: n.y + n.portY };
  return { x: n.x, y: n.y + n.inPortY };
}

// ── Top-level graph ───────────────────────────────────────────────────────────

function buildModelGraph(
  model: OMLEModel,
  validation: ValidationResult | null,
  collapsed: Set<string>,
  direction: 'LR' | 'TB' = 'LR',
): GraphData {
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];

  const errorSet = new Set((validation?.errors ?? []).map(e => e.path));
  const warnSet = new Set((validation?.warnings ?? []).map(e => e.path));

  // Value producers: value name → gnode id
  const producers = new Map<string, string>();

  // 1. Input terminals
  for (const inp of model.inputs ?? []) {
    const id = `input:${inp.name}`;
    nodes.set(id, mkTerminal(id, 'input', inp.name, inp.type));
    producers.set(inp.name, id);
  }

  // Schema feature name aliasing
  for (const feat of model.model_schema?.features ?? []) {
    const names = feat.name
      ? [feat.name]
      : feat.range ? expandRange(feat.range) : [];
    const src = feat.source ?? feat.name ?? '';
    const srcProducer = producers.get(src) ?? `input:${src}`;
    for (const n of names) {
      if (!producers.has(n)) producers.set(n, srcProducer);
    }
  }

  // 2. Model nodes
  for (const node of model.nodes ?? []) {
    const id = `node:${node.name}`;
    const isComposite = Boolean(node.composite);
    const isCollapsed = collapsed.has(id);
    const bodyType = getBodyType(node);
    const icon = getIcon(node);

    const outPorts: GPort[] = (node.outputs ?? []).map((out, i) => ({
      name: out.name,
      type: out.type,
      role: out.role,
      measure_level: out.measure_level,
      py: DIM.NODE_HEADER_H + i * DIM.NODE_PORT_H + DIM.NODE_PORT_H / 2,
    }));

    const numPorts = isCollapsed ? 0 : Math.max(outPorts.length, 1);
    const h = DIM.NODE_HEADER_H + numPorts * DIM.NODE_PORT_H;

    nodes.set(id, {
      id, kind: 'node', label: node.name, bodyType, icon,
      outPorts: isCollapsed ? [] : outPorts,
      inPortY: h / 2, portY: h / 2,
      modelNode: node,
      hasErrors: [...errorSet].some(p => p.includes(`[${node.name}]`) || p.startsWith('nodes')),
      hasWarnings: [...warnSet].some(p => p.includes(`[${node.name}]`)),
      x: 0, y: 0, w: DIM.NODE_W, h,
      isComposite, collapsed: isCollapsed,
    });

    for (const out of node.outputs ?? []) producers.set(out.name, id);
  }

  // 3. Output terminals
  for (const out of model.outputs ?? []) {
    const id = `output:${out.name}`;
    nodes.set(id, mkTerminal(id, 'output', out.name, out.type));
  }

  // 4. Edges: node inputs → node
  const edgeSet = new Set<string>();

  for (const node of model.nodes ?? []) {
    const toId = `node:${node.name}`;
    const inputNames = expandInputs(node.inputs ?? []);
    const seen = new Set<string>();
    for (const name of inputNames) {
      const fromId = producers.get(name);
      if (!fromId) continue;
      const key = `${fromId}|${name}|${toId}`;
      if (seen.has(key) || edgeSet.has(key)) continue;
      seen.add(key); edgeSet.add(key);
      const fromNode = nodes.get(fromId);
      const port = fromNode?.outPorts.find(p => p.name === name);
      edges.push({
        id: key, fromId, fromPortName: name, toId, toPortName: name,
        valueName: name, type: port?.type, measureLevel: port?.measure_level, role: port?.role,
      });
    }
  }

  for (const out of model.outputs ?? []) {
    const toId = `output:${out.name}`;
    const fromId = producers.get(out.name);
    if (!fromId) continue;
    const key = `${fromId}|${out.name}|${toId}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    const fromNode = nodes.get(fromId);
    const port = fromNode?.outPorts.find(p => p.name === out.name);
    edges.push({
      id: key, fromId, fromPortName: out.name, toId, toPortName: out.name,
      valueName: out.name, type: out.type ?? port?.type, role: out.role ?? port?.role,
    });
  }

  attachInputFeatures(nodes, model);
  applyLayout(nodes, edges, direction);
  const scopeSteps = buildScopeSteps(model, producers);
  const bbox = computeBbox(nodes);
  return { nodes, edges, bbox, scopeSteps };
}

// ── Composite drill-down graph ────────────────────────────────────────────────

function buildCompositeGraph(
  model: OMLEModel,
  validation: ValidationResult | null,
  collapsed: Set<string>,
  path: string[],
  direction: 'LR' | 'TB' = 'LR',
): GraphData {
  // Resolve the composite node by following the path through nested composites
  let currentNodes: Node[] = model.nodes ?? [];
  let compositeNode: Node | null = null;

  for (const name of path) {
    compositeNode = currentNodes.find(n => n.name === name) ?? null;
    if (!compositeNode) break;
    currentNodes = compositeNode.composite?.nodes ?? [];
  }

  if (!compositeNode?.composite) {
    return { nodes: new Map(), edges: [], bbox: { w: 200, h: 100 }, scopeSteps: [] };
  }

  const composite = compositeNode.composite;
  const parentInputNames = expandInputs(compositeNode.inputs ?? []);

  // Build input aliases map: enclosing_name → internal_name
  const inputAliasMap = new Map<string, string>();
  for (const alias of composite.input_aliases ?? []) {
    inputAliasMap.set(alias.from_name, alias.to_name);
  }
  // Build output aliases map: internal_name → enclosing_name
  const outputAliasMap = new Map<string, string>();
  for (const alias of composite.output_aliases ?? []) {
    outputAliasMap.set(alias.from_name, alias.to_name);
  }

  // Inherited inputs in internal scope
  const internalInputNames = parentInputNames.map(n => inputAliasMap.get(n) ?? n);

  // Published outputs: find what internal names map to enclosing outputs
  const enclosingOutputs = compositeNode.outputs ?? [];
  const publishedInternal = enclosingOutputs.map(out => {
    const internalName = [...outputAliasMap.entries()]
      .find(([, ext]) => ext === out.name)?.[0] ?? out.name;
    return { internal: internalName, external: out.name, type: out.type, role: out.role };
  });

  // Build a synthetic model for the composite interior
  const syntheticModel: OMLEModel = {
    inputs: internalInputNames.map(n => ({ name: n })),
    outputs: publishedInternal.map(p => ({ name: p.internal, type: p.type, role: p.role })),
    nodes: composite.nodes ?? [],
    tensor_entries: model.tensor_entries,
  };

  const graphData = buildModelGraph(syntheticModel, validation, collapsed, direction);

  // Rename output terminal labels to their external (to_name) aliases
  if (outputAliasMap.size > 0) {
    for (const [fromName, toName] of outputAliasMap) {
      const nodeId = `output:${fromName}`;
      const node = graphData.nodes.get(nodeId);
      if (node) {
        graphData.nodes.set(nodeId, { ...node, label: toName });
      }
    }
  }

  return graphData;
}

// ── Layout engine ─────────────────────────────────────────────────────────────

function applyLayout(nodes: Map<string, GNode>, edges: GEdge[], direction: 'LR' | 'TB' = 'LR') {
  const ids = [...nodes.keys()];
  if (ids.length === 0) return;

  // Predecessor map
  const preds = new Map<string, Set<string>>();
  const succs = new Map<string, Set<string>>();
  for (const id of ids) { preds.set(id, new Set()); succs.set(id, new Set()); }
  for (const e of edges) {
    preds.get(e.toId)?.add(e.fromId);
    succs.get(e.fromId)?.add(e.toId);
  }

  // Topological sort (DFS post-order)
  const visited = new Set<string>();
  const topoOrder: string[] = [];
  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const s of succs.get(id) ?? []) dfs(s);
    topoOrder.unshift(id);
  }
  for (const id of ids) dfs(id);

  // Assign rank = 1 + max(rank of predecessors)
  const rank = new Map<string, number>();
  for (const id of topoOrder) {
    const ps = [...(preds.get(id) ?? [])];
    rank.set(id, ps.length === 0 ? 0 : 1 + Math.max(...ps.map(p => rank.get(p) ?? 0)));
  }

  // Group by rank
  const byRank = new Map<number, string[]>();
  for (const [id, r] of rank) {
    const list = byRank.get(r) ?? [];
    list.push(id);
    byRank.set(r, list);
  }

  // Barycenter sort within each rank
  const posInRank = new Map<string, number>(); // node id → position index in its rank
  for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
    const list = byRank.get(r)!;
    const scored = list.map(id => {
      const ps = [...(preds.get(id) ?? [])];
      const bary = ps.length === 0 ? 0 : ps.reduce((s, p) => s + (posInRank.get(p) ?? 0), 0) / ps.length;
      return { id, bary };
    });
    scored.sort((a, b) => a.bary - b.bary);
    scored.forEach(({ id }, i) => posInRank.set(id, i));
    byRank.set(r, scored.map(s => s.id));
  }

  if (direction === 'TB') {
    // Ranks are rows (Y axis); nodes within rank spread horizontally
    const rankYStart = new Map<number, number>();
    let ry = DIM.PADDING;
    for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
      rankYStart.set(r, ry);
      const maxH = Math.max(...(byRank.get(r) ?? []).map(id => nodes.get(id)?.h ?? (DIM.NODE_HEADER_H + DIM.NODE_PORT_H)));
      ry += maxH + DIM.H_GAP;
    }
    for (const [r, list] of byRank) {
      const y = rankYStart.get(r)!;
      let cx = DIM.PADDING;
      for (const id of list) {
        const n = nodes.get(id)!;
        n.x = cx;
        n.y = y;
        cx += n.w + DIM.V_GAP * 2;
      }
    }
  } else {
    // LR: Ranks are columns (X axis); nodes within rank stack vertically
    const rankXStart = new Map<number, number>();
    let rx = DIM.PADDING;
    for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
      rankXStart.set(r, rx);
      const maxW = Math.max(...(byRank.get(r) ?? []).map(id => nodes.get(id)?.w ?? DIM.NODE_W));
      rx += maxW + DIM.H_GAP;
    }
    for (const [r, list] of byRank) {
      const x = rankXStart.get(r)!;
      let cy = DIM.PADDING;
      for (const id of list) {
        const n = nodes.get(id)!;
        n.x = x;
        n.y = cy;
        cy += n.h + DIM.V_GAP;
      }
    }
  }
}

// ── Scope steps ───────────────────────────────────────────────────────────────

function buildScopeSteps(model: OMLEModel, _producers: Map<string, string>): ScopeStep[] {
  const steps: ScopeStep[] = [];
  const cumulative: string[] = [];

  const inputNames = (model.inputs ?? []).map(i => i.name);
  cumulative.push(...inputNames);
  steps.push({ label: 'Model inputs', nodeId: null, addedNames: [...inputNames], allNames: [...cumulative] });

  // Schema features
  const featureNames: string[] = [];
  for (const feat of model.model_schema?.features ?? []) {
    const names = feat.name ? [feat.name] : feat.range ? expandRange(feat.range) : [];
    for (const n of names) if (!cumulative.includes(n)) featureNames.push(n);
  }
  if (featureNames.length > 0) {
    cumulative.push(...featureNames);
    steps.push({ label: 'Schema features', nodeId: null, addedNames: featureNames, allNames: [...cumulative] });
  }

  for (const node of model.nodes ?? []) {
    const outNames = (node.outputs ?? []).map(o => o.name);
    cumulative.push(...outNames);
    steps.push({ label: node.name, nodeId: `node:${node.name}`, addedNames: outNames, allNames: [...cumulative] });
  }

  return steps;
}

// ── Node metadata ─────────────────────────────────────────────────────────────

export function getBodyType(node: Node): string | null {
  if (node.tree) return 'Tree';
  if (node.tree_ensemble) return 'TreeEnsemble';
  if (node.linear) return 'Linear';
  if (node.neural_network) return 'NeuralNet';
  if (node.naive_bayes) return 'NaiveBayes';
  if (node.clustering) return 'Cluster';
  if (node.svm) return 'SVM';
  if (node.composite) return 'Composite';
  if (node.op) return node.op;
  return null;
}

export function getIcon(node: Node): string {
  if (node.tree_ensemble) return '🌳';
  if (node.tree) return '🌳';
  if (node.linear) return 'Σ';
  if (node.neural_network) return '⬡';  // rendered as OMLEIcon in NodeCard
  if (node.naive_bayes) return '🎲';
  if (node.clustering) return '⬡';
  if (node.svm) return '⊗';
  if (node.composite) return '📦';
  const domain = node.domain ?? '';
  if (domain.includes('feature')) return '⚡';
  if (domain.includes('text')) return '📝';
  if (domain.includes('core')) return '⚙';
  return '⚙';
}

export function typeLabel(type?: Partial<TensorType>): string {
  if (!type) return '';
  const dtype = type.dtype?.replace('DATA_TYPE_UNSPECIFIED', '').replace('FLOAT', 'F').replace('INT', 'I').replace('UINT', 'U') ?? '';
  const shape = (type.shape ?? []).map(d => d <= 0 ? 'N' : String(d)).join('×');
  return shape ? `${dtype}[${shape}]` : dtype;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkTerminal(id: string, kind: 'input' | 'output', name: string, type?: TensorType): GNode {
  const portY = DIM.TERMINAL_H / 2;
  return {
    id, kind, label: name, bodyType: null, icon: kind === 'input' ? '→' : '←',
    outPorts: kind === 'input' ? [{ name, type, py: portY }] : [],
    inPortY: portY, portY,
    terminalType: type,
    modelNode: null, hasErrors: false, hasWarnings: false,
    x: 0, y: 0, w: DIM.TERMINAL_W, h: DIM.TERMINAL_H,
    isComposite: false, collapsed: false,
  };
}

function featureLabel(f: Feature): string {
  if (f.range) {
    const start = f.range.start ?? 0;
    const count = f.range.end - start;
    if (count === 1) return f.range.prefix;
    return `${f.range.prefix}[${start}…${f.range.end - 1}]`;
  }
  return f.name ?? '';
}

function attachInputFeatures(nodes: Map<string, GNode>, model: OMLEModel) {
  const inputs = model.inputs ?? [];
  if (inputs.length === 0) return;
  const inputNames = new Set(inputs.map(i => i.name));

  // Collect features per input
  const byInput = new Map<string, Array<{ f: Feature; label: string }>>();
  for (const f of model.model_schema?.features ?? []) {
    let inp: string | null = null;
    if (f.source && inputNames.has(f.source)) inp = f.source;
    else if (!f.source && f.name && inputNames.has(f.name)) inp = f.name;
    else if (f.range?.prefix && inputNames.has(f.range.prefix)) inp = f.range.prefix;
    else if (inputs.length === 1) inp = inputs[0].name;
    if (!inp) continue;
    const arr = byInput.get(inp) ?? [];
    arr.push({ f, label: featureLabel(f) });
    byInput.set(inp, arr);
  }

  for (const inp of inputs) {
    const entries = byInput.get(inp.name) ?? [];
    // Show if multiple features, or if single feature whose name differs from the input
    const trivial = entries.length === 1 && entries[0].f.name === inp.name && !entries[0].f.range;
    if (entries.length === 0 || trivial) continue;

    const labels = entries.map(e => e.label);
    const dtypes = entries.map(e => {
      const d = e.f.type?.dtype;
      if (d && d !== 'DATA_TYPE_UNSPECIFIED') return d;
      // Fall back to measure_level for color inference
      switch (e.f.measure_level) {
        case 'CONTINUOUS': return '';
        case 'NOMINAL':    return 'STRING';
        case 'ORDINAL':    return 'INT64';
        case 'FLAG':       return 'BOOL';
        default:           return '';
      }
    });
    const n = nodes.get(`input:${inp.name}`);
    if (!n) continue;
    n.featureLabels = labels;
    n.featureDtypes = dtypes;
    n.h = DIM.TERMINAL_H + labels.length * DIM.TERMINAL_FEATURE_H;
    // portY stays at TERMINAL_H/2 so edges connect to the header area, not the extended body

    // Detect dtype mismatch between input and its features
    const inputDtype = inp.type?.dtype;
    const featDtypes = new Set(entries.map(e => e.f.type?.dtype).filter(Boolean));
    if (inputDtype && featDtypes.size === 1) {
      const featDtype = [...featDtypes][0]!;
      if (featDtype !== inputDtype) {
        const inLabel = typeLabel(inp.type);
        const featLabel = typeLabel({ dtype: featDtype, shape: inp.type?.shape ?? [] });
        n.featureCastLabel = `${inLabel} → ${featLabel}`;
      }
    }
  }
}

function expandInputs(inputs: Array<{ name?: { value: string }; range?: NameRange }>): string[] {
  const names: string[] = [];
  for (const inp of inputs) {
    if (inp.name !== undefined) names.push(inp.name.value);
    else if (inp.range) names.push(...expandRange(inp.range));
  }
  return names;
}

function expandRange(range: NameRange): string[] {
  const names: string[] = [];
  const w = range.width ?? 0;
  for (let i = range.start; i < range.end; i++) {
    names.push(`${range.prefix}${w > 0 ? String(i).padStart(w, '0') : i}`);
  }
  return names;
}

function computeBbox(nodes: Map<string, GNode>): { w: number; h: number } {
  let maxX = 0, maxY = 0;
  for (const n of nodes.values()) {
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  return { w: maxX + DIM.PADDING, h: maxY + DIM.PADDING };
}
