// KNN node viewer.
// Shows props bar, class distribution (classification), and per-feature statistics.

import React from 'react';
import type { Node, OMLEModel, Attribute } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';

interface Props {
  node: Node;
  featureNames?: string[];
  featureTooltips?: string[];
  inputLabel?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAttr(attrs: Attribute[], name: string): Attribute | undefined {
  return attrs.find(a => a.name === name);
}

function resolveAttrData(
  attr: Attribute | undefined,
  model: OMLEModel | null | undefined,
): { data: Float64Array; shape: number[] } | null {
  if (!attr) return null;
  if (attr.tensor) {
    const raw = (attr.tensor.float64_data ?? attr.tensor.float32_data) as number[] | undefined;
    if (!raw) return null;
    const shape = attr.tensor.type?.shape?.map(Number) ?? [raw.length];
    return { data: new Float64Array(raw), shape };
  }
  if (attr.tensor_ref) {
    const entry = model?.tensor_entries?.find(e => e.id === attr.tensor_ref!.id);
    if (!entry?.dense) return null;
    const raw = (entry.dense.float64_data ?? entry.dense.float32_data) as number[] | undefined;
    if (!raw) return null;
    const shape = entry.dense.type?.shape?.map(Number) ?? [raw.length];
    return { data: new Float64Array(raw), shape };
  }
  return null;
}

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(3);
  return v.toPrecision(4).replace(/\.?0+$/, '');
}

function fmtInt(v: number): string {
  return Number.isInteger(v) ? String(v) : fmt(v);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KNNViewer({ node, featureNames = [], featureTooltips, inputLabel }: Props) {
  const { state } = useApp();
  const { model } = state;

  const attrs = node.attributes ?? [];

  // Read scalar attributes
  const task         = getAttr(attrs, 'task')?.s ?? 'regression';
  const metric       = getAttr(attrs, 'metric')?.s ?? 'euclidean';
  const weights      = getAttr(attrs, 'weights')?.s ?? 'uniform';
  const neighborMode = getAttr(attrs, 'neighbor_mode')?.s ?? 'knn';
  const k            = getAttr(attrs, 'n_neighbors')?.i ?? 5;
  const nClasses     = getAttr(attrs, 'n_classes')?.i ?? 2;
  const radius       = getAttr(attrs, 'radius')?.f64;

  // Resolve training tensors
  const featData = resolveAttrData(getAttr(attrs, 'train_features'), model);
  const targData = resolveAttrData(getAttr(attrs, 'train_targets'), model);

  const nInst  = featData?.shape[0] ?? 0;
  const nFeat  = featData?.shape[1] ?? 1;
  const trainX = featData?.data ?? null;
  const trainY = targData?.data ?? null;

  const isClassify  = task === 'classification';
  const isRadius    = neighborMode === 'radius';

  // Props bar
  const propsBar: [string, string][] = [
    ['Task',       task],
    [isRadius ? 'Radius' : 'k',   isRadius ? fmt(radius ?? 1) : String(k)],
    ['Metric',     metric],
    ['Weights',    weights],
    ['Instances',  String(nInst)],
    ['Features',   String(nFeat)],
    ...(isClassify ? [['Classes', String(nClasses)] as [string, string]] : []),
    ...(inputLabel ? [['Input', inputLabel] as [string, string]] : []),
  ];

  // Per-class counts (classification only)
  const classCounts = React.useMemo(() => {
    if (!isClassify || !trainY) return null;
    const counts = new Map<number, number>();
    for (let i = 0; i < trainY.length; i++) {
      const c = Math.round(trainY[i]);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  }, [isClassify, trainY]);

  const maxCount = classCounts ? Math.max(...classCounts.map(([, c]) => c)) : 0;

  // Per-feature statistics
  const featStats = React.useMemo(() => {
    if (!trainX || nInst === 0 || nFeat === 0) return null;
    return Array.from({ length: nFeat }, (_, fi) => {
      let mn = Infinity, mx = -Infinity, sum = 0;
      for (let r = 0; r < nInst; r++) {
        const v = trainX[r * nFeat + fi];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sum += v;
      }
      const mean = sum / nInst;
      let varSum = 0;
      for (let r = 0; r < nInst; r++) {
        const d = trainX[r * nFeat + fi] - mean;
        varSum += d * d;
      }
      return { min: mn, max: mx, mean, std: Math.sqrt(varSum / nInst) };
    });
  }, [trainX, nInst, nFeat]);

  const MAX_FEAT = 64;

  return (
    <div style={s.root}>
      {/* Props bar */}
      <div style={s.propsRow}>
        {propsBar.map(([k, v]) => (
          <div key={k} style={s.propCell}>
            <span style={s.propLabel}>{k}</span>
            <span style={s.propValue}>{v}</span>
          </div>
        ))}
      </div>

      <div style={s.body}>
        {/* Class distribution */}
        {isClassify && classCounts && (
          <section style={s.section}>
            <div style={s.sectionTitle}>Class distribution</div>
            <div style={s.classBars}>
              {classCounts.map(([cls, count]) => (
                <div key={cls} style={s.classRow}>
                  <span style={s.classLabel}>class {fmtInt(cls)}</span>
                  <div style={s.barTrack}>
                    <div
                      style={{
                        ...s.barFill,
                        width: `${100 * count / Math.max(maxCount, 1)}%`,
                        background: classColor(cls, nClasses),
                      }}
                    />
                  </div>
                  <span style={s.classCount}>{count}</span>
                  <span style={s.classPct}>({(100 * count / nInst).toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Feature statistics */}
        {featStats && (
          <section style={s.section}>
            <div style={s.sectionTitle}>Training feature statistics</div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Feature</th>
                    <th style={{ ...s.th, ...s.tdNum }}>Min</th>
                    <th style={{ ...s.th, ...s.tdNum }}>Mean</th>
                    <th style={{ ...s.th, ...s.tdNum }}>Max</th>
                    <th style={{ ...s.th, ...s.tdNum }}>Std</th>
                    <th style={{ ...s.th, ...s.tdNum }}>Range bar</th>
                  </tr>
                </thead>
                <tbody>
                  {featStats.slice(0, MAX_FEAT).map((stat, fi) => {
                    const name = featureNames[fi] ?? `f${fi}`;
                    const tip  = featureTooltips?.[fi] ?? name;
                    const rangeAll = featStats.reduce((m, st) => Math.max(m, st.max - st.min), 1e-9);
                    const barW = (stat.max - stat.min) / rangeAll;
                    return (
                      <tr key={fi} style={s.tr}>
                        <td style={s.td} title={tip}>{name.length > 18 ? name.slice(0, 17) + '…' : name}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>{fmt(stat.min)}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>{fmt(stat.mean)}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>{fmt(stat.max)}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>{fmt(stat.std)}</td>
                        <td style={{ ...s.td, ...s.tdNum }}>
                          <div style={s.rangeTrack}>
                            <div style={{ ...s.rangeFill, width: `${barW * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {nFeat > MAX_FEAT && (
                    <tr>
                      <td colSpan={6} style={{ ...s.td, color: 'var(--t-muted)', fontStyle: 'italic' }}>
                        +{nFeat - MAX_FEAT} more features…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!featData && (
          <div style={{ color: 'var(--t-muted)', fontSize: 12, padding: 16 }}>
            Training data tensors not available.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const CLASS_PALETTE = [
  'var(--t-edge-out)',
  'var(--t-err)',
  '#a78bfa',
  '#fb923c',
  '#34d399',
  '#f472b6',
  '#38bdf8',
  '#facc15',
];

function classColor(cls: number, _nClasses: number): string {
  return CLASS_PALETTE[cls % CLASS_PALETTE.length] ?? 'var(--t-edge-out)';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    background: 'var(--t-canvas)', fontFamily: '"Inter","Segoe UI",system-ui,sans-serif',
  },

  propsRow:  { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-border)', flexShrink: 0, flexWrap: 'wrap' },
  propCell:  { display: 'flex', flexDirection: 'column', padding: '8px 16px', borderRight: '1px solid var(--t-border)' },
  propLabel: { fontSize: 9, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  propValue: { fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' },

  body: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 },

  section:      { padding: '12px 16px', borderBottom: '1px solid var(--t-line)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 },

  classBars: { display: 'flex', flexDirection: 'column', gap: 5 },
  classRow:  { display: 'flex', alignItems: 'center', gap: 8 },
  classLabel: { width: 64, flexShrink: 0, fontSize: 11, color: 'var(--t-text3)', fontFamily: 'monospace', textAlign: 'right' },
  barTrack:  { flex: 1, height: 14, background: 'var(--t-line)', borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 3, transition: 'width 0.2s', opacity: 0.85 },
  classCount: { width: 50, flexShrink: 0, fontSize: 11, color: 'var(--t-text)', fontFamily: 'monospace', textAlign: 'right' },
  classPct:   { width: 54, flexShrink: 0, fontSize: 10, color: 'var(--t-text4)', fontFamily: 'monospace' },

  tableWrap: { overflowX: 'auto' },
  table:     { borderCollapse: 'collapse', fontSize: 11, width: '100%' },
  th:        { padding: '4px 8px', textAlign: 'left', color: 'var(--t-text4)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--t-border)', whiteSpace: 'nowrap' },
  tr:        { borderBottom: '1px solid var(--t-line)' },
  td:        { padding: '4px 8px', color: 'var(--t-text3)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' },
  tdNum:     { textAlign: 'right', fontFamily: 'monospace', color: 'var(--t-text)' },

  rangeTrack: { width: 80, height: 8, background: 'var(--t-line)', borderRadius: 2, overflow: 'hidden', display: 'inline-block' },
  rangeFill:  { height: '100%', background: 'var(--t-edge-out)', borderRadius: 2, opacity: 0.7 },
};
