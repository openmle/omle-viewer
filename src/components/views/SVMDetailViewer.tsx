// SVM detail viewer.
// Shows coefficients (linear SVM) or support vector stats (kernel SVM).

import React from 'react';
import type { SVM } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';
import { tvFloats, tvShape } from '../shared/tensorValue.ts';

interface Props {
  nodeName: string;
  svm: SVM;
  featureNames?: string[];
  featureTooltips?: string[];
  inputLabel?: string | null;
}

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(3);
  return v.toPrecision(4).replace(/\.?0+$/, '');
}

function heatColor(t: number): string {
  // t in [0,1]: 0 = blue, 0.5 = white, 1 = red
  const r = Math.round(t < 0.5 ? 180 * (2 * t) : 180 + 75 * (2 * t - 1));
  const g = Math.round(t < 0.5 ? 180 * (2 * t) : 255 - 75 * (2 * t - 1));
  const b = Math.round(t < 0.5 ? 255 - 75 * (2 * t) : 255 * (1 - (2 * t - 1)));
  return `rgb(${r},${g},${b})`;
}

function colMinMax(data: number[], nRows: number, nCols: number): { min: number; max: number }[] {
  return Array.from({ length: nCols }, (_, ci) => {
    let mn = Infinity, mx = -Infinity;
    for (let r = 0; r < nRows; r++) {
      const v = data[r * nCols + ci] ?? 0;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return { min: mn, max: mx };
  });
}

export function SVMDetailViewer({ nodeName: _nodeName, svm, featureNames = [], featureTooltips, inputLabel }: Props) {
  const { state } = useApp();
  const { model } = state;

  const variant = svm.linear ? 'Linear' : svm.kernel ? 'Kernel' : 'Unknown';
  const kernelType = svm.kernel?.kernel_type ?? '—';
  const strategy = svm.multiclass_strategy ?? '—';
  const postTransform = svm.post_transform ?? '—';

  // ── Linear SVM ───────────────────────────────────────────────────────────────

  const lin = svm.linear;
  const coefData  = tvFloats(lin?.coefficients, model);
  const coefShape = tvShape(lin?.coefficients, model);
  const nClasses  = coefShape.length >= 2 ? coefShape[0] : 1;
  const nFeatures = coefShape.length >= 2 ? coefShape[1] : (coefShape[0] ?? 0);
  const intercData = tvFloats(lin?.intercept, model);
  const multiclass = nClasses > 1;

  // per-column heat normalization for coefficient heatmap
  const heatRanges = coefData && nFeatures > 0
    ? colMinMax(coefData, nClasses, nFeatures)
    : [];

  // ── Kernel SVM ───────────────────────────────────────────────────────────────

  const kern = svm.kernel;
  const svShape   = tvShape(kern?.support_vectors, model);
  const dualShape = tvShape(kern?.dual_coefficients, model);
  const totalSV   = svShape[0] ?? 0;
  const svFeats   = svShape[1] ?? 0;
  const nSupport  = kern?.n_support ?? [];

  const kernIntercData = tvFloats(kern?.intercept, model);

  const gammaVal  = kern?.gamma != null
    ? (typeof kern.gamma === 'object' ? (kern.gamma.float_value ?? kern.gamma.double_value ?? kern.gamma.int_value) : kern.gamma)
    : null;
  const coef0Val  = kern?.coef0 != null
    ? (typeof kern.coef0 === 'object' ? (kern.coef0.float_value ?? kern.coef0.double_value ?? kern.coef0.int_value) : kern.coef0)
    : null;

  const fname = (fi: number) => featureNames[fi] ?? `f${fi}`;
  const ftip  = (fi: number) => featureTooltips?.[fi] ?? fname(fi);

  const props = [
    ['Variant',    variant],
    ['Task',       svm.task_type ?? '—'],
    ['Strategy',   strategy],
    ['Post-xform', postTransform],
    ...(svm.kernel ? [['Kernel', kernelType]] : []),
    ...(svm.linear ? [['Classes', nClasses > 1 ? String(nClasses) : '—'], ['Features', nFeatures > 0 ? String(nFeatures) : '—']] : []),
    ...(svm.kernel ? [['SVs', String(totalSV)], ['Features', String(svFeats)]] : []),
    ...(inputLabel ? [['Input', inputLabel]] : []),
  ] as [string, string][];

  return (
    <div style={s.root}>
      {/* Props bar */}
      <div style={s.propsRow}>
        {props.map(([k, v]) => (
          <div key={k} style={s.propCell}>
            <span style={s.propLabel}>{k}</span>
            <span style={s.propValue}>{v}</span>
          </div>
        ))}
      </div>

      {/* ── Linear SVM ─────────────────────────────────────────────────────── */}
      {svm.linear && coefData && nFeatures > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, ...s.colFeature }}>Feature</th>
                {multiclass
                  ? Array.from({ length: nClasses }, (_, ci) => (
                      <th key={ci} style={{ ...s.th, ...s.colVal }}>Class {ci}</th>
                    ))
                  : <th style={{ ...s.th, ...s.colVal }}>Coefficient</th>
                }
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nFeatures }, (_, fi) => {
                const coeffs = Array.from({ length: nClasses }, (_, ci) => coefData[ci * nFeatures + fi] ?? 0);
                return (
                  <tr key={fi}>
                    <td style={{ ...s.td, ...s.colFeature }} title={ftip(fi)}>{fname(fi)}</td>
                    {coeffs.map((c, ci) => {
                      const range = heatRanges[fi];
                      const t = range && range.max > range.min
                        ? (c - range.min) / (range.max - range.min)
                        : 0.5;
                      const bg = heatColor(t);
                      // use dark text for mid-range cells, white/dark based on lightness
                      const textColor = t > 0.35 && t < 0.65 ? '#111' : t < 0.35 ? '#fff' : '#111';
                      return (
                        <td key={ci} style={{ ...s.td, ...s.colVal, background: bg, color: textColor }}>
                          {fmt(c)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Intercept row */}
              {intercData && (
                <tr style={{ borderTop: '1px solid var(--t-frame)' }}>
                  <td style={{ ...s.td, ...s.colFeature, color: 'var(--t-text3)', fontStyle: 'italic' }}>
                    intercept
                  </td>
                  {Array.from({ length: nClasses }, (_, ci) => (
                    <td key={ci} style={{ ...s.td, ...s.colVal, color: 'var(--t-text3)' }}>
                      {fmt(intercData[ci] ?? 0)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Kernel SVM ─────────────────────────────────────────────────────── */}
      {svm.kernel && (
        <div style={s.kernelWrap}>
          {/* Kernel parameters */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Kernel Parameters</div>
            <div style={s.paramGrid}>
              {[
                ['Kernel type', kernelType],
                ['Gamma',    gammaVal != null ? fmt(Number(gammaVal)) : `1/F = 1/${svFeats}`],
                ['Degree',   kern?.degree != null ? String(kern.degree) : '3'],
                ['Coef0',    coef0Val   != null ? fmt(Number(coef0Val)) : '0'],
              ].map(([k, v]) => (
                <div key={k} style={s.paramRow}>
                  <span style={s.paramKey}>{k}</span>
                  <span style={s.paramVal}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Support vector counts per class */}
          {nSupport.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Support Vectors per Class</div>
              <div style={s.svBar}>
                {nSupport.map((count, ci) => {
                  const pct = totalSV > 0 ? count / totalSV : 0;
                  const hue = Math.round((ci / Math.max(nSupport.length, 1)) * 300);
                  return (
                    <div key={ci} style={{ ...s.svSegment, width: `${pct * 100}%`, background: `hsl(${hue},55%,55%)` }}>
                      {pct > 0.08 && <span style={s.svLabel}>c{ci}: {count}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={s.svLegend}>
                {nSupport.map((count, ci) => {
                  const hue = Math.round((ci / Math.max(nSupport.length, 1)) * 300);
                  return (
                    <div key={ci} style={s.svLegendItem}>
                      <div style={{ ...s.svDot, background: `hsl(${hue},55%,55%)` }} />
                      <span>c{ci}: {count} SVs ({totalSV > 0 ? Math.round(count / totalSV * 100) : 0}%)</span>
                    </div>
                  );
                })}
                <div style={s.svLegendItem}>
                  <span style={{ color: 'var(--t-text4)' }}>Total: {totalSV}</span>
                </div>
              </div>
            </div>
          )}

          {/* Dual coefficients shape info */}
          {dualShape.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Dual Coefficients</div>
              <div style={s.paramGrid}>
                <div style={s.paramRow}>
                  <span style={s.paramKey}>Shape</span>
                  <span style={s.paramVal}>[{dualShape.join(', ')}]</span>
                </div>
              </div>
            </div>
          )}

          {/* Intercepts */}
          {kernIntercData && kernIntercData.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Intercept (bias)</div>
              <div style={s.interceptList}>
                {kernIntercData.map((v, i) => (
                  <span key={i} style={s.interceptChip}>
                    <span style={s.priorClass}>{kernIntercData.length > 1 ? `b${i}` : 'b'}</span>
                    {fmt(v)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!svm.linear && !svm.kernel && (
        <div style={s.noData}>No SVM implementation data available.</div>
      )}
      {svm.linear && !coefData && (
        <div style={s.noData}>Coefficient tensor data not embedded in model.</div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--t-canvas)' },

  propsRow: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-border)', flexShrink: 0, flexWrap: 'wrap' },
  propCell: { display: 'flex', flexDirection: 'column', padding: '8px 16px', borderRight: '1px solid var(--t-border)' },
  propLabel: { fontSize: 9, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  propValue: { fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' },

  tableWrap: { flex: 1, overflowY: 'auto', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    position: 'sticky', top: 0, background: 'var(--t-surface2)',
    borderBottom: '1px solid var(--t-frame)', padding: '5px 8px',
    fontSize: 9, color: 'var(--t-text4)', textAlign: 'left',
    textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
  },
  td: { padding: '3px 8px', borderBottom: '1px solid var(--t-line)' },
  colFeature: { width: 140, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 },
  colVal: { textAlign: 'right' as const, fontFamily: 'monospace', minWidth: 80 },

  kernelWrap: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { fontSize: 10, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },

  paramGrid: { display: 'flex', flexDirection: 'column', gap: 4 },
  paramRow: { display: 'flex', gap: 12, alignItems: 'center' },
  paramKey: { fontSize: 11, color: 'var(--t-text3)', width: 100 },
  paramVal: { fontSize: 11, fontFamily: 'monospace', color: 'var(--t-text)' },

  svBar: { display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--t-border)' },
  svSegment: { display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.2s', overflow: 'hidden', minWidth: 0 },
  svLabel: { fontSize: 9, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.4)' },
  svLegend: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  svLegendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--t-text3)', fontFamily: 'monospace' },
  svDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },

  interceptList: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  interceptChip: {
    fontSize: 10, fontFamily: 'monospace', color: 'var(--t-text2)',
    background: 'var(--t-chip)', border: '1px solid var(--t-trim)', borderRadius: 4, padding: '1px 6px',
    display: 'flex', gap: 5, alignItems: 'center',
  },
  priorClass: { color: 'var(--t-text4)', fontSize: 9 },

  noData: { padding: 24, color: 'var(--t-text4)', fontSize: 12, fontStyle: 'italic' },
};
