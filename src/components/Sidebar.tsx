import React, { useState, useMemo } from 'react';

declare const __APP_VERSION__: string;
import type { Feature, InputSpec } from '@openmle/omle.js';
import { useApp } from '../App.tsx';
import { useTheme } from '../ThemeContext.tsx';
import type { Selection } from '../state.ts';
import { OMLEIconHtml, TreeEnsembleIconHtml, NeuralNetworkIconHtml } from './shared/OMLEIcon.tsx';

const EMPTY_INPUTS: InputSpec[] = [];
const EMPTY_FEATURES: Feature[] = [];

export function Sidebar() {
  const { state, dispatch, loadFile } = useApp();
  const { model, fileName, selection } = state;
  const { theme, toggleTheme } = useTheme();

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const select = (sel: Selection) => dispatch({ type: 'SET_SELECTION', selection: sel });

  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(new Set());
  const toggleInputExpand = (name: string) => setExpandedInputs(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const inputs = model?.inputs ?? EMPTY_INPUTS;
  const allFeatures = model?.model_schema?.features ?? EMPTY_FEATURES;
  const { byInput: featuresByInput, orphans: orphanFeatures } = useMemo(
    () => groupFeaturesByInput(inputs, allFeatures),
    [inputs, allFeatures],
  );

  if (!model) {
    return (
      <div style={styles.root}>
        <div style={styles.header}>
          <OMLEIconHtml size={18} />
          <span style={styles.headerLabel}>
            OMLE Viewer
            <span style={styles.version}>v{__APP_VERSION__}</span>
          </span>
          <button style={styles.themeBtn} onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={styles.sidebarFooter}>
          <label style={styles.openBtn}>
            Open file…
            <input
              type="file"
              accept=".json,.omle"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </label>
        </div>
      </div>
    );
  }

  const isSelected = (kind: string, id: string) =>
    selection?.kind === kind && selection.id === id;

  return (
    <div style={styles.root}>
      {/* Header with file name */}
      <div style={styles.header}>
        <OMLEIconHtml size={18} />
        <span style={styles.headerLabel}>
          OMLE Viewer
          <span style={styles.version}>v{__APP_VERSION__}</span>
        </span>
        <button style={styles.themeBtn} onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>

      <div style={styles.fileBar}>
        <span style={styles.fileName} title={fileName ?? ''}>
          {fileName ?? 'model'}
        </span>
        <button
          style={styles.clearBtn}
          onClick={() => dispatch({ type: 'CLEAR_MODEL' })}
          title="Close model"
        >×</button>
      </div>

      <nav style={styles.nav}>
        {/* Overview */}
        <NavItem
          label="Overview"
          icon="📋"
          active={isSelected('overview', 'overview')}
          onClick={() => select({ kind: 'overview', id: 'overview' })}
        />

        {/* Inputs — with features nested beneath each one */}
        {(model.inputs?.length ?? 0) > 0 && (
          <NavSection label="Inputs" count={model.inputs!.length}>
            {model.inputs!.map((inp, i) => {
              const featureEntries = (featuresByInput.get(inp.name) ?? [])
                .filter(({ feature: f }) => f.name !== inp.name);
              const items = expandFeaturesToItems(featureEntries);
              const MAX = 20;
              const expanded = expandedInputs.has(inp.name);
              return (
                <React.Fragment key={inp.name}>
                  <NavItem
                    label={inp.name}
                    icon="→"
                    monospace
                    badge={items.length > 0 ? String(items.length) : undefined}
                    active={isSelected('input', inp.name)}
                    onClick={() => select({ kind: 'input', id: inp.name, index: i })}
                    onToggle={items.length > 0 ? () => toggleInputExpand(inp.name) : undefined}
                    expanded={expanded}
                  />
                  {expanded && items.slice(0, MAX).map(item => (
                    <FeatureNavItem
                      key={item.id}
                      label={item.label}
                      active={isSelected('feature', item.id)}
                      onClick={() => select({ kind: 'feature', id: item.id, index: item.globalIndex })}
                    />
                  ))}
                  {expanded && items.length > MAX && (
                    <div style={styles.featureMore}>+{items.length - MAX} more…</div>
                  )}
                </React.Fragment>
              );
            })}
          </NavSection>
        )}

        {/* Targets */}
        {(model.model_schema?.targets?.length ?? 0) > 0 && (
          <NavSection label="Targets" count={model.model_schema!.targets!.length}>
            {model.model_schema!.targets!.map((t, i) => (
              <NavItem
                key={t.name}
                label={t.name}
                icon="◎"
                monospace
                badge={t.kind && t.kind !== 'TARGET_KIND_UNSPECIFIED' ? t.kind : undefined}
                active={isSelected('target', t.name)}
                onClick={() => select({ kind: 'target', id: t.name, index: i })}
              />
            ))}
          </NavSection>
        )}

        {/* Outputs */}
        {(model.outputs?.length ?? 0) > 0 && (
          <NavSection label="Outputs" count={model.outputs!.length}>
            {model.outputs!.map((out, i) => (
              <NavItem
                key={out.name}
                label={out.name}
                icon="←"
                monospace
                active={isSelected('output', out.name)}
                onClick={() => select({ kind: 'output', id: out.name, index: i })}
              />
            ))}
          </NavSection>
        )}

        {/* Orphan features — not matched to any input */}
        {orphanFeatures.length > 0 && (() => {
          const items = expandFeaturesToItems(orphanFeatures);
          return (
            <NavSection label="Features" count={items.length}>
              {items.slice(0, 50).map(item => (
                <NavItem
                  key={item.id}
                  label={item.label}
                  icon="ƒ"
                  monospace
                  active={isSelected('feature', item.id)}
                  onClick={() => select({ kind: 'feature', id: item.id, index: item.globalIndex })}
                />
              ))}
              {items.length > 50 && (
                <div style={styles.moreLabel}>+{items.length - 50} more…</div>
              )}
            </NavSection>
          );
        })()}

        {/* Nodes */}
        {(model.nodes?.length ?? 0) > 0 && (
          <NavSection label="Nodes" count={model.nodes!.length}>
            {model.nodes!.map((node, i) => (
              <NavItem
                key={node.name}
                label={node.name}
                icon={nodeIcon(node)}
                monospace
                badge={nodeBodyType(node)}
                active={isSelected('node', node.name)}
                onClick={() => select({ kind: 'node', id: node.name, index: i })}
              />
            ))}
          </NavSection>
        )}

        {/* Functions */}
        {(model.functions?.length ?? 0) > 0 && (
          <NavSection label="Functions" count={model.functions!.length}>
            {model.functions!.map((fn, i) => (
              <NavItem
                key={fn.name}
                label={fn.name}
                icon="λ"
                monospace
                active={isSelected('function', fn.name)}
                onClick={() => select({ kind: 'function', id: fn.name, index: i })}
              />
            ))}
          </NavSection>
        )}

        {/* Verification */}
        {(model.verification?.cases?.length ?? 0) > 0 && (
          <NavSection label="Verification" count={model.verification!.cases!.length}>
            {model.verification!.cases!.map((c, i) => (
              <NavItem
                key={i}
                label={c.description ?? `Case ${i}`}
                icon="✓"
                active={isSelected('verification', String(i))}
                onClick={() => select({ kind: 'verification', id: String(i), index: i })}
              />
            ))}
          </NavSection>
        )}

        {/* Warmup */}
        {(model.warmup?.cases?.length ?? 0) > 0 && (
          <NavSection label="Warmup" count={model.warmup!.cases!.length}>
            {model.warmup!.cases!.map((c, i) => (
              <NavItem
                key={i}
                label={c.description ?? `Case ${i}`}
                icon="⚡"
                badge={c.repeat != null ? `×${c.repeat}` : undefined}
                active={isSelected('warmup', String(i))}
                onClick={() => select({ kind: 'warmup', id: String(i), index: i })}
              />
            ))}
          </NavSection>
        )}

        {/* Sample Inputs */}
        {(model.sample_inputs?.cases?.length ?? 0) > 0 && (
          <NavSection label="Samples" count={model.sample_inputs!.cases!.length}>
            {model.sample_inputs!.cases!.map((c, i) => (
              <NavItem
                key={i}
                label={c.description ?? `Case ${i}`}
                icon="▶"
                active={isSelected('sample_input', String(i))}
                onClick={() => select({ kind: 'sample_input', id: String(i), index: i })}
              />
            ))}
          </NavSection>
        )}

        {/* Tensors */}
        {(model.tensor_entries?.length ?? 0) > 0 && (
          <NavSection label="Tensors" count={model.tensor_entries!.length}>
            {model.tensor_entries!.map((te, i) => (
              <NavItem
                key={te.id}
                label={te.id}
                icon={te.sparse ? '⋯' : '▦'}
                monospace
                active={isSelected('tensor', te.id)}
                onClick={() => select({ kind: 'tensor', id: te.id, index: i })}
              />
            ))}
          </NavSection>
        )}
      </nav>

      {/* Bottom: re-open file */}
      <div style={styles.sidebarFooter}>
        <label style={styles.openBtn}>
          Open file…
          <input
            type="file"
            accept=".json,.omle"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </label>
      </div>
    </div>
  );
}

// ── Nav helpers ───────────────────────────────────────────────────────────────

// ── Feature grouping ──────────────────────────────────────────────────────────

interface IndexedFeature { feature: Feature; globalIndex: number }

interface ExpandedFeatureItem {
  label: string;   // displayed name, e.g. "f2"
  id: string;      // selection id
  globalIndex: number;  // index of parent Feature object
}

function expandFeaturesToItems(entries: IndexedFeature[]): ExpandedFeatureItem[] {
  const items: ExpandedFeatureItem[] = [];
  for (const { feature: f, globalIndex } of entries) {
    if (f.range) {
      const { prefix, start = 0, end } = f.range;
      for (let i = start; i < end; i++) {
        const name = `${prefix}${i}`;
        items.push({ label: name, id: name, globalIndex });
      }
    } else {
      const fid = f.name ?? String(globalIndex);
      items.push({ label: fid, id: fid, globalIndex });
    }
  }
  return items;
}

function groupFeaturesByInput(
  inputs: InputSpec[],
  features: Feature[],
): { byInput: Map<string, IndexedFeature[]>; orphans: IndexedFeature[] } {
  const inputNames = new Set(inputs.map(inp => inp.name));
  const byInput = new Map<string, IndexedFeature[]>();
  const orphans: IndexedFeature[] = [];

  features.forEach((f, globalIndex) => {
    let matched: string | null = null;
    if (f.source && inputNames.has(f.source)) {
      matched = f.source;
    } else if (!f.source && f.name && inputNames.has(f.name)) {
      matched = f.name;
    } else if (f.range?.prefix && inputNames.has(f.range.prefix)) {
      matched = f.range.prefix;
    } else if (inputs.length === 1) {
      // Single-input model: assign all unmatched features to the only input.
      matched = inputs[0].name;
    }
    const entry: IndexedFeature = { feature: f, globalIndex };
    if (matched) {
      const arr = byInput.get(matched) ?? [];
      arr.push(entry);
      byInput.set(matched, arr);
    } else {
      orphans.push(entry);
    }
  });
  return { byInput, orphans };
}

// ── Nav helpers ───────────────────────────────────────────────────────────────

function FeatureNavItem({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      style={{ ...styles.featureItem, ...(active ? styles.featureItemActive : {}) }}
      onClick={onClick}
      title={label}
    >
      <span style={styles.featureIcon}>ƒ</span>
      <span style={styles.featureLabel}>{label}</span>
    </button>
  );
}

function NavSection({
  label, count, children,
}: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={styles.section}>
      <button style={styles.sectionHeader} onClick={() => setOpen(o => !o)}>
        <span style={{ opacity: 0.5, fontSize: 10 }}>{open ? '▾' : '▸'}</span>
        <span style={styles.sectionLabel}>{label}</span>
        <span style={styles.sectionCount}>{count}</span>
      </button>
      {open && <div style={styles.sectionChildren}>{children}</div>}
    </div>
  );
}

function NavItem({
  label, icon, active, onClick, monospace = false, badge, onToggle, expanded,
}: {
  label: string; icon: React.ReactNode; active: boolean;
  onClick: () => void; monospace?: boolean; badge?: string;
  onToggle?: () => void; expanded?: boolean;
}) {
  return (
    <button
      style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
      onClick={onClick}
      title={label}
    >
      <span style={styles.navIcon}>{icon}</span>
      <span style={{ ...styles.navLabel, ...(monospace ? styles.mono : {}) }}>
        {label}
      </span>
      {badge && <span style={styles.badge}>{badge}</span>}
      {onToggle && (
        <span
          style={styles.chevron}
          onClick={e => { e.stopPropagation(); onToggle(); }}
          title={expanded ? 'Collapse features' : 'Expand features'}
        >
          {expanded ? '▾' : '▸'}
        </span>
      )}
    </button>
  );
}

function nodeBodyType(node: import('@openmle/omle.js').Node): string | undefined {
  if (node.tree) return 'Tree';
  if (node.tree_ensemble) return 'TreeEnsemble';
  if (node.linear) return 'Linear';
  if (node.neural_network) return 'NN';
  if (node.naive_bayes) return 'NB';
  if (node.clustering) return 'Cluster';
  if (node.svm) return 'SVM';
  if (node.composite) return 'Composite';
  return node.op ?? undefined;
}

function nodeIcon(node: import('@openmle/omle.js').Node): React.ReactNode {
  if (node.tree_ensemble) return <TreeEnsembleIconHtml size={13} />;
  if (node.tree) return '🌳';
  if (node.linear) return 'Σ';
  if (node.svm) return '⊗';
  if (node.neural_network) return <NeuralNetworkIconHtml size={13} />;
  if (node.naive_bayes) return '🎲';
  if (node.clustering) return '🔵';
  if (node.composite) return '📦';
  return '⚙';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--t-bg)',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '12px 14px 8px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--t-text3)',
    flexShrink: 0,
    borderBottom: '1px solid var(--t-border)',
  },
  headerLabel: { userSelect: 'none', flex: 1, display: 'flex', alignItems: 'baseline', gap: 6 },
  version: { fontSize: 9, fontWeight: 400, color: 'var(--t-text4)', letterSpacing: '0.04em', textTransform: 'none' },
  themeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--t-text4)',
    fontSize: 14,
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
  },
  fileBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderBottom: '1px solid var(--t-border)',
    gap: 6,
    flexShrink: 0,
  },
  fileName: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'var(--t-text2)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--t-text3)',
    cursor: 'pointer',
    fontSize: 16,
    padding: '0 2px',
    lineHeight: 1,
  },
  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  section: { marginBottom: 2 },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '4px 10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--t-text3)',
    fontSize: 11,
    textAlign: 'left',
  },
  sectionLabel: { flex: 1, fontWeight: 600, letterSpacing: '0.04em' },
  sectionCount: {
    fontSize: 10,
    color: 'var(--t-text4)',
    background: 'var(--t-surface)',
    padding: '1px 5px',
    borderRadius: 10,
  },
  sectionChildren: { paddingBottom: 2 },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '4px 12px 4px 20px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--t-text2)',
    fontSize: 12,
    textAlign: 'left',
    transition: 'background 0.1s',
    overflow: 'hidden',
  },
  navItemActive: {
    background: 'var(--t-active)',
    color: 'var(--t-text)',
  },
  navIcon: { flexShrink: 0, fontSize: 12, width: 16, textAlign: 'center' },
  navLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  chevron: { flexShrink: 0, fontSize: 10, color: 'var(--t-text4)', padding: '0 2px', lineHeight: 1 },
  badge: {
    fontSize: 9,
    color: 'var(--t-accent)',
    background: 'var(--t-chip)',
    padding: '1px 5px',
    borderRadius: 8,
    flexShrink: 0,
  },
  moreLabel: {
    padding: '2px 20px',
    fontSize: 11,
    color: 'var(--t-text4)',
    fontStyle: 'italic',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    width: '100%',
    padding: '3px 12px 3px 32px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--t-text3)',
    fontSize: 11,
    textAlign: 'left' as const,
    overflow: 'hidden',
  },
  featureItemActive: {
    background: 'var(--t-active)',
    color: 'var(--t-text)',
  },
  featureIcon: {
    flexShrink: 0,
    fontSize: 10,
    width: 14,
    textAlign: 'center' as const,
    color: 'var(--t-text4)',
  },
  featureLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'monospace',
  },
  featureMore: {
    padding: '2px 12px 2px 32px',
    fontSize: 10,
    color: 'var(--t-muted)',
    fontStyle: 'italic',
  },
  sidebarFooter: {
    flexShrink: 0,
    borderTop: '1px solid var(--t-border)',
    padding: 10,
  },
  openBtn: {
    display: 'block',
    textAlign: 'center',
    padding: '5px 12px',
    borderRadius: 5,
    background: 'var(--t-surface)',
    color: 'var(--t-text3)',
    fontSize: 12,
    cursor: 'pointer',
    border: '1px solid var(--t-frame)',
  },
};
