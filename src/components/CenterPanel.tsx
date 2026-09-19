import React, { useState, useRef, useCallback } from 'react';
import type { Feature, OMLEModel, Node } from '@openmle/omle.js';
import { useApp } from '../App.tsx';
import { BreadcrumbBar } from './BreadcrumbBar.tsx';
import { GraphCanvas } from './graph/GraphCanvas.tsx';
import { EnsembleViewer } from './views/EnsembleViewer.tsx';
import { TreeViewer } from './views/TreeViewer.tsx';
import { ClusteringDetailViewer } from './views/ClusteringDetailViewer.tsx';
import { LinearDetailViewer } from './views/LinearDetailViewer.tsx';
import { NaiveBayesDetailViewer } from './views/NaiveBayesDetailViewer.tsx';
import { SVMDetailViewer } from './views/SVMDetailViewer.tsx';
import { NeuralNetworkViewer } from './views/NeuralNetworkViewer.tsx';
import { KNNViewer } from './views/KNNViewer.tsx';
import { OMLEIconHtml } from './shared/OMLEIcon.tsx';
import { JsonView } from './shared/JsonView.tsx';
import { tvShape } from './shared/tensorValue.ts';

function buildFeatureNames(features: Feature[]): string[] {
  const names: string[] = [];
  let col = 0;
  for (const f of features) {
    if (f.range) {
      const { prefix, start = 0, end } = f.range;
      const count = end - start;
      for (let k = start; k < end; k++) {
        names[col++] = count === 1 ? prefix : `${prefix}${k}`;
      }
    } else {
      names[col++] = f.name ?? `f${col - 1}`;
    }
  }
  return names;
}

// Build a map from every intermediate tensor name to its producing Node.
function buildProducerMap(model: OMLEModel, excludeName: string): Map<string, Node> {
  const map = new Map<string, Node>();
  for (const n of model.nodes ?? []) {
    if (n.name === excludeName) continue;
    for (const out of n.outputs ?? []) map.set(out.name, n);
  }
  return map;
}

// Infer the column count for a tensor named `tensorName` that is produced by
// `producingNode`.  Returns 0 if the count cannot be determined.
// `producers` is the full producer map, used to recurse through Concat nodes.
function inferColCount(
  tensorName: string,
  producingNode: Node,
  producers: Map<string, Node>,
  schemaColCount: number,
  depth = 0,
): number {
  if (depth > 10) return 0;  // guard against cycles

  // 1. Output type shape on the NodeOutput (rarely populated by converters)
  const outSpec = (producingNode.outputs ?? []).find(o => o.name === tensorName);
  const shape = outSpec?.type?.shape ?? [];
  if (shape.length >= 2) {
    const k = Number(shape[shape.length - 1]);
    if (k > 0) return k;
  }

  // 2. 1-D parameter attribute tensors (mean, scale, data_min, …)
  for (const attr of producingNode.attributes ?? []) {
    const t = attr.tensor;
    if (!t) continue;
    const attrShape = t.type?.shape ?? [];
    if (attrShape.length === 1 && Number(attrShape[0]) > 1) return Number(attrShape[0]);
    const len =
      (t.float64_data as number[] | undefined)?.length ??
      (t.float32_data as number[] | undefined)?.length ??
      (t.int64_data   as number[] | undefined)?.length ??
      (t.int32_data   as number[] | undefined)?.length ?? 0;
    if (len > 1) return len;
  }

  // 3. Concat / pass-through: sum up the column counts of each of the node's inputs
  if (producingNode.op === 'Concat' || producingNode.op === 'TakeSlots') {
    let total = 0;
    for (const inp of producingNode.inputs ?? []) {
      const inpNames: string[] = inp.name
        ? [inp.name.value]
        : inp.range
        ? (() => {
            const { prefix, start = 0, end, width = 0 } = inp.range!;
            return Array.from({ length: end - start }, (_, i) =>
              `${prefix}${width > 0 ? String(start + i).padStart(width, '0') : start + i}`);
          })()
        : [];
      for (const n of inpNames) {
        const p = producers.get(n);
        total += p ? inferColCount(n, p, producers, schemaColCount, depth + 1) : schemaColCount;
      }
    }
    return total;
  }

  return 0;
}

// Infer the expected number of input columns from the node's own parameter tensors
// (e.g. coefficient shape for Linear). Returns 0 if not determinable.
function inferNodeExpectedInputCols(model: OMLEModel, node: Node): number {
  if (node.linear) {
    const shape = tvShape(node.linear.coefficients, model);
    if (shape.length >= 2) return shape[1];
    if (shape.length === 1) return shape[0];
  }
  if (node.neural_network) {
    const firstLayer = node.neural_network.layers?.[0];
    const shape = tvShape(firstLayer?.weights, model);
    if (shape.length >= 2) return shape[1];
  }
  if (node.tree_ensemble || node.tree) {
    const trees = node.tree_ensemble?.trees ?? (node.tree ? [node.tree] : []);
    let maxFeat = -1;
    for (const tree of trees) {
      for (const f of tree.split_feature ?? []) {
        if (f > maxFeat) maxFeat = f;
      }
    }
    if (maxFeat >= 0) return maxFeat + 1;
  }
  return 0;
}

function expandInputNames(inp: import('@openmle/omle.js').NodeInput): string[] {
  if (inp.name) return [inp.name.value];
  if (inp.range) {
    const { prefix, start = 0, end, width = 0 } = inp.range;
    return Array.from({ length: end - start }, (_, i) =>
      `${prefix}${width > 0 ? String(start + i).padStart(width, '0') : start + i}`);
  }
  return [];
}

// Feature display context returned by resolveFeatureContext.
// - names: bare labels for column/row display
// - tooltips: fully-qualified labels for hover (may equal names)
// - inputLabel: the single intermediate tensor name that feeds this node,
//   or null when the input is the raw model input (no qualification needed)
export interface FeatureContext {
  names: string[];
  tooltips: string[];
  inputLabel: string | null;
}

// Returns FeatureContext for the node's flattened input slot space.
// - Raw model inputs → schema feature names, no inputLabel
// - Single intermediate tensor with explicit field_names → bare names + tooltip qualified with tensor name
// - Single intermediate tensor without field_names → "{tensor}0/1/…" names (already encode source)
// - Multiple intermediate tensors → names encode source per-tensor, no inputLabel
function resolveFeatureContext(model: OMLEModel, node: Node): FeatureContext {
  const producers = buildProducerMap(model, node.name);
  const schemaNames = buildFeatureNames(model.model_schema?.features ?? []);

  let intermediateCount = 0;
  let singleIntermediateName: string | null = null;
  for (const inp of node.inputs ?? []) {
    for (const name of expandInputNames(inp)) {
      if (producers.has(name)) {
        intermediateCount++;
        singleIntermediateName = name;
      }
    }
  }
  const singleFallbackCols = intermediateCount === 1
    ? inferNodeExpectedInputCols(model, node)
    : 0;

  const names: string[] = [];
  const qualify: boolean[] = [];  // parallel to names: true → qualify tooltip with inputLabel

  for (const inp of node.inputs ?? []) {
    for (const name of expandInputNames(inp)) {
      const producingNode = producers.get(name);
      if (!producingNode) {
        if (schemaNames.length > 0) {
          names.push(...schemaNames);
          schemaNames.forEach(() => qualify.push(false));
        } else {
          // No schema — derive names from the raw input tensor name + column index
          const colCount = inferNodeExpectedInputCols(model, node);
          if (colCount > 1) {
            for (let i = 0; i < colCount; i++) { names.push(`${name}${i}`); qualify.push(false); }
          } else {
            names.push(name);
            qualify.push(false);
          }
        }
        continue;
      }

      const outSpec = (producingNode.outputs ?? []).find(o => o.name === name);
      if (outSpec?.field_names && outSpec.field_names.length > 0) {
        for (const fieldName of outSpec.field_names) {
          const fieldProducer = producers.get(fieldName);
          const colCount = fieldProducer
            ? inferColCount(fieldName, fieldProducer, producers, schemaNames.length)
            : 1;  // raw model input → scalar / 1-column
          if (colCount > 1) {
            for (let i = 0; i < colCount; i++) { names.push(`${fieldName}${i}`); qualify.push(false); }
          } else {
            names.push(fieldName);
            qualify.push(true);
          }
        }
        continue;
      }

      let colCount = inferColCount(name, producingNode, producers, schemaNames.length);
      if (colCount === 0) colCount = singleFallbackCols;
      if (colCount > 1) {
        for (let i = 0; i < colCount; i++) { names.push(`${name}${i}`); qualify.push(false); }
      } else {
        names.push(name);
        qualify.push(false);
      }
    }
  }

  const inputLabel = intermediateCount === 1 ? singleIntermediateName : null;
  const tooltips = names.map((n, i) =>
    qualify[i] && inputLabel ? `${inputLabel}.${n}` : n,
  );

  return { names, tooltips, inputLabel };
}

export function CenterPanel() {
  const { state, loadFile } = useApp();
  const { model, navHistory, navCursor } = state;
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  if (!model) {
    return showJsonEditor
      ? <JsonEditorPanel onClose={() => setShowJsonEditor(false)} />
      : <DropTarget onFile={loadFile} onOpenJson={() => setShowJsonEditor(true)} />;
  }

  const currentView = navHistory[navCursor]?.view ?? { kind: 'top_graph' };
  const isGraphView = currentView.kind === 'top_graph' || currentView.kind === 'composite';

  // Resolve detail view for non-graph nav entries
  let detailView: React.ReactNode = null;
  switch (currentView.kind) {
    case 'tree_ensemble': {
      const node = model.nodes?.find(n => n.name === currentView.nodeName);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = node?.tree_ensemble
        ? <EnsembleViewer nodeName={currentView.nodeName} ensemble={node.tree_ensemble} featureNames={ctx.names} inputLabel={ctx.inputLabel} />
        : <ErrorView msg={`Node "${currentView.nodeName}" not found`} />;
      break;
    }
    case 'tree': {
      const node = model.nodes?.find(n => n.name === currentView.ensembleName);
      const tree = node?.tree_ensemble?.trees?.[currentView.treeIndex] ?? (currentView.treeIndex === 0 ? node?.tree : undefined);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = tree
        ? <TreeViewer ensembleName={currentView.ensembleName} treeIndex={currentView.treeIndex} tree={tree} ensemble={node?.tree_ensemble ?? undefined} featureNames={ctx.names} inputLabel={ctx.inputLabel} standalone={Boolean(node?.tree && !node?.tree_ensemble)} />
        : <ErrorView msg={`Tree ${currentView.treeIndex} not found in "${currentView.ensembleName}"`} />;
      break;
    }
    case 'clustering': {
      const node = model.nodes?.find(n => n.name === currentView.nodeName);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = node?.clustering
        ? <ClusteringDetailViewer nodeName={currentView.nodeName} clustering={node.clustering} featureNames={ctx.names} featureTooltips={ctx.tooltips} inputLabel={ctx.inputLabel} />
        : <ErrorView msg={`Node "${currentView.nodeName}" not found`} />;
      break;
    }
    case 'linear': {
      const node = model.nodes?.find(n => n.name === currentView.nodeName);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = node?.linear
        ? <LinearDetailViewer nodeName={currentView.nodeName} linear={node.linear} featureNames={ctx.names} featureTooltips={ctx.tooltips} inputLabel={ctx.inputLabel} />
        : <ErrorView msg={`Node "${currentView.nodeName}" not found`} />;
      break;
    }
    case 'naive_bayes': {
      const node = model.nodes?.find(n => n.name === currentView.nodeName);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = node?.naive_bayes
        ? <NaiveBayesDetailViewer nodeName={currentView.nodeName} nb={node.naive_bayes} featureNames={ctx.names} featureTooltips={ctx.tooltips} inputLabel={ctx.inputLabel} />
        : <ErrorView msg={`Node "${currentView.nodeName}" not found`} />;
      break;
    }
    case 'svm': {
      const node = model.nodes?.find(n => n.name === currentView.nodeName);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = node?.svm
        ? <SVMDetailViewer nodeName={currentView.nodeName} svm={node.svm} featureNames={ctx.names} featureTooltips={ctx.tooltips} inputLabel={ctx.inputLabel} />
        : <ErrorView msg={`Node "${currentView.nodeName}" not found`} />;
      break;
    }
    case 'neural_network': {
      const node = model.nodes?.find(n => n.name === currentView.nodeName);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = node?.neural_network
        ? <NeuralNetworkViewer nodeName={currentView.nodeName} nn={node.neural_network} featureNames={ctx.names} featureTooltips={ctx.tooltips} inputLabel={ctx.inputLabel} />
        : <ErrorView msg={`Node "${currentView.nodeName}" not found`} />;
      break;
    }
    case 'knn': {
      const node = model.nodes?.find(n => n.name === currentView.nodeName);
      const ctx = node ? resolveFeatureContext(model, node) : { names: [], tooltips: [], inputLabel: null };
      detailView = node
        ? <KNNViewer node={node} featureNames={ctx.names} featureTooltips={ctx.tooltips} inputLabel={ctx.inputLabel} />
        : <ErrorView msg={`Node "${currentView.nodeName}" not found`} />;
      break;
    }
  }

  const graphVisible = isGraphView && !showJsonEditor;

  return (
    <div style={styles.root}>
      {/* Hide breadcrumb when JSON editor is open (editor has its own header) */}
      {!showJsonEditor && <BreadcrumbBar onOpenJsonEditor={() => setShowJsonEditor(true)} />}
      <div style={styles.canvas}>
        {/* Always keep GraphCanvas mounted so pan/zoom/positions survive all navigation */}
        <div style={{ position: 'absolute', inset: 0, visibility: graphVisible ? 'visible' : 'hidden', pointerEvents: graphVisible ? 'auto' : 'none' }}>
          <GraphCanvas />
        </div>
        {!isGraphView && !showJsonEditor && (
          <div style={{ position: 'absolute', inset: 0 }}>
            {detailView}
          </div>
        )}
        {showJsonEditor && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <JsonEditorPanel onClose={() => setShowJsonEditor(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drop target (no model loaded) ────────────────────────────────────────────

function DropTarget({ onFile, onOpenJson }: { onFile: (f: File) => void; onOpenJson: () => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{ ...styles.empty, borderColor: dragging ? 'var(--t-accent)' : 'var(--t-border)' }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,.omle"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <div style={styles.emptyIcon}><OMLEIconHtml size={64} /></div>
      <div style={styles.emptyTitle}>OMLE Viewer</div>
      <div style={styles.emptyDesc}>Drop an OMLE model file here to inspect and debug your model</div>
      <div style={styles.emptyHint}>Supports .json and .omle files</div>

      <div style={styles.divider}>
        <span style={styles.dividerLine} />
        <span style={styles.dividerText}>or</span>
        <span style={styles.dividerLine} />
      </div>

      <button
        style={styles.jsonBtn}
        onClick={e => { e.stopPropagation(); onOpenJson(); }}
      >
        <span style={styles.jsonBtnIcon}>{'{ }'}</span>
        Paste JSON
      </button>
    </div>
  );
}

// ── JSON editor panel ─────────────────────────────────────────────────────────

function JsonEditorPanel({ onClose }: { onClose: () => void }) {
  const { loadJson, state } = useApp();
  const [text, setText] = useState(() =>
    state.model ? JSON.stringify(state.model, null, 2) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>(state.model ? 'view' : 'edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleLoad = useCallback(() => {
    setError(null);
    const err = loadJson(text);
    if (err) { setError(err); } else { onClose(); }
  }, [loadJson, text, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = textareaRef.current!;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = text.slice(0, start) + '  ' + text.slice(end);
      setText(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleLoad();
  }, [text, handleLoad]);

  const isView = mode === 'view' && !!state.model;

  return (
    <div style={styles.editorRoot}>
      <div style={styles.editorHeader}>
        <span style={styles.editorTitle}>JSON editor</span>
        <div style={{ flex: 1 }} />

        {state.model && (
          <div style={styles.modeTabs}>
            <button
              style={{ ...styles.modeTab, ...(isView ? styles.modeTabActive : {}) }}
              onClick={() => setMode('view')}
            >
              View
            </button>
            <button
              style={{ ...styles.modeTab, ...(!isView ? styles.modeTabActive : {}) }}
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
          </div>
        )}

        {!isView && <span style={styles.editorHint}>⌘↩ to load</span>}
        <div style={styles.editorActions}>
          {!isView && (
            <button style={{ ...styles.editorBtn, ...styles.editorBtnPrimary }} onClick={handleLoad}>
              Load model
            </button>
          )}
          <button style={styles.editorBtn} onClick={onClose}>Close</button>
        </div>
      </div>

      {!isView && error && (
        <div style={styles.editorError}>
          <span style={styles.editorErrorIcon}>✕</span>
          {error}
        </div>
      )}

      {isView ? (
        <div style={styles.editorViewPane}>
          <JsonView value={state.model} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          style={styles.editorTextarea}
          value={text}
          onChange={e => { setText(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder={'{\n  "metadata": { "name": "my-model" },\n  "nodes": [],\n  ...\n}'}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ErrorView({ msg }: { msg: string }) {
  return <div style={styles.error}>{msg}</div>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  canvas: { flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' },
  error: { padding: 24, color: 'var(--t-err)', fontSize: 13 },

  // Welcome screen
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: 12, border: '1.5px dashed', margin: 24, borderRadius: 12,
    cursor: 'pointer', transition: 'border-color 0.15s',
  },
  emptyIcon: { fontSize: 48, lineHeight: 1 },
  emptyTitle: { fontSize: 18, fontWeight: 600, color: 'var(--t-accent)' },
  emptyDesc: { fontSize: 13, color: 'var(--t-text4)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 },
  emptyHint: { fontSize: 11, color: 'var(--t-muted)', marginTop: 4 },
  divider: { display: 'flex', alignItems: 'center', gap: 10, width: '60%', maxWidth: 280, margin: '4px 0' },
  dividerLine: { flex: 1, height: 1, background: 'var(--t-border)' },
  dividerText: { fontSize: 11, color: 'var(--t-muted)' },
  jsonBtn: {
    display: 'flex', alignItems: 'center', gap: 7, marginTop: 12,
    background: 'var(--t-surface)', border: '1px solid var(--t-frame)',
    borderRadius: 7, padding: '7px 16px', cursor: 'pointer',
    fontSize: 12, color: 'var(--t-text3)', fontFamily: 'inherit',
  },
  jsonBtnIcon: { fontFamily: 'monospace', fontSize: 12, color: 'var(--t-accent)', fontWeight: 600 },

  // JSON editor
  editorRoot: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--t-bg)' },
  editorHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 14px', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
  },
  editorTitle: { fontSize: 13, fontWeight: 600, color: 'var(--t-text)' },
  editorHint: { fontSize: 11, color: 'var(--t-muted)' },
  editorActions: { display: 'flex', gap: 6 },
  editorBtn: {
    background: 'var(--t-surface)', border: '1px solid var(--t-frame)',
    borderRadius: 5, padding: '4px 12px', cursor: 'pointer',
    fontSize: 12, color: 'var(--t-text2)', fontFamily: 'inherit',
  },
  editorBtnPrimary: {
    background: 'var(--t-accent)', border: '1px solid var(--t-accent)',
    color: '#fff',
  },
  editorError: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '8px 14px', background: 'var(--t-err-bg)',
    borderBottom: '1px solid var(--t-node-err-b)',
    fontSize: 12, color: 'var(--t-err)', fontFamily: 'monospace',
    flexShrink: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  },
  editorErrorIcon: { flexShrink: 0, fontFamily: 'sans-serif' },
  editorTextarea: {
    flex: 1, resize: 'none', border: 'none', outline: 'none',
    padding: '14px 16px',
    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: 12, lineHeight: 1.6,
    color: 'var(--t-text2)', background: 'var(--t-canvas)',
    overflowY: 'auto',
  },
  editorViewPane: {
    flex: 1, overflowY: 'auto', padding: 14,
    background: 'var(--t-canvas)',
  },
  modeTabs: {
    display: 'flex', gap: 2,
    background: 'var(--t-surface)',
    border: '1px solid var(--t-frame)',
    borderRadius: 6,
    padding: 2,
  },
  modeTab: {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '3px 10px', borderRadius: 4,
    fontSize: 12, color: 'var(--t-text3)', fontFamily: 'inherit',
  },
  modeTabActive: {
    background: 'var(--t-active)', color: 'var(--t-text)',
  },
};
