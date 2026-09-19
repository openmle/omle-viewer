import React from 'react';
import type { DefineFunction } from '@openmle/omle.js';
import { JsonView } from '../shared/JsonView.tsx';

export function FunctionView({ fn }: { fn: DefineFunction }) {
  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.icon}>λ</span>
        <span style={styles.name}>{fn.name}</span>
      </div>
      <div style={styles.content}>
        {fn.doc_string && <p style={styles.doc}>{fn.doc_string}</p>}
        <div style={styles.signature}>
          <span style={styles.fnName}>{fn.name}</span>
          <span style={styles.paren}>(</span>
          {(fn.parameters ?? []).map((p, i) => (
            <span key={p.name}>
              <span style={styles.paramName}>{p.name}</span>
              {p.data_type && <span style={styles.paramType}>: {p.data_type}</span>}
              {i < (fn.parameters?.length ?? 0) - 1 && <span style={styles.paren}>, </span>}
            </span>
          ))}
          <span style={styles.paren}>)</span>
          {fn.result_data_type && <span style={styles.paramType}> → {fn.result_data_type}</span>}
        </div>
        <div style={styles.sectionLabel}>Body expression</div>
        <JsonView value={fn.body ?? {}} />
        <div style={styles.sectionLabel}>Raw JSON</div>
        <JsonView value={fn} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 10px', borderBottom: '1px solid var(--t-border)', flexShrink: 0 },
  icon: { fontSize: 16, color: 'var(--t-text3)' },
  name: { fontFamily: 'monospace', fontSize: 14, color: 'var(--t-text)' },
  content: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  doc: { color: 'var(--t-text3)', fontSize: 13, lineHeight: 1.6, marginBottom: 14 },
  signature: { background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 6, padding: '8px 14px', fontFamily: 'monospace', fontSize: 13, marginBottom: 16 },
  fnName: { color: 'var(--t-accent2)' },
  paren: { color: 'var(--t-accent)' },
  paramName: { color: 'var(--t-ok)' },
  paramType: { color: 'var(--t-edge-out)' },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: 'var(--t-text4)', letterSpacing: '0.07em', marginBottom: 8, marginTop: 12 },
};
