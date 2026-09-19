import React from 'react';
import { useApp } from '../../App.tsx';

export function OverviewView() {
  const { state } = useApp();
  const { model, validation } = state;
  if (!model) return null;

  const meta = model.metadata;

  return (
    <div style={styles.root}>
      <h2 style={styles.title}>{meta?.name || 'Unnamed Model'}</h2>
      {meta?.doc_string && <p style={styles.docString}>{meta.doc_string}</p>}

      <Section label="Metadata">
        <PropGrid>
          {meta?.format_version && <Prop k="Format version" v={meta.format_version} />}
          {meta?.producer && <Prop k="Producer" v={`${meta.producer}${meta.producer_version ? ` v${meta.producer_version}` : ''}`} />}
          {(meta?.source_frameworks?.length ?? 0) > 0 && (
            meta!.source_frameworks!.map((sf, i) => (
              <Prop key={i} k="Source framework" v={`${sf.name ?? ''}${sf.version ? ` v${sf.version}` : ''}${sf.role ? ` (${sf.role})` : ''}`} />
            ))
          )}
        </PropGrid>
        {meta?.attributes && Object.keys(meta.attributes).length > 0 && (
          <PropGrid>
            {Object.entries(meta.attributes).map(([k, v]) => (
              <Prop key={k} k={k} v={v} />
            ))}
          </PropGrid>
        )}
      </Section>

      <Section label="Graph statistics">
        <StatGrid>
          <Stat value={model.inputs?.length ?? 0} label="Inputs" />
          <Stat value={model.outputs?.length ?? 0} label="Outputs" />
          <Stat value={model.nodes?.length ?? 0} label="Nodes" />
          <Stat value={model.tensor_entries?.length ?? 0} label="Tensors" />
          {model.model_schema?.features && (
            <Stat value={model.model_schema.features.length} label="Features" />
          )}
          {model.model_schema?.targets && (
            <Stat value={model.model_schema.targets.length} label="Targets" />
          )}
          {model.functions && model.functions.length > 0 && (
            <Stat value={model.functions.length} label="Functions" />
          )}
        </StatGrid>
      </Section>

      {model.nodes && model.nodes.length > 0 && (
        <Section label="Node types">
          <NodeTypeSummary nodes={model.nodes} />
        </Section>
      )}

      {(model.operator_imports?.length ?? 0) > 0 && (
        <Section label="Operator imports">
          <div style={styles.tagList}>
            {model.operator_imports!.map(ns => (
              <Tag key={ns.namespace} label={`${ns.namespace} ${ns.version ?? ''}`} />
            ))}
          </div>
        </Section>
      )}

      {validation && (
        <Section label="Validation">
          {validation.valid ? (
            <div style={styles.validBadge}>✓ Valid</div>
          ) : (
            <div style={styles.errorBadge}>{validation.errors.length} error(s)</div>
          )}
          {validation.warnings.length > 0 && (
            <div style={styles.warnBadge}>{validation.warnings.length} warning(s)</div>
          )}
          {validation.errors.slice(0, 5).map((e, i) => (
            <div key={i} style={styles.issueRow}>
              <span style={styles.issueCode}>[{e.path}]</span>
              <span style={styles.issueMsg}>{e.message}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function NodeTypeSummary({ nodes }: { nodes: import('@openmle/omle.js').Node[] }) {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const type = nodeBodyLabel(n);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {[...counts.entries()].map(([type, count]) => (
        <Tag key={type} label={`${type} × ${count}`} />
      ))}
    </div>
  );
}

function nodeBodyLabel(node: import('@openmle/omle.js').Node): string {
  if (node.tree) return 'Tree';
  if (node.tree_ensemble) return 'TreeEnsemble';
  if (node.linear) return 'Linear';
  if (node.neural_network) return 'NeuralNetwork';
  if (node.naive_bayes) return 'NaiveBayes';
  if (node.clustering) return 'Clustering';
  if (node.svm) return 'SVM';
  if (node.composite) return 'Composite';
  return node.op ? `${node.domain ?? ''}::${node.op}` : 'Generic';
}

// ── Small components ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

function PropGrid({ children }: { children: React.ReactNode }) {
  return <div style={styles.propGrid}>{children}</div>;
}

function Prop({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <span style={styles.propKey}>{k}</span>
      <span style={styles.propVal}>{v}</span>
    </>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <div style={styles.statGrid}>{children}</div>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return <span style={styles.tag}>{label}</span>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: '24px 28px',
    overflowY: 'auto',
    height: '100%',
    boxSizing: 'border-box',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--t-text)',
    marginBottom: 6,
  },
  docString: {
    color: 'var(--t-text3)',
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--t-text4)',
    marginBottom: 10,
  },
  propGrid: {
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    gap: '4px 16px',
    fontSize: 12,
    marginBottom: 8,
  },
  propKey: { color: 'var(--t-accent)', fontWeight: 600 },
  propVal: { color: 'var(--t-text2)', fontFamily: 'monospace' },
  statGrid: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  statCard: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-frame)',
    borderRadius: 8,
    padding: '10px 16px',
    textAlign: 'center',
    minWidth: 64,
  },
  statValue: { fontSize: 22, fontWeight: 700, color: 'var(--t-accent2)' },
  statLabel: { fontSize: 10, color: 'var(--t-text4)', marginTop: 2 },
  tagList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: {
    background: 'var(--t-chip)',
    border: '1px solid var(--t-frame)',
    borderRadius: 12,
    padding: '2px 10px',
    fontSize: 11,
    color: 'var(--t-text3)',
    fontFamily: 'monospace',
  },
  validBadge: {
    display: 'inline-block',
    background: 'var(--t-ok-bg)',
    border: '1px solid var(--t-edge-out)',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    color: 'var(--t-ok)',
    marginBottom: 8,
  },
  errorBadge: {
    display: 'inline-block',
    background: 'var(--t-err-bg)',
    border: '1px solid var(--t-err)',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    color: 'var(--t-err)',
    marginBottom: 8,
    marginRight: 8,
  },
  warnBadge: {
    display: 'inline-block',
    background: 'var(--t-warn-bg)',
    border: '1px solid var(--t-node-warn-b)',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    color: 'var(--t-warn)',
    marginBottom: 8,
  },
  issueRow: {
    display: 'flex',
    gap: 10,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 1.4,
  },
  issueCode: {
    fontFamily: 'monospace',
    color: 'var(--t-accent)',
    flexShrink: 0,
  },
  issueMsg: { color: 'var(--t-text3)' },
};
