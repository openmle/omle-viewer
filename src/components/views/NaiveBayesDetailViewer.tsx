// Naive Bayes detail viewer.
// Shows class log-priors and per-feature parameters for all four NB variants.

import React from 'react';
import type { NaiveBayes } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';
import { tvFloats, tvShape } from '../shared/tensorValue.ts';

interface Props {
  nodeName: string;
  nb: NaiveBayes;
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

export function NaiveBayesDetailViewer({ nodeName: _nodeName, nb, featureNames = [], featureTooltips, inputLabel }: Props) {
  const { state } = useApp();
  const { model } = state;

  const priorData = tvFloats(nb.class_log_priors, model);
  const nClasses  = priorData?.length ?? 0;

  const variant = nb.gaussian ? 'Gaussian'
    : nb.multinomial  ? 'Multinomial'
    : nb.bernoulli    ? 'Bernoulli'
    : nb.categorical  ? 'Categorical'
    : 'Unknown';

  // ── Resolve per-variant tensors ───────────────────────────────────────────

  // Gaussian
  const gauss   = nb.gaussian;
  const gMeans  = tvFloats(gauss?.means, model);
  const gVars   = tvFloats(gauss?.variances, model);
  const gShape  = tvShape(gauss?.means, model);
  const nFeatG  = gShape.length >= 2 ? gShape[1] : (gShape[0] ?? 0);

  // Multinomial / Bernoulli — shape [nClasses, nFeatures]
  const flpTv   = nb.multinomial?.feature_log_prob ?? nb.bernoulli?.feature_log_prob;
  const flpData = tvFloats(flpTv, model);
  const flpShape = tvShape(flpTv, model);
  const nFeatF  = flpShape.length >= 2 ? flpShape[1] : (flpShape[0] ?? 0);

  // Categorical
  const cat     = nb.categorical;
  const catLP   = tvFloats(cat?.category_log_prob, model);
  const catOff  = cat?.category_offset ?? [];
  const catCnt  = cat?.category_count ?? [];
  const nFeatC  = catOff.length > 0 ? catOff.length - 1 : catCnt.length;

  const nFeatures = nb.gaussian ? nFeatG : nb.categorical ? nFeatC : nFeatF;

  const fname = (fi: number) => featureNames[fi] ?? `f${fi}`;
  const ftip  = (fi: number) => featureTooltips?.[fi] ?? fname(fi);

  return (
    <div style={s.root}>
      {/* Props bar */}
      <div style={s.propsRow}>
        {([
          ['Variant',  variant],
          ['Task',     nb.task_type ?? '—'],
          ['Classes',  nClasses > 0 ? String(nClasses) : '—'],
          ['Features', nFeatures > 0 ? String(nFeatures) : '—'],
          ...(inputLabel ? [['Input', inputLabel]] : []),
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} style={s.propCell}>
            <span style={s.propLabel}>{k}</span>
            <span style={s.propValue}>{v}</span>
          </div>
        ))}
      </div>

      {/* Class log-priors */}
      {priorData && priorData.length > 0 && (
        <div style={s.priorsBar}>
          <span style={s.priorsLabel}>Class log-priors</span>
          {priorData.map((lp, ci) => (
            <span key={ci} style={s.priorChip}>
              <span style={s.priorClass}>c{ci}</span>
              {fmt(lp)}
            </span>
          ))}
        </div>
      )}

      <div style={s.tableWrap}>
        {/* ── Gaussian ── */}
        {nb.gaussian && gMeans && gVars && nFeatG > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, ...s.colFeature }}>Feature</th>
                {Array.from({ length: nClasses }, (_, ci) => (
                  <React.Fragment key={ci}>
                    <th style={{ ...s.th, ...s.colVal }}>c{ci} mean</th>
                    <th style={{ ...s.th, ...s.colVal }}>c{ci} var</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nFeatG }, (_, fi) => (
                <tr key={fi} style={{ background: fi % 2 === 1 ? 'var(--t-hover)' : 'transparent' }}>
                  <td style={{ ...s.td, ...s.colFeature }} title={ftip(fi)}>{fname(fi)}</td>
                  {Array.from({ length: nClasses }, (_, ci) => (
                    <React.Fragment key={ci}>
                      <td style={{ ...s.td, ...s.colVal }}>{fmt(gMeans[ci * nFeatG + fi] ?? 0)}</td>
                      <td style={{ ...s.td, ...s.colVal, color: 'var(--t-text3)' }}>{fmt(gVars[ci * nFeatG + fi] ?? 0)}</td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Multinomial / Bernoulli ── */}
        {(nb.multinomial || nb.bernoulli) && flpData && nFeatF > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, ...s.colFeature }}>Feature</th>
                {Array.from({ length: nClasses }, (_, ci) => (
                  <th key={ci} style={{ ...s.th, ...s.colVal }}>c{ci} log-p</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nFeatF }, (_, fi) => (
                <tr key={fi} style={{ background: fi % 2 === 1 ? 'var(--t-hover)' : 'transparent' }}>
                  <td style={{ ...s.td, ...s.colFeature }} title={ftip(fi)}>{fname(fi)}</td>
                  {Array.from({ length: nClasses }, (_, ci) => (
                    <td key={ci} style={{ ...s.td, ...s.colVal }}>
                      {fmt(flpData[ci * nFeatF + fi] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Categorical ── */}
        {nb.categorical && catLP && nFeatC > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, ...s.colFeature }}>Feature / Category</th>
                {Array.from({ length: nClasses }, (_, ci) => (
                  <th key={ci} style={{ ...s.th, ...s.colVal }}>c{ci} log-p</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nFeatC }, (_, fi) => {
                const start = catOff[fi] ?? 0;
                const count = catCnt[fi] ?? (catOff[fi + 1] !== undefined ? catOff[fi + 1] - start : 0);
                return (
                  <React.Fragment key={fi}>
                    <tr style={{ background: 'var(--t-surface2)' }}>
                      <td colSpan={1 + nClasses} style={{ ...s.td, ...s.catHeader }} title={ftip(fi)}>
                        {fname(fi)}
                        <span style={s.catCount}>{count} categories</span>
                      </td>
                    </tr>
                    {Array.from({ length: count }, (_, catIdx) => {
                      const absIdx = start + catIdx;
                      return (
                        <tr key={catIdx} style={{ background: catIdx % 2 === 0 ? 'var(--t-hover)' : 'transparent' }}>
                          <td style={{ ...s.td, ...s.colFeature, paddingLeft: 24, color: 'var(--t-text3)' }}>
                            val {catIdx}
                          </td>
                          {Array.from({ length: nClasses }, (_, ci) => (
                            <td key={ci} style={{ ...s.td, ...s.colVal }}>
                              {fmt(catLP[ci * (catLP.length / nClasses) + absIdx] ?? 0)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {nFeatures === 0 && (
          <div style={s.noData}>No parameter tensors embedded in model.</div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--t-canvas)' },

  propsRow: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-border)', flexShrink: 0 },
  propCell: { display: 'flex', flexDirection: 'column', padding: '8px 16px', borderRight: '1px solid var(--t-border)' },
  propLabel: { fontSize: 9, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  propValue: { fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' },

  priorsBar: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', flexWrap: 'wrap',
    background: 'var(--t-surface)', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
  },
  priorsLabel: { fontSize: 10, color: 'var(--t-text4)', marginRight: 4 },
  priorChip: {
    fontSize: 10, fontFamily: 'monospace', color: 'var(--t-text2)',
    background: 'var(--t-chip)', border: '1px solid var(--t-trim)', borderRadius: 4, padding: '1px 6px',
    display: 'flex', gap: 5, alignItems: 'center',
  },
  priorClass: { color: 'var(--t-text4)', fontSize: 9 },

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
  colVal:     { textAlign: 'right' as const, fontFamily: 'monospace', minWidth: 80 },

  catHeader: { fontFamily: 'monospace', fontSize: 10, color: 'var(--t-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  catCount:  { fontSize: 9, color: 'var(--t-text4)', fontWeight: 400 },

  noData: { padding: 24, color: 'var(--t-text4)', fontSize: 12, fontStyle: 'italic' },
};
