// Clustering model detail viewer.
// Shows centroid heatmap, GMM weights/variances, and inference-time distances.

import React from 'react';
import type { Clustering } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';
import { tvFloats, tvShape } from '../shared/tensorValue.ts';

interface Props {
  nodeName: string;
  clustering: Clustering;
  featureNames?: string[];
  featureTooltips?: string[];
  inputLabel?: string | null;
}

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
  return parseFloat(v.toPrecision(4)).toString();
}

// Per-column min/max for heat-mapping
function colMinMax(data: number[], nRows: number, nCols: number): { min: number; max: number }[] {
  return Array.from({ length: nCols }, (_, c) => {
    let min = Infinity, max = -Infinity;
    for (let r = 0; r < nRows; r++) {
      const v = data[r * nCols + c];
      if (isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    }
    return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 0 };
  });
}

function heatColor(t: number): string {
  // t in [0,1]: 0 = cool blue, 0.5 = neutral, 1 = warm red
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.5) {
    const a = (0.5 - clamped) * 2;
    return `rgba(80, 140, 255, ${(a * 0.45).toFixed(2)})`;
  } else {
    const a = (clamped - 0.5) * 2;
    return `rgba(255, 90, 70, ${(a * 0.45).toFixed(2)})`;
  }
}

export function ClusteringDetailViewer({ nodeName, clustering, featureNames = [], featureTooltips, inputLabel }: Props) {
  const { state } = useApp();
  const { inferenceSteps, inferenceStepIdx, model } = state;

  const isPrototype = !!clustering.prototype;
  const isGMM = !!clustering.gaussian_mixture;

  const variant = isPrototype ? 'Prototype (k-Means)' : isGMM ? 'Gaussian Mixture' : 'Unknown';
  const distMeasure = clustering.prototype?.distance_measure ?? (isGMM ? 'Mahalanobis' : '—');
  const covType = clustering.gaussian_mixture?.covariance_type;

  // ── Centroid tensors ──────────────────────────────────────────────────────────
  const centersTv = clustering.prototype?.centers ?? clustering.gaussian_mixture?.means;
  const centersData = tvFloats(centersTv, model);
  const centersShape = tvShape(centersTv, model);
  const nClusters = centersShape[0] ?? 0;
  const nFeatures = centersShape[1] ?? 0;

  // GMM weights and variances
  const weightsData = tvFloats(clustering.gaussian_mixture?.weights, model);

  const covsData = tvFloats(clustering.gaussian_mixture?.covariances, model);
  const covsShape = tvShape(clustering.gaussian_mixture?.covariances, model);

  // Cluster labels
  const rawLabels = clustering.prototype?.cluster_labels ?? clustering.gaussian_mixture?.component_labels;
  const clusterLabels: string[] = rawLabels?.map(s => {
    if (s.string_value !== undefined) return s.string_value;
    if (s.int_value !== undefined) return String(s.int_value);
    if (s.double_value !== undefined) return String(s.double_value);
    return '?';
  }) ?? [];

  const cname = (ci: number) => clusterLabels[ci] ?? `c${ci}`;
  const fname = (fi: number) => featureNames[fi] ?? `f${fi}`;
  const ftip  = (fi: number) => featureTooltips?.[fi] ?? fname(fi);

  // Per-feature heat scale
  const centersMM = centersData && nClusters > 0 && nFeatures > 0
    ? colMinMax(centersData, nClusters, nFeatures)
    : null;

  // Variances: for diagonal/spherical covs, shape [K, F] or [K] or [K, F, F]
  let varData: number[] | null = null;
  let varShape: number[] = [];
  if (covsData && covsShape.length >= 2 && covType !== 'FULL') {
    varData = covsData;
    varShape = covsShape;
  } else if (covsData && covsShape.length === 3 && covType === 'FULL') {
    // Extract diagonal from [K, F, F]
    const K = covsShape[0], F = covsShape[1];
    varData = Array.from({ length: K * F }, (_, i) => {
      const k = Math.floor(i / F), f = i % F;
      return covsData[k * F * F + f * F + f];
    });
    varShape = [K, F];
  }
  const varsMM = varData && varShape.length >= 2
    ? colMinMax(varData, varShape[0], varShape[1])
    : null;

  // ── Inference explain distances ───────────────────────────────────────────────
  const activeStep = inferenceSteps && inferenceStepIdx >= 0 ? inferenceSteps[inferenceStepIdx] : null;
  const explain = activeStep?.nodeId === `node:${nodeName}` && activeStep.explain?.type === 'clustering'
    ? activeStep.explain
    : null;
  const maxDist = explain ? Math.max(...explain.distances.map(d => d.distance), 1e-9) : null;

  return (
    <div style={s.root}>
      {/* Props bar */}
      <div style={s.propsRow}>
        {([
          ['Variant', variant],
          ['Clusters', nClusters > 0 ? String(nClusters) : '—'],
          ['Features', nFeatures > 0 ? String(nFeatures) : '—'],
          ['Distance', String(distMeasure)],
          ...(covType && covType !== 'COVARIANCE_TYPE_UNSPECIFIED' ? [['Cov type', covType]] : []),
          ...(inputLabel ? [['Input', inputLabel]] : []),
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} style={s.propCell}>
            <span style={s.propLabel}>{k}</span>
            <span style={s.propValue}>{v}</span>
          </div>
        ))}
      </div>

      <div style={s.body}>
        {/* GMM mixture weights bar */}
        {weightsData && weightsData.length > 0 && (
          <div style={s.weightsSection}>
            <div style={s.sectionTitle}>Mixture Weights</div>
            <div style={s.weightsBar}>
              {weightsData.map((w, ci) => {
                const pct = (w * 100).toFixed(1);
                return (
                  <div key={ci} style={{ ...s.weightSegment, width: `${w * 100}%`, background: clusterColor(ci, weightsData.length) }}
                       title={`${cname(ci)}: ${pct}%`}>
                    <span style={s.weightLabel}>{pct}%</span>
                  </div>
                );
              })}
            </div>
            <div style={s.weightLegend}>
              {weightsData.map((_, ci) => (
                <span key={ci} style={s.weightLegendItem}>
                  <span style={{ ...s.weightSwatch, background: clusterColor(ci, weightsData.length) }} />
                  {cname(ci)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Centroid heatmap */}
        {centersData && nClusters > 0 && nFeatures > 0 && (
          <div style={s.tableSection}>
            <div style={s.sectionTitle}>
              {isGMM ? 'Component Means' : 'Cluster Centers'}
              <span style={s.sectionHint}>heat-mapped per feature</span>
            </div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, ...s.thCluster }}></th>
                    {Array.from({ length: nFeatures }, (_, fi) => (
                      <th key={fi} style={s.th} title={ftip(fi)}>
                        <span style={s.thText}>{fname(fi)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: nClusters }, (_, ci) => {
                    const isSelected = explain?.selectedCentroid === ci;
                    return (
                      <tr key={ci} style={{ background: isSelected ? 'var(--t-active)' : 'transparent' }}>
                        <td style={{ ...s.td, ...s.tdCluster, color: isSelected ? 'var(--t-accent2)' : 'var(--t-text3)' }}>
                          {isSelected ? '●' : ''} {cname(ci)}
                        </td>
                        {Array.from({ length: nFeatures }, (_, fi) => {
                          const v = centersData[ci * nFeatures + fi];
                          const mm = centersMM?.[fi];
                          const range = mm ? mm.max - mm.min : 0;
                          const t = mm && range > 0 ? (v - mm.min) / range : 0.5;
                          return (
                            <td key={fi} style={{ ...s.td, ...s.tdVal, background: heatColor(t) }}>
                              {fmt(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* GMM variance heatmap */}
        {varData && varShape.length >= 2 && varShape[0] > 0 && varShape[1] > 0 && (
          <div style={s.tableSection}>
            <div style={s.sectionTitle}>
              Component Variances
              <span style={s.sectionHint}>diagonal of covariance</span>
            </div>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, ...s.thCluster }}></th>
                    {Array.from({ length: varShape[1] }, (_, fi) => (
                      <th key={fi} style={s.th} title={ftip(fi)}>
                        <span style={s.thText}>{fname(fi)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: varShape[0] }, (_, ci) => (
                    <tr key={ci}>
                      <td style={{ ...s.td, ...s.tdCluster }}>{cname(ci)}</td>
                      {Array.from({ length: varShape[1] }, (_, fi) => {
                        const v = varData![ci * varShape[1] + fi];
                        const mm = varsMM?.[fi];
                        const range = mm ? mm.max - mm.min : 0;
                        const t = mm && range > 0 ? (v - mm.min) / range : 0.5;
                        return (
                          <td key={fi} style={{ ...s.td, ...s.tdVal, background: heatColor(t), color: 'var(--t-text3)' }}>
                            {fmt(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Inference-time distances */}
        {explain && maxDist !== null && (
          <div style={s.tableSection}>
            <div style={s.sectionTitle}>Distances — current sample</div>
            {explain.distances
              .slice()
              .sort((a, b) => a.distance - b.distance)
              .map(d => {
                const isSelected = d.centroidIndex === explain.selectedCentroid;
                const pct = Math.max(3, (d.distance / maxDist) * 100);
                return (
                  <div key={d.centroidIndex}
                       style={{ ...s.distRow, background: isSelected ? 'var(--t-active)' : 'transparent' }}>
                    <span style={{ ...s.distLabel, color: isSelected ? 'var(--t-accent2)' : 'var(--t-text3)' }}>
                      {isSelected ? '● ' : ''}{cname(d.centroidIndex)}
                    </span>
                    <span style={s.distVal}>{fmt(d.distance)}</span>
                    <span style={s.distBarWrap}>
                      <span style={{ ...s.distBar, width: `${pct}%`, background: isSelected ? 'var(--t-accent)' : 'var(--t-frame)' }} />
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {!centersData && !explain && (
          <div style={s.empty}>No parameter tensors embedded in model.</div>
        )}
      </div>
    </div>
  );
}

// Distinct pastel colors for mixture weight segments
function clusterColor(ci: number, total: number): string {
  const hue = Math.round((ci / Math.max(total, 1)) * 360);
  return `hsl(${hue}, 55%, 55%)`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--t-canvas)' },

  propsRow: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-border)', flexShrink: 0 },
  propCell: { display: 'flex', flexDirection: 'column', padding: '8px 16px', borderRight: '1px solid var(--t-border)' },
  propLabel: { fontSize: 9, color: 'var(--t-text4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  propValue: { fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' },

  body: { flex: 1, overflowY: 'auto', padding: '0 0 24px' },

  sectionTitle: {
    fontSize: 10, fontWeight: 700, color: 'var(--t-text4)', textTransform: 'uppercase',
    letterSpacing: '0.06em', padding: '14px 16px 6px', display: 'flex', alignItems: 'center', gap: 8,
  },
  sectionHint: { fontSize: 9, color: 'var(--t-text4)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontStyle: 'italic' },

  // Mixture weights bar
  weightsSection: { padding: '14px 16px 0', borderBottom: '1px solid var(--t-border)' },
  weightsBar: {
    display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden',
    border: '1px solid var(--t-border)', marginBottom: 8,
  },
  weightSegment: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, color: '#fff', fontWeight: 600, minWidth: 0, overflow: 'hidden',
    background: 'var(--t-frame)', transition: 'width 0.2s',
  },
  weightLabel: { whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.4)' },
  weightLegend: { display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 14, fontSize: 11, color: 'var(--t-text3)' },
  weightLegendItem: { display: 'flex', alignItems: 'center', gap: 5 },
  weightSwatch: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },

  // Heatmap table
  tableSection: { borderBottom: '1px solid var(--t-border)' },
  tableWrap: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', fontSize: 11 },
  th: {
    position: 'sticky', top: 0, background: 'var(--t-surface2)',
    borderBottom: '1px solid var(--t-frame)', padding: '4px 6px',
    fontSize: 9, color: 'var(--t-text4)', textAlign: 'right',
    textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, whiteSpace: 'nowrap',
  },
  thCluster: { textAlign: 'left', minWidth: 70 },
  thText: { display: 'inline-block', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' },
  td: { padding: '4px 6px', borderBottom: '1px solid var(--t-line)' },
  tdCluster: {
    fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text2)',
    position: 'sticky', left: 0, background: 'var(--t-surface)', zIndex: 1,
    borderRight: '1px solid var(--t-border)', whiteSpace: 'nowrap', minWidth: 70,
  },
  tdVal: { textAlign: 'right', fontFamily: 'monospace', minWidth: 70, whiteSpace: 'nowrap' },

  // Distances
  distRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 16px', borderBottom: '1px solid var(--t-line)',
  },
  distLabel: { width: 80, flexShrink: 0, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  distVal: { width: 70, flexShrink: 0, textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text4)' },
  distBarWrap: { flex: 1, height: 4, background: 'var(--t-surface)', borderRadius: 2, overflow: 'hidden', display: 'block' },
  distBar: { height: '100%', borderRadius: 2, display: 'block', transition: 'width 0.2s' },

  empty: { padding: 24, color: 'var(--t-text4)', fontSize: 12, fontStyle: 'italic' },
};
