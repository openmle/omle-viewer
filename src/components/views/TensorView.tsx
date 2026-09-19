import React, { useState } from 'react';
import type { TensorEntry } from '@openmle/omle.js';

export function TensorView({ entry }: { entry: TensorEntry }) {
  const [tab, setTab] = useState<'data' | 'raw'>('data');
  const tensor = entry.dense;
  const sparse = entry.sparse;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.icon}>{sparse ? '⋯' : '▦'}</span>
        <span style={styles.id}>{entry.id}</span>
        {tensor && <span style={styles.badge}>{shapeStr(tensor.type?.shape ?? [])}</span>}
        {tensor?.type?.dtype && <span style={styles.dtype}>{tensor.type.dtype}</span>}
      </div>

      <div style={styles.tabBar}>
        {(['data', 'raw'] as const).map(t => (
          <button
            key={t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === 'data' && tensor && <DenseDataView tensor={tensor} />}
        {tab === 'data' && sparse && <SparseDataView sparse={sparse} />}
        {tab === 'raw' && (
          <pre style={styles.raw}>{JSON.stringify(entry, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

function DenseDataView({ tensor }: { tensor: import('@openmle/omle.js').Tensor }) {
  const shape = tensor.type?.shape ?? [];
  const dtype = tensor.type?.dtype ?? 'FLOAT64';

  const values = getDenseValues(tensor);
  const totalElements = values.length;
  const maxDisplay = 200;
  const displayValues = values.slice(0, maxDisplay);
  const isNumeric = dtype !== 'STRING' && dtype !== 'BYTES' && dtype !== 'BOOL';

  const rows = shape[0] ?? 0;
  const cols = shape.length > 1 ? shape[1] : 1;

  return (
    <div>
      <div style={styles.metaRow}>
        <MetaPill label="Shape" value={shapeStr(shape)} />
        <MetaPill label="DType" value={dtype} />
        <MetaPill label="Elements" value={String(totalElements)} />
        {tensor.name && <MetaPill label="Name" value={tensor.name} />}
      </div>

      {totalElements > 0 && (
        <>
          {isNumeric && cols > 1 && rows > 0 ? (
            <MatrixView
              values={displayValues as number[]}
              rows={Math.min(rows, Math.floor(maxDisplay / cols))}
              cols={cols}
            />
          ) : (
            <FlatView values={displayValues} />
          )}
          {totalElements > maxDisplay && (
            <div style={styles.truncNote}>
              Showing {maxDisplay} of {totalElements} elements
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SparseDataView({ sparse }: { sparse: import('@openmle/omle.js').SparseTensor }) {
  const csr = sparse.csr;
  return (
    <div>
      <div style={styles.metaRow}>
        <MetaPill label="Shape" value={shapeStr(sparse.type?.shape ?? [])} />
        <MetaPill label="DType" value={sparse.type?.dtype ?? '—'} />
        {csr && <MetaPill label="NNZ" value={String(csr.indices?.length ?? 0)} />}
      </div>
      {csr && (
        <div style={styles.csrInfo}>
          <div style={styles.csrRow}>
            <span style={styles.csrLabel}>indices</span>
            <span style={styles.csrValues}>
              [{(csr.indices ?? []).slice(0, 20).join(', ')}{(csr.indices?.length ?? 0) > 20 ? '…' : ''}]
            </span>
          </div>
          <div style={styles.csrRow}>
            <span style={styles.csrLabel}>indptr</span>
            <span style={styles.csrValues}>
              [{(csr.indptr ?? []).slice(0, 20).join(', ')}{(csr.indptr?.length ?? 0) > 20 ? '…' : ''}]
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function MatrixView({ values, rows, cols }: { values: number[]; rows: number; cols: number }) {
  return (
    <div style={styles.tableWrapper}>
      <table style={styles.table}>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <td style={styles.rowIdx}>{r}</td>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c} style={styles.cell}>
                  {formatNum(values[r * cols + c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlatView({ values }: { values: number[] | string[] | boolean[] }) {
  return (
    <div style={styles.flatView}>
      {(values as (number | string | boolean)[]).map((v, i) => (
        <span key={i} style={styles.flatCell}>
          {typeof v === 'number' ? formatNum(v) : String(v)}
        </span>
      ))}
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span style={styles.pill}>
      <span style={styles.pillLabel}>{label}</span>
      <span style={styles.pillValue}>{value}</span>
    </span>
  );
}

function getDenseValues(tensor: import('@openmle/omle.js').Tensor): number[] | string[] | boolean[] {
  if (tensor.float32_data) return tensor.float32_data;
  if (tensor.float64_data) return tensor.float64_data;
  if (tensor.int32_data) return tensor.int32_data;
  if (tensor.int64_data) return tensor.int64_data;
  if (tensor.string_data) return tensor.string_data;
  if (tensor.bool_data) return tensor.bool_data;
  return [];
}

function shapeStr(shape: number[]): string {
  if (shape.length === 0) return 'scalar';
  return `[${shape.map(d => d <= 0 ? 'N' : d).join('×')}]`;
}

function formatNum(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(4);
  return v.toPrecision(6).replace(/\.?0+$/, '');
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 20px 10px', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
  },
  icon: { fontSize: 16 },
  id: { fontFamily: 'monospace', fontSize: 14, color: 'var(--t-text)' },
  badge: {
    fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)',
    borderRadius: 10, padding: '2px 8px', color: 'var(--t-accent)', fontFamily: 'monospace',
  },
  dtype: {
    fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)',
    borderRadius: 10, padding: '2px 8px', color: 'var(--t-text3)', fontFamily: 'monospace',
  },
  tabBar: {
    display: 'flex', gap: 2, padding: '6px 16px 0', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
  },
  tab: {
    background: 'none', border: 'none', borderBottom: '2px solid transparent',
    cursor: 'pointer', color: 'var(--t-text4)', fontSize: 12, padding: '4px 10px 6px', fontWeight: 500,
  },
  tabActive: { color: 'var(--t-accent2)', borderBottomColor: 'var(--t-accent)' },
  content: { flex: 1, overflowY: 'auto', padding: 16 },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  pill: {
    display: 'inline-flex', gap: 5, background: 'var(--t-surface)', border: '1px solid var(--t-frame)',
    borderRadius: 12, padding: '3px 10px', fontSize: 11,
  },
  pillLabel: { color: 'var(--t-text4)' },
  pillValue: { color: 'var(--t-text3)', fontFamily: 'monospace' },
  tableWrapper: { overflowX: 'auto', borderRadius: 6, border: '1px solid var(--t-border)' },
  table: {
    borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 11, width: '100%',
  },
  rowIdx: {
    padding: '3px 8px', color: 'var(--t-muted)', borderRight: '1px solid var(--t-border)',
    textAlign: 'right', userSelect: 'none', background: 'var(--t-surface)',
  },
  cell: {
    padding: '3px 8px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text2)',
    textAlign: 'right', minWidth: 72,
  },
  flatView: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  flatCell: {
    background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 4,
    padding: '2px 7px', fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text2)',
  },
  truncNote: { fontSize: 11, color: 'var(--t-muted)', marginTop: 10, fontStyle: 'italic' },
  csrInfo: { fontSize: 11 },
  csrRow: { display: 'flex', gap: 10, marginBottom: 6 },
  csrLabel: { color: 'var(--t-text4)', width: 56, flexShrink: 0 },
  csrValues: { color: 'var(--t-text2)', fontFamily: 'monospace', wordBreak: 'break-all' },
  raw: {
    fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text3)', background: 'var(--t-surface)',
    border: '1px solid var(--t-frame)', borderRadius: 6, padding: 14, overflowX: 'auto',
    whiteSpace: 'pre-wrap', margin: 0,
  },
};
