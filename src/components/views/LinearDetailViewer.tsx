// Linear model detail viewer.
// Shows the coefficient matrix and intercept from the resolved tensors,
// with feature names from the model schema.

import React, { useMemo } from 'react';
import type { Linear } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';
import { tvFloats, tvShape } from '../shared/tensorValue.ts';

interface Props {
  nodeName: string;
  linear: Linear;
  featureNames?: string[];
  featureTooltips?: string[];
  inputLabel?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(3);
  return v.toPrecision(4).replace(/\.?0+$/, '');
}


// ── Component ─────────────────────────────────────────────────────────────────

export function LinearDetailViewer({ nodeName: _nodeName, linear, featureNames = [], featureTooltips, inputLabel }: Props) {
  const { state } = useApp();
  const { model, inferenceSteps, inferenceStepIdx } = state;

  // Resolve tensor values (handles both inline tensor and tensor_ref)
  const coefData  = tvFloats(linear.coefficients, model);
  const intercData = tvFloats(linear.intercept, model);
  const coefShape = tvShape(linear.coefficients, model);
  // shape [nClasses, nFeatures] for multiclass, [nFeatures] for binary/regression
  const nClasses  = coefShape.length >= 2 ? coefShape[0] : 1;
  const nFeatures = coefShape.length >= 2 ? coefShape[1] : (coefShape[0] ?? 0);

  const multiclass = nClasses > 1;

  // Execution explain (if available)
  const activeStep = inferenceSteps && inferenceStepIdx >= 0 ? inferenceSteps[inferenceStepIdx] : null;
  const explain = activeStep?.explain?.type === 'linear' ? activeStep.explain : null;

  // Max abs coefficient for bar scaling
  const maxAbs = useMemo(() => {
    if (!coefData) return 1;
    return Math.max(...coefData.map(Math.abs), 1e-9);
  }, [coefData]);

  const props: [string, string][] = [
    ['Task',           linear.task_type     ?? '—'],
    ['Post-transform', linear.post_transform ?? 'IDENTITY'],
    ['Features',       nFeatures > 0 ? String(nFeatures) : '—'],
    ['Classes',        nClasses > 1  ? String(nClasses)  : '—'],
    ...(inputLabel ? [['Input', inputLabel] as [string, string]] : []),
  ];

  return (
    <div style={s.root}>
      {/* Properties */}
      <div style={s.propsRow}>
        {props.map(([k, v]) => (
          <div key={k} style={s.propCell}>
            <span style={s.propLabel}>{k}</span>
            <span style={s.propValue}>{v}</span>
          </div>
        ))}
      </div>

      {/* Execution explain summary */}
      {explain && (
        <div style={s.explainBar}>
          <span style={s.explainLabel}>Scores</span>
          {explain.finalScores.map((sc: number, i: number) => (
            <span key={i} style={s.scoreChip}>{multiclass ? `c${i}: ` : ''}{fmt(sc)}</span>
          ))}
        </div>
      )}

      {/* Coefficient matrix */}
      {coefData && nFeatures > 0 ? (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, ...s.colFeature }}>Feature</th>
                {multiclass
                  ? Array.from({ length: nClasses }, (_, i) => (
                      <th key={i} style={{ ...s.th, ...s.colCoef }}>Class {i}</th>
                    ))
                  : <th style={{ ...s.th, ...s.colCoef }}>Coefficient</th>
                }
                {!multiclass && <th style={{ ...s.th, ...s.colBar }} />}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nFeatures }, (_, fi) => {
                const coeffs = multiclass
                  ? Array.from({ length: nClasses }, (_, ci) => coefData[ci * nFeatures + fi] ?? 0)
                  : [coefData[fi] ?? 0];
                const name = featureNames[fi] ?? `f${fi}`;
                const tip  = featureTooltips?.[fi] ?? name;
                const absVal = Math.max(...coeffs.map(Math.abs));

                // highlight row from explain contributions
                const contrib = explain?.contributions?.find((c: { name: string }) => c.name === name);

                return (
                  <tr key={fi} style={{ background: fi % 2 === 1 ? 'var(--t-hover)' : 'transparent' }}>
                    <td style={{ ...s.td, ...s.colFeature, color: contrib ? 'var(--t-text)' : 'var(--t-text2)' }} title={tip}>
                      {name}
                    </td>
                    {coeffs.map((c, ci) => (
                      <td key={ci} style={{ ...s.td, ...s.colCoef, color: c >= 0 ? 'var(--t-edge-in)' : 'var(--t-err)' }}>
                        {fmt(c)}
                      </td>
                    ))}
                    {!multiclass && (
                      <td style={{ ...s.td, ...s.colBar }}>
                        <div style={s.barTrack}>
                          <div style={{
                            ...s.barFill,
                            width: `${Math.min(1, absVal / maxAbs) * 100}%`,
                            background: (coeffs[0] ?? 0) >= 0 ? 'var(--t-edge-in)' : 'var(--t-err)',
                          }} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* Intercept row */}
              {intercData && (
                <tr style={{ borderTop: '1px solid var(--t-frame)' }}>
                  <td style={{ ...s.td, ...s.colFeature, color: 'var(--t-text3)', fontStyle: 'italic' }}>
                    intercept
                  </td>
                  {multiclass
                    ? Array.from({ length: nClasses }, (_, ci) => (
                        <td key={ci} style={{ ...s.td, ...s.colCoef, color: 'var(--t-text3)' }}>
                          {fmt(intercData[ci] ?? 0)}
                        </td>
                      ))
                    : <>
                        <td style={{ ...s.td, ...s.colCoef, color: 'var(--t-text3)' }}>
                          {fmt(intercData[0] ?? 0)}
                        </td>
                        <td style={{ ...s.td, ...s.colBar }} />
                      </>
                  }
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={s.noData}>
          {coefData ? 'Empty coefficient tensor.' : 'Coefficient tensor data not embedded in model.'}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--t-canvas)' },

  propsRow: {
    display: 'flex', gap: 0, borderBottom: '1px solid var(--t-border)', flexShrink: 0,
  },
  propCell: {
    display: 'flex', flexDirection: 'column', padding: '8px 16px',
    borderRight: '1px solid var(--t-border)',
  },
  propLabel: { fontSize: 9, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  propValue: { fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' },

  explainBar: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    background: 'var(--t-surface)', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
    flexWrap: 'wrap',
  },
  explainLabel: { fontSize: 10, color: 'var(--t-text4)', marginRight: 4 },
  scoreChip: {
    fontSize: 10, fontFamily: 'monospace', color: 'var(--t-accent2)',
    background: 'var(--t-chip)', border: '1px solid var(--t-trim)', borderRadius: 4, padding: '1px 6px',
  },

  tableWrap: { flex: 1, overflowY: 'auto', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    position: 'sticky', top: 0, background: 'var(--t-surface2)',
    borderBottom: '1px solid var(--t-frame)', padding: '5px 8px',
    fontSize: 9, color: 'var(--t-text4)', textAlign: 'left',
    textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
  },
  td: { padding: '3px 8px', borderBottom: '1px solid var(--t-line)' },
  colFeature: { width: 120, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 },
  colCoef:    { textAlign: 'right' as const, fontFamily: 'monospace', minWidth: 72 },
  colBar:     { width: 80, paddingLeft: 8, paddingRight: 12 },
  barTrack:   { height: 6, background: 'var(--t-surface)', borderRadius: 2, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 2, transition: 'width 0.15s' },

  noData: { padding: 24, color: 'var(--t-text4)', fontSize: 12, fontStyle: 'italic' },
};
