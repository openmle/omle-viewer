import React, { useState } from 'react';
import { scalarValue } from '@openmle/omle.js';
import { useApp } from '../App.tsx';
import type { Selection } from '../state.ts';
import { NodeView } from './views/NodeView.tsx';
import { InputOutputView } from './views/InputOutputView.tsx';
import { FeatureView } from './views/FeatureView.tsx';
import { JsonView } from './shared/JsonView.tsx';

function InspectorHeader() {
  const { state, dispatch } = useApp();
  const { selectionHistory, selectionCursor } = state;
  const canBack = selectionCursor > 0;
  const canFwd = selectionCursor < selectionHistory.length - 1;
  return (
    <div style={styles.panelTitle}>
      <span>Inspector</span>
      <div style={styles.navBtns}>
        <button
          style={{ ...styles.navBtn, opacity: canBack ? 1 : 0.35 }}
          disabled={!canBack}
          onClick={() => dispatch({ type: 'SELECTION_BACK' })}
          title="Back"
        >←</button>
        <button
          style={{ ...styles.navBtn, opacity: canFwd ? 1 : 0.35 }}
          disabled={!canFwd}
          onClick={() => dispatch({ type: 'SELECTION_FORWARD' })}
          title="Forward"
        >→</button>
      </div>
    </div>
  );
}

export function Inspector() {
  const { state } = useApp();
  const { model, selection, validation: _validation, navHistory, navCursor } = state;
  const currentView = navHistory[navCursor]?.view ?? { kind: 'top_graph' };

  if (!model) {
    return (
      <div style={styles.root}>
        <InspectorHeader />
        <div style={styles.empty}>No model loaded</div>
      </div>
    );
  }

  if (currentView.kind === 'tree') {
    const node = model.nodes?.find(n => n.name === currentView.ensembleName);
    const tree = node?.tree_ensemble?.trees?.[currentView.treeIndex] ?? (currentView.treeIndex === 0 ? node?.tree : undefined);
    const ensemble = node?.tree_ensemble;
    return (
      <div style={styles.root}>
        <InspectorHeader />
        <TreeInfoPanel
          ensembleName={currentView.ensembleName}
          treeIndex={currentView.treeIndex}
          tree={tree ?? null}
          ensemble={ensemble ?? null}
        />
      </div>
    );
  }

  // These views manage their own layout (flex column, height 100%),
  // so render them as direct flex children of root.
  if (selection?.kind === 'node') {
    const node = findNodeAtPath(model.nodes ?? [], selection.compositePath ?? [], selection.id);
    return (
      <div style={styles.root}>
        <InspectorHeader />
        {node
          ? <NodeView node={node} />
          : <div style={styles.content}><div style={styles.notFound}>Node not found</div></div>
        }
      </div>
    );
  }

  if (selection?.kind === 'input') {
    if (selection.compositePath?.length) {
      const cp = selection.compositePath;
      const compositeNode = findNodeAtPath(model.nodes ?? [], cp.slice(0, -1), cp[cp.length - 1]);
      const alias = compositeNode?.composite?.input_aliases?.find(a => a.to_name === selection.id);
      const spec: import('@openmle/omle.js').InputSpec = { name: selection.id };
      return (
        <div style={styles.root}>
          <InspectorHeader />
          <InputOutputView spec={spec} kind="input" features={[]} />
          {alias && (
            <div style={styles.content}>
              <Section label="Input Alias">
                <Row k="External name" v={alias.from_name} mono />
                <Row k="Internal name" v={alias.to_name} mono />
              </Section>
            </div>
          )}
        </div>
      );
    }
    const inp = model.inputs?.find(i => i.name === selection.id);
    const features = (model.model_schema?.features ?? []).filter(f =>
      f.source === inp?.name ||
      (!f.source && f.name === inp?.name) ||
      (f.range?.prefix === inp?.name),
    );
    return (
      <div style={styles.root}>
        <InspectorHeader />
        {inp
          ? <InputOutputView spec={inp} kind="input" features={features} />
          : <div style={styles.content}><div style={styles.notFound}>Input not found</div></div>
        }
      </div>
    );
  }

  if (selection?.kind === 'output') {
    if (selection.compositePath?.length) {
      const cp = selection.compositePath;
      const compositeNode = findNodeAtPath(model.nodes ?? [], cp.slice(0, -1), cp[cp.length - 1]);
      // selection.id is the internal (from_name); look up alias to find external (to_name)
      const alias = compositeNode?.composite?.output_aliases?.find(a => a.from_name === selection.id);
      const externalName = alias?.to_name ?? selection.id;
      const out = compositeNode?.outputs?.find(o => o.name === externalName);
      return (
        <div style={styles.root}>
          <InspectorHeader />
          {out
            ? (
              <>
                <InputOutputView spec={out as import('@openmle/omle.js').OutputSpec} kind="output" features={[]} />
                {alias && (
                  <div style={styles.content}>
                    <Section label="Output Alias">
                      <Row k="Internal name" v={alias.from_name} mono />
                      <Row k="External name" v={alias.to_name} mono />
                    </Section>
                  </div>
                )}
              </>
            )
            : <div style={styles.content}><div style={styles.notFound}>Output not found</div></div>
          }
        </div>
      );
    }
    const out = model.outputs?.find(o => o.name === selection.id);
    return (
      <div style={styles.root}>
        <InspectorHeader />
        {out
          ? <InputOutputView spec={out} kind="output" features={[]} />
          : <div style={styles.content}><div style={styles.notFound}>Output not found</div></div>
        }
      </div>
    );
  }

  if (selection?.kind === 'target') {
    const target = model.model_schema?.targets?.find(t => t.name === selection.id);
    return (
      <div style={styles.root}>
        <InspectorHeader />
        {target
          ? <TargetView target={target} />
          : <div style={styles.content}><div style={styles.notFound}>Target not found</div></div>
        }
      </div>
    );
  }

  if (selection?.kind === 'feature') {
    const feat = selection.index !== undefined
      ? model.model_schema?.features?.[selection.index]
      : model.model_schema?.features?.find((f, i) => (f.name ?? String(i)) === selection.id);
    // When a range feature is selected via an expanded column name, pass displayName
    const displayName = feat?.range && selection.id !== feat.name ? selection.id : undefined;
    return (
      <div style={styles.root}>
        <InspectorHeader />
        {feat
          ? <FeatureView feature={feat} displayName={displayName} />
          : <div style={styles.content}><div style={styles.notFound}>Feature not found</div></div>
        }
      </div>
    );
  }

  if (!selection || selection.kind === 'overview') {
    return (
      <div style={styles.root}>
        <InspectorHeader />
        <ViewShell
          icon="📋"
          title={model.metadata?.name ?? 'Overview'}
          badge={state.fileSize != null ? formatBytes(state.fileSize) + (state.fileSizeEstimated ? ' est.' : '') : undefined}
        >
          <ModelSummaryBody />
        </ViewShell>
      </div>
    );
  }

  if (selection.kind === 'tensor') {
    const entry = model.tensor_entries?.find(t => t.id === selection.id);
    if (!entry) return <div style={styles.root}><div style={styles.panelTitle}>Inspector</div><div style={styles.empty}>Tensor not found</div></div>;
    const t = entry.dense;
    const s = entry.sparse;
    return (
      <div style={styles.root}>
        <InspectorHeader />
        <ViewShell icon="▦" title={entry.id} mono badge={(() => { const shape = t?.type?.shape ?? s?.type?.shape; return shape && shape.length > 0 ? `${shape.length}D` : undefined; })()}>
          <Section label="Tensor">
            {t && (
              <>
                {t.name && <Row k="Name" v={t.name} />}
                <Row k="dtype" v={t.type?.dtype ?? '—'} mono />
                <Row k="shape" v={shapeStr(t.type?.shape ?? [])} mono />
                <Row k="Elements" v={String(countElements(t))} />
                <Row k="Kind" v="Dense" />
              </>
            )}
            {s && (
              <>
                <Row k="dtype" v={s.type?.dtype ?? '—'} mono />
                <Row k="shape" v={shapeStr(s.type?.shape ?? [])} mono />
                <Row k="NNZ" v={String(s.csr?.indices?.length ?? 0)} />
                <Row k="Kind" v="Sparse (CSR)" />
              </>
            )}
          </Section>
          <UsedBySection tensorId={entry.id} />
          <Section label="Raw">
            <JsonView value={t ?? s ?? entry} />
          </Section>
        </ViewShell>
      </div>
    );
  }

  if (selection.kind === 'verification') {
    const idx = selection.index ?? parseInt(selection.id, 10);
    const vc = model.verification?.cases?.[idx];
    if (!vc) return <div style={styles.root}><div style={styles.panelTitle}>Inspector</div><div style={styles.empty}>Case not found</div></div>;
    const tol = model.verification?.tolerance;
    return (
      <div style={styles.root}>
        <InspectorHeader />
        <ViewShell icon="✓" title={vc.description ?? `Case ${idx}`}>
          {tol && (
            <Section label="Tolerance">
              {tol.atol != null && <Row k="atol" v={String(scalarValue(tol.atol) ?? '—')} mono />}
              {tol.rtol != null && <Row k="rtol" v={String(scalarValue(tol.rtol) ?? '—')} mono />}
            </Section>
          )}
          {(vc.inputs?.length ?? 0) > 0 && (
            <Section label={`Inputs (${vc.inputs!.length})`}>
              {vc.inputs!.map((ref, i) => (
                <TensorRefRow key={i} ref_={ref} tensors={model.tensor_entries ?? []} />
              ))}
            </Section>
          )}
          {(vc.expected_outputs?.length ?? 0) > 0 && (
            <Section label={`Expected Outputs (${vc.expected_outputs!.length})`}>
              {vc.expected_outputs!.map((ref, i) => (
                <TensorRefRow key={i} ref_={ref} tensors={model.tensor_entries ?? []} />
              ))}
            </Section>
          )}
        </ViewShell>
      </div>
    );
  }

  if (selection.kind === 'warmup') {
    const idx = selection.index ?? parseInt(selection.id, 10);
    const wc = model.warmup?.cases?.[idx];
    if (!wc) return <div style={styles.root}><div style={styles.panelTitle}>Inspector</div><div style={styles.empty}>Case not found</div></div>;
    return (
      <div style={styles.root}>
        <InspectorHeader />
        <ViewShell icon="⚡" title={wc.description ?? `Case ${idx}`}>
          {wc.repeat != null && (
            <Section label="Settings">
              <Row k="Repeat" v={String(wc.repeat)} mono />
            </Section>
          )}
          {(wc.inputs?.length ?? 0) > 0 && (
            <Section label={`Inputs (${wc.inputs!.length})`}>
              {wc.inputs!.map((ref, i) => (
                <TensorRefRow key={i} ref_={ref} tensors={model.tensor_entries ?? []} />
              ))}
            </Section>
          )}
        </ViewShell>
      </div>
    );
  }

  if (selection.kind === 'sample_input') {
    const idx = selection.index ?? parseInt(selection.id, 10);
    const sc = model.sample_inputs?.cases?.[idx];
    if (!sc) return <div style={styles.root}><div style={styles.panelTitle}>Inspector</div><div style={styles.empty}>Case not found</div></div>;
    return (
      <div style={styles.root}>
        <InspectorHeader />
        <ViewShell icon="▶" title={sc.description ?? `Case ${idx}`}>
          {(sc.inputs?.length ?? 0) > 0 && (
            <Section label={`Inputs (${sc.inputs!.length})`}>
              {sc.inputs!.map((ref, i) => (
                <TensorRefRow key={i} ref_={ref} tensors={model.tensor_entries ?? []} />
              ))}
            </Section>
          )}
        </ViewShell>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.panelTitle}>Inspector</div>
      <div style={styles.content}>
        <SelectionDetails selection={selection} />
      </div>
    </div>
  );
}

// ── Shared view shell ─────────────────────────────────────────────────────────

function ViewShell({ icon, title, mono = false, badge, children }: {
  icon: React.ReactNode; title: string; mono?: boolean; badge?: string; children: React.ReactNode;
}) {
  return (
    <div style={styles.viewShell}>
      <div style={styles.viewHeader}>
        <span style={styles.viewHeaderIcon}>{icon}</span>
        <span style={{ ...styles.viewHeaderTitle, ...(mono ? styles.mono : {}) }}>{title}</span>
        {badge && <span style={styles.viewHeaderBadge}>{badge}</span>}
      </div>
      <div style={styles.viewBody}>{children}</div>
    </div>
  );
}

// ── Overview (model summary) ──────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function ModelSummaryBody() {
  const { state } = useApp();
  const { model, validation } = state;
  if (!model) return null;

  const opImports = model.operator_imports ?? [];
  const fnImports = model.function_imports ?? [];
  const allImports = [
    ...opImports.map(i => ({ ...i, kind: 'op' as const })),
    ...fnImports.map(i => ({ ...i, kind: 'fn' as const })),
  ];

  return (
    <div>
      <Section label="Model">
        {model.metadata?.version && <Row k="Version" v={model.metadata.version} />}
        <Row k="Format" v={model.metadata?.format_version ?? '—'} />
        {model.metadata?.timestamp && <Row k="Timestamp" v={model.metadata.timestamp} />}
        {model.metadata?.producer && <Row k="Producer" v={`${model.metadata.producer}${model.metadata.producer_version ? ` ${model.metadata.producer_version}` : ''}`} />}
        {(model.metadata?.source_frameworks?.length ?? 0) > 0 && model.metadata!.source_frameworks!.map((sf, i) => (
          <Row key={i} k="Framework" v={`${sf.name ?? ''}${sf.version ? ` ${sf.version}` : ''}${sf.role ? ` (${sf.role})` : ''}`} />
        ))}
        <Row k="Nodes" v={String(model.nodes?.length ?? 0)} />
        <Row k="Tensors" v={String(model.tensor_entries?.length ?? 0)} />
      </Section>
      {allImports.length > 0 && (
        <Section label="Imports">
          <div style={styles.importList}>
            {allImports.map((imp, i) => (
              <div key={i} style={styles.importRow}>
                <span style={styles.importKind}>{imp.kind === 'op' ? 'op' : 'fn'}</span>
                <span style={styles.importNs}>{imp.namespace}</span>
                {imp.version && <span style={styles.importVer}>{imp.version}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {validation && (
        <Section label="Validation">
          <div style={validation.valid ? styles.valid : styles.invalid}>
            {validation.valid ? '✓ Valid' : `✗ ${validation.errors.length} error(s)`}
          </div>
          {validation.warnings.length > 0 && (
            <div style={styles.warn}>{validation.warnings.length} warning(s)</div>
          )}
        </Section>
      )}
    </div>
  );
}

function SelectionDetails({ selection }: { selection: Selection }) {
  const { state } = useApp();
  const { model } = state;
  if (!model) return null;

  if (selection.kind === 'function') {
    const fn = model.functions?.find(f => f.name === selection.id);
    if (!fn) return <div style={styles.notFound}>Function not found</div>;
    return (
      <Section label="Function">
        <Row k="Name" v={fn.name} mono />
        <Row k="Params" v={String(fn.parameters?.length ?? 0)} />
        <Row k="Return" v={fn.result_data_type ?? '—'} />
      </Section>
    );
  }

  return null;
}

// ── Tree info panel ───────────────────────────────────────────────────────────

import type { Tree, TreeEnsemble } from '@openmle/omle.js';

function TreeInfoPanel({ ensembleName, treeIndex, tree, ensemble }: {
  ensembleName: string;
  treeIndex: number;
  tree: Tree | null;
  ensemble: TreeEnsemble | null;
}) {
  const [tab, setTab] = useState<'summary' | 'raw'>('summary');
  const nodeCount = tree?.num_nodes ?? tree?.node_kind?.length ?? 0;
  const leafWidth = tree?.leaf_width ?? 1;

  return (
    <div style={styles.viewShell}>
      <div style={styles.viewHeader}>
        <span style={styles.viewHeaderIcon}>🌿</span>
        <span style={styles.viewHeaderTitle}>{ensemble ? `Tree #${treeIndex}` : 'Tree'}</span>
        {nodeCount > 0 && <span style={styles.viewHeaderBadge}>{nodeCount} nodes</span>}
      </div>
      <TabBar tabs={['summary', 'raw']} active={tab} onChange={t => setTab(t as 'summary' | 'raw')} />
      {tab === 'summary' && (
        <div style={styles.viewBody}>
          <Section label="Tree">
            {ensemble && <Row k="Index" v={String(treeIndex)} />}
            {nodeCount > 0 && <Row k="Nodes" v={String(nodeCount)} />}
            {leafWidth > 1 && <Row k="Leaf width" v={String(leafWidth)} />}
            {tree?.task_type && tree.task_type !== 'TASK_TYPE_UNSPECIFIED' && (
              <Row k="Task" v={tree.task_type} />
            )}
          </Section>
          {ensemble && (
            <Section label="Ensemble">
              <Row k="Node" v={ensembleName} mono />
              <Row k="Total trees" v={String(ensemble.trees?.length ?? 0)} />
              {ensemble.aggregation && ensemble.aggregation !== 'AGGREGATION_UNSPECIFIED' && (
                <Row k="Aggregation" v={ensemble.aggregation} />
              )}
              {ensemble.post_transform && ensemble.post_transform !== 'POST_TRANSFORM_UNSPECIFIED' && (
                <Row k="Post-transform" v={ensemble.post_transform} />
              )}
              {ensemble.tree_group && ensemble.tree_group[treeIndex] !== undefined && (
                <Row k="Class group" v={String(ensemble.tree_group[treeIndex])} />
              )}
              {ensemble.base_score != null && (
                <Row k="Base score" v={String(scalarValue(ensemble.base_score) ?? '—')} mono />
              )}
            </Section>
          )}
        </div>
      )}
      {tab === 'raw' && (
        <div style={styles.viewBody}>
          {tree ? <JsonView value={tree} /> : <div style={styles.empty}>No tree data</div>}
        </div>
      )}
    </div>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={styles.tabBar}>
      {tabs.map(t => (
        <button
          key={t}
          style={{ ...styles.tab, ...(active === t ? styles.tabActive : {}) }}
          onClick={() => onChange(t)}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── Node resolution ───────────────────────────────────────────────────────────

function findNodeAtPath(
  nodes: import('@openmle/omle.js').Node[],
  compositePath: string[],
  name: string,
): import('@openmle/omle.js').Node | undefined {
  let scope = nodes;
  for (const step of compositePath) {
    const parent = scope.find(n => n.name === step);
    if (!parent?.composite?.nodes) return undefined;
    scope = parent.composite.nodes;
  }
  return scope.find(n => n.name === name);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      {children}
    </div>
  );
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowKey}>{k}</span>
      <span style={{ ...styles.rowVal, ...(mono ? styles.mono : {}) }}>{v}</span>
    </div>
  );
}

function shapeStr(shape?: number[]): string {
  if (!shape || shape.length === 0) return 'scalar';
  return `[${shape.map(d => d <= 0 ? 'N' : d).join('×')}]`;
}

function countElements(t: import('@openmle/omle.js').Tensor): number {
  if (t.float32_data) return t.float32_data.length;
  if (t.float64_data) return t.float64_data.length;
  if (t.int32_data) return t.int32_data.length;
  if (t.int64_data) return t.int64_data.length;
  if (t.string_data) return t.string_data.length;
  if (t.bool_data) return t.bool_data.length;
  return 0;
}

// ── Tensor usage scanner ──────────────────────────────────────────────────────

type TensorUsage =
  | { kind: 'verification'; index: number; label: string; role: string }
  | { kind: 'warmup';       index: number; label: string }
  | { kind: 'sample_input'; index: number; label: string }
  | { kind: 'node';         id: string;    label: string };

function hasTensorRef(obj: unknown, id: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some(v => hasTensorRef(v, id));
  const o = obj as Record<string, unknown>;
  if (typeof o['id'] === 'string' && o['id'] === id) return true;
  return Object.values(o).some(v => hasTensorRef(v, id));
}

function findTensorUsages(model: import('@openmle/omle.js').OMLEModel, tensorId: string): TensorUsage[] {
  const usages: TensorUsage[] = [];

  model.verification?.cases?.forEach((c, i) => {
    const inIn = c.inputs?.some(r => r.id === tensorId);
    const inOut = c.expected_outputs?.some(r => r.id === tensorId);
    if (inIn) usages.push({ kind: 'verification', index: i, label: c.description ?? `Case ${i}`, role: 'input' });
    if (inOut) usages.push({ kind: 'verification', index: i, label: c.description ?? `Case ${i}`, role: 'expected output' });
  });

  model.warmup?.cases?.forEach((c, i) => {
    if (c.inputs?.some(r => r.id === tensorId))
      usages.push({ kind: 'warmup', index: i, label: c.description ?? `Case ${i}` });
  });

  model.sample_inputs?.cases?.forEach((c, i) => {
    if (c.inputs?.some(r => r.id === tensorId))
      usages.push({ kind: 'sample_input', index: i, label: c.description ?? `Case ${i}` });
  });

  model.nodes?.forEach(node => {
    if (hasTensorRef(node, tensorId))
      usages.push({ kind: 'node', id: node.name, label: node.name });
  });

  return usages;
}

function UsedBySection({ tensorId }: { tensorId: string }) {
  const { state, dispatch } = useApp();
  const { model } = state;
  if (!model) return null;
  const usages = findTensorUsages(model, tensorId);
  if (usages.length === 0) return null;

  const go = (u: TensorUsage) => {
    if (u.kind === 'node')
      dispatch({ type: 'SET_SELECTION', selection: { kind: 'node', id: u.id } });
    else
      dispatch({ type: 'SET_SELECTION', selection: { kind: u.kind, id: String(u.index), index: u.index } });
  };

  const icon: Record<TensorUsage['kind'], string> = {
    verification: '✓', warmup: '⚡', sample_input: '▶', node: '⚙',
  };

  return (
    <Section label={`References (${usages.length})`}>
      {usages.map((u, i) => (
        <button key={i} style={styles.usageRow} onClick={() => go(u)}>
          <span style={styles.usageIcon}>{icon[u.kind]}</span>
          <span style={styles.usageLabel}>{u.label}</span>
          {'role' in u && <span style={styles.usageRole}>{u.role}</span>}
        </button>
      ))}
    </Section>
  );
}


// ── Verification / warmup / sample helpers ────────────────────────────────────

function TensorRefRow({ ref_, tensors }: {
  ref_: import('@openmle/omle.js').TensorRef;
  tensors: import('@openmle/omle.js').TensorEntry[];
}) {
  const { dispatch } = useApp();
  const entry = tensors.find(te => te.id === ref_.id);
  const t = entry?.dense;
  const s = entry?.sparse;
  const dtype = t?.type?.dtype ?? s?.type?.dtype ?? '—';
  const shape = t?.type?.shape ?? s?.type?.shape ?? [];
  const count = t ? countElements(t) : (s?.csr?.indices?.length ?? 0);
  return (
    <div style={styles.tensorRefRow}>
      <button
        style={styles.tensorRefLink}
        onClick={() => dispatch({ type: 'SET_SELECTION', selection: { kind: 'tensor', id: ref_.id } })}
        title={`Go to tensor ${ref_.id}`}
      >
        <span style={styles.tensorRefLinkIcon}>▦</span>
        {ref_.id}
      </button>
      {entry && (
        <div style={styles.tensorRefMeta}>
          <span style={styles.tensorRefChip}>{dtype}</span>
          <span style={styles.tensorRefShape}>{shapeStr(shape)}</span>
          <span style={styles.tensorRefCount}>{count} elements</span>
        </div>
      )}
      {!entry && <div style={styles.tensorRefMissing}>tensor not found</div>}
    </div>
  );
}

// ── Target view ───────────────────────────────────────────────────────────────

function TargetView({ target }: { target: import('@openmle/omle.js').Target }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 10px', borderBottom: '1px solid var(--t-border)', flexShrink: 0 }}>
        <span style={{ fontSize: 14, color: 'var(--t-text3)' }}>◎</span>
        <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--t-text)' }}>{target.name}</span>
        {target.type?.shape && target.type.shape.length > 0 && (
          <span style={{ fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 10, padding: '2px 8px', color: 'var(--t-text3)', fontFamily: 'monospace' }}>
            {target.type.shape.length}D
          </span>
        )}
        {target.kind && target.kind !== 'TARGET_KIND_UNSPECIFIED' && (
          <span style={{ fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 10, padding: '2px 8px', color: 'var(--t-accent)' }}>
            {target.kind}
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {target.description && <p style={{ color: 'var(--t-text3)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>{target.description}</p>}

        <Section label="Tensor type">
          <Row k="dtype" v={target.type?.dtype ?? '—'} mono />
          {target.type?.shape && (
            <Row k="shape" v={`[${target.type.shape.map((d: number | string) => Number(d) <= 0 ? 'N' : d).join(', ')}]`} mono />
          )}
        </Section>

        {target.measure_level && target.measure_level !== 'MEASURE_LEVEL_UNSPECIFIED' && (
          <Section label="Measure level">
            <Row k="level" v={target.measure_level} />
          </Section>
        )}

        {target.class_labels && target.class_labels.length > 0 && (
          <Section label={`Class labels (${target.class_labels.length})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {target.class_labels.map((lbl, i) => (
                <span key={i} style={{ background: 'var(--t-bg)', border: '1px solid var(--t-frame)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text2)' }}>
                  {String(lbl?.string_value ?? lbl?.double_value ?? lbl?.float_value ?? lbl?.int_value ?? '?')}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section label="Raw">
          <JsonView value={target} />
        </Section>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--t-bg)' },
  panelTitle: {
    display: 'flex', alignItems: 'center',
    padding: '10px 14px 8px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--t-muted)',
    borderBottom: '1px solid var(--t-border)',
    flexShrink: 0,
  },
  navBtns: { display: 'flex', gap: 2, marginLeft: 'auto' },
  navBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--t-text3)', fontSize: 13, padding: '0 4px',
    lineHeight: 1, borderRadius: 3, fontFamily: 'inherit',
  },
  viewShell: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  viewHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 10px', borderBottom: '1px solid var(--t-border)', flexShrink: 0 },
  viewHeaderIcon: { fontSize: 14, color: 'var(--t-text3)', flexShrink: 0 },
  viewHeaderTitle: { fontSize: 14, fontWeight: 700, color: 'var(--t-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  viewHeaderBadge: { fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 10, padding: '2px 8px', color: 'var(--t-text3)', fontFamily: 'monospace', flexShrink: 0 },
  viewBody: { flex: 1, overflowY: 'auto', padding: '16px 20px', borderTop: '1px solid var(--t-border)' },
  tabBar: { display: 'flex', gap: 2, padding: '6px 16px 0', flexShrink: 0 },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', color: 'var(--t-text4)', fontSize: 12, padding: '4px 10px 4px', fontWeight: 500 },
  tabActive: { color: 'var(--t-accent2)', borderBottom: '2px solid var(--t-accent)' },
  content: { flex: 1, overflowY: 'auto', padding: '10px 14px', borderTop: '1px solid var(--t-border)' },
  empty: { padding: 14, color: 'var(--t-muted)', fontSize: 12 },
  notFound: { color: 'var(--t-muted)', fontSize: 12, padding: 14 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 },
  cardLabel: { fontSize: 11, fontWeight: 600, color: 'var(--t-text4)', marginBottom: 8 },
  row: { display: 'flex', gap: 8, marginBottom: 4, fontSize: 12 },
  rowKey: { color: 'var(--t-text4)', width: 64, flexShrink: 0, fontSize: 11 },
  rowVal: { color: 'var(--t-text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  valid: { color: 'var(--t-ok)', fontSize: 12, fontWeight: 600 },
  invalid: { color: 'var(--t-err)', fontSize: 12, fontWeight: 600 },
  warn: { color: 'var(--t-warn)', fontSize: 11, marginTop: 4 },
  importList: { display: 'flex', flexDirection: 'column', gap: 4 },
  importRow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 },
  importKind: { fontFamily: 'monospace', fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', color: 'var(--t-accent)', flexShrink: 0 },
  importNs: { fontFamily: 'monospace', color: 'var(--t-text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  importVer: { color: 'var(--t-muted)', fontSize: 10, flexShrink: 0 },
  usageRow: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const,
    padding: '4px 2px', borderRadius: 4, fontSize: 12, color: 'var(--t-text2)',
  },
  usageIcon: { fontSize: 11, color: 'var(--t-text4)', flexShrink: 0, width: 14, textAlign: 'center' as const },
  usageLabel: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontFamily: 'monospace', fontSize: 11, color: 'var(--t-accent)' },
  usageRole: { fontSize: 10, color: 'var(--t-muted)', flexShrink: 0 },
  tensorRefRow: { marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--t-frame)' },
  tensorRefLink: {
    display: 'flex', alignItems: 'center', gap: 5, width: '100%',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const,
    fontFamily: 'monospace', fontSize: 11, color: 'var(--t-accent)', marginBottom: 3, padding: 0,
  },
  tensorRefLinkIcon: { color: 'var(--t-text4)', fontSize: 10, flexShrink: 0 },
  tensorRefMeta: { display: 'flex', alignItems: 'center', gap: 6 },
  tensorRefChip: { fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', color: 'var(--t-accent)', fontFamily: 'monospace', flexShrink: 0 },
  tensorRefShape: { fontSize: 11, fontFamily: 'monospace', color: 'var(--t-text3)' },
  tensorRefCount: { fontSize: 10, color: 'var(--t-muted)' },
  tensorRefMissing: { fontSize: 10, color: 'var(--t-err)', fontStyle: 'italic' },
};
