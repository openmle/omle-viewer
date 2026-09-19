// Neural network (MLP) detail viewer.
// Props bar + architecture flow diagram + per-layer weight heatmap.

import React, { useState } from 'react';
import type { NeuralNetwork, DenseLayer, OMLEModel } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';
import { tvTensor } from '../shared/tensorValue.ts';

interface Props {
  nodeName: string;
  nn: NeuralNetwork;
  featureNames?: string[];
  featureTooltips?: string[];
  inputLabel?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_COLS = 64;
const MAX_ROWS = 64;

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(3);
  return v.toPrecision(4).replace(/\.?0+$/, '');
}

function heatColor(t: number): string {
  const r = Math.round(t < 0.5 ? 180 * (2 * t) : 180 + 75 * (2 * t - 1));
  const g = Math.round(t < 0.5 ? 180 * (2 * t) : 255 - 75 * (2 * t - 1));
  const b = Math.round(t < 0.5 ? 255 - 75 * (2 * t) : 255 * (1 - (2 * t - 1)));
  return `rgb(${r},${g},${b})`;
}

function resolveWeights(model: OMLEModel | null | undefined, layer: DenseLayer): { data: number[]; outW: number; inW: number } | null {
  const t = tvTensor(layer.weights, model);
  if (!t) return null;
  const data = (t.float64_data as number[] | undefined) ?? (t.float32_data as number[] | undefined);
  if (!data) return null;
  const shape = t.type?.shape?.map(Number) ?? [];
  return { data, outW: shape[0] ?? 0, inW: shape[1] ?? data.length };
}

function resolveBias(model: OMLEModel | null | undefined, layer: DenseLayer): number[] | null {
  const t = tvTensor(layer.bias, model);
  if (!t) return null;
  return (t.float64_data as number[] | undefined) ?? (t.float32_data as number[] | undefined) ?? null;
}

function layerShape(model: OMLEModel | null | undefined, layer: DenseLayer): { outW: number; inW: number } {
  const w = resolveWeights(model, layer);
  return w ? { outW: w.outW, inW: w.inW } : { outW: 0, inW: 0 };
}

function shortAct(act: string): string {
  switch (act) {
    case 'RELU':      return 'ReLU';
    case 'LOGISTIC':  return 'σ';
    case 'TANH':      return 'tanh';
    case 'SOFTMAX':   return 'softmax';
    case 'IDENTITY':  return 'id';
    default:          return act;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NeuralNetworkViewer({ nodeName: _nodeName, nn, featureNames = [], featureTooltips, inputLabel }: Props) {
  const { state } = useApp();
  const { model } = state;
  const [selectedIdx, setSelectedIdx] = useState(0);

  const layers = nn.layers ?? [];
  const shapes = layers.map(l => layerShape(model, l));

  const totalParams = shapes.reduce((sum, { outW, inW }, i) => {
    return sum + outW * inW + (layers[i].bias ? outW : 0);
  }, 0);

  const inputWidth  = shapes[0]?.inW  ?? 0;
  const outputWidth = shapes[shapes.length - 1]?.outW ?? 0;

  const propsBar: [string, string][] = [
    ['Task',       nn.task_type ?? '—'],
    ['Layers',     String(layers.length)],
    ['In width',   String(inputWidth)],
    ['Out width',  String(outputWidth)],
    ['Parameters', totalParams.toLocaleString()],
    ...(inputLabel ? [['Input', inputLabel] as [string, string]] : []),
  ];

  // Selected layer
  const activeLayer  = layers[selectedIdx];
  const activeShape  = shapes[selectedIdx] ?? { outW: 0, inW: 0 };
  const activeW      = activeLayer ? resolveWeights(model, activeLayer) : null;
  const activeBias   = activeLayer ? resolveBias(model, activeLayer) : null;
  const { outW, inW } = activeShape;

  // Heat normalization: symmetric around 0
  let absMax = 1e-9;
  if (activeW) {
    for (const v of activeW.data) absMax = Math.max(absMax, Math.abs(v));
  }

  // Column labels: feature names for layer 0, otherwise unit indices
  const colNames = selectedIdx === 0 && featureNames.length === inW
    ? featureNames
    : Array.from({ length: inW }, (_, i) => `u${i}`);
  const colTips = selectedIdx === 0 && featureNames.length === inW
    ? colNames.map((n, i) => featureTooltips?.[i] ?? n)
    : colNames;

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

      {/* Architecture flow */}
      <div style={s.arch}>
        <div style={s.archScroll}>
          <div style={s.archFlow}>
            {layers.map((layer, i) => {
              const { outW: lOut, inW: lIn } = shapes[i];
              const label = layer.name ?? `Layer ${i}`;
              const active = i === selectedIdx;
              return (
                <React.Fragment key={i}>
                  {i > 0 && <div style={s.arrow}>→</div>}
                  <div
                    style={{ ...s.box, ...(active ? s.boxActive : {}) }}
                    onClick={() => setSelectedIdx(i)}
                    title={`${label}: ${lIn}→${lOut}, ${layer.activation}${layer.bias ? ', bias' : ''}`}
                  >
                    <span style={s.boxLabel}>{label}</span>
                    <span style={s.boxDim}>{lIn}→{lOut}</span>
                    <span style={s.boxAct}>{shortAct(layer.activation)}</span>
                    {layer.bias && <span style={s.boxBias}>+b</span>}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weight heatmap */}
      {activeLayer && activeW ? (
        <div style={s.detail}>
          <div style={s.detailHeader}>
            <span style={s.detailTitle}>
              {activeLayer.name ?? `Layer ${selectedIdx}`} — weights ({outW} × {inW})
            </span>
            <span style={s.detailHint}>hover cell for value</span>
          </div>

          <div style={s.heatWrap}>
            {/* Column headers */}
            <div style={s.heatRow}>
              <span style={s.cornerCell} />
              {colNames.slice(0, MAX_COLS).map((cn, ci) => (
                <span key={ci} style={s.colLabel} title={colTips[ci] ?? cn}>{truncate(cn, 5)}</span>
              ))}
              {inW > MAX_COLS && <span style={{ ...s.colLabel, color: 'var(--t-muted)' }}>+{inW - MAX_COLS}</span>}
            </div>

            {/* Weight rows */}
            <div style={s.heatRows}>
              {Array.from({ length: Math.min(outW, MAX_ROWS) }, (_, ri) => (
                <div key={ri} style={s.heatRow}>
                  <span style={s.rowLabel}>{`u${ri}`}</span>
                  {Array.from({ length: Math.min(inW, MAX_COLS) }, (_, ci) => {
                    const w = activeW.data[ri * inW + ci];
                    const t = (w + absMax) / (2 * absMax);
                    return (
                      <span
                        key={ci}
                        style={{ ...s.heatCell, background: heatColor(Math.max(0, Math.min(1, t))) }}
                        title={`u${ri} × ${colTips[ci] ?? colNames[ci]}: ${fmt(w)}`}
                      />
                    );
                  })}
                </div>
              ))}
              {outW > MAX_ROWS && (
                <div style={{ ...s.heatRow, paddingLeft: 42 }}>
                  <span style={{ fontSize: 10, color: 'var(--t-muted)' }}>+{outW - MAX_ROWS} more rows…</span>
                </div>
              )}
            </div>

            {/* Bias strip */}
            {activeBias && activeBias.length > 0 && (
              <>
                <div style={{ ...s.heatRow, marginTop: 6 }}>
                  <span style={s.rowLabel}>bias</span>
                  {activeBias.slice(0, MAX_COLS).map((b, i) => {
                    const t = (b + absMax) / (2 * absMax);
                    return (
                      <span key={i} style={{ ...s.heatCell, background: heatColor(Math.max(0, Math.min(1, t))) }} title={`bias[${i}]: ${fmt(b)}`} />
                    );
                  })}
                  {activeBias.length > MAX_COLS && <span style={{ fontSize: 10, color: 'var(--t-muted)' }}>+{activeBias.length - MAX_COLS}</span>}
                </div>
              </>
            )}
          </div>

          {/* Legend */}
          <div style={s.legend}>
            <span style={{ ...s.legendDot, background: heatColor(0) }} />
            <span style={s.legendLabel}>{fmt(-absMax)}</span>
            <div style={s.legendGrad} />
            <span style={s.legendLabel}>0</span>
            <div style={s.legendGrad2} />
            <span style={s.legendLabel}>{fmt(absMax)}</span>
            <span style={{ ...s.legendDot, background: heatColor(1) }} />
          </div>
        </div>
      ) : activeLayer ? (
        <div style={s.detail}>
          <span style={{ color: 'var(--t-muted)', fontSize: 12 }}>Weight tensor not found in tensor_entries.</span>
        </div>
      ) : null}
    </div>
  );
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

  arch:       { flexShrink: 0, borderBottom: '1px solid var(--t-border)', padding: '12px 16px' },
  archScroll: { overflowX: 'auto' },
  archFlow:   { display: 'flex', alignItems: 'center', gap: 0, minWidth: 'max-content' },

  arrow: { fontSize: 14, color: 'var(--t-muted)', padding: '0 6px', flexShrink: 0 },

  box: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 12px', borderRadius: 6,
    border: '1px solid var(--t-border)', background: 'var(--t-node-bg)',
    cursor: 'pointer', flexShrink: 0, minWidth: 80,
    transition: 'border-color 0.12s, background 0.12s',
  },
  boxActive: {
    border: '1.5px solid var(--t-edge-out)', background: 'var(--t-ok-bg)',
  },
  boxLabel: { fontSize: 11, fontWeight: 600, color: 'var(--t-text)', whiteSpace: 'nowrap' },
  boxDim:   { fontSize: 10, color: 'var(--t-text4)', fontFamily: 'monospace', whiteSpace: 'nowrap' },
  boxAct:   { fontSize: 9, color: 'var(--t-edge-out)', fontFamily: 'monospace' },
  boxBias:  { fontSize: 9, color: 'var(--t-muted)' },

  detail:       { flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  detailHeader: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  detailTitle:  { fontSize: 12, fontWeight: 600, color: 'var(--t-text)' },
  detailHint:   { fontSize: 10, color: 'var(--t-muted)', fontStyle: 'italic' },

  heatWrap: { display: 'flex', flexDirection: 'column', gap: 0 },
  heatRows: { display: 'flex', flexDirection: 'column', gap: 0 },
  heatRow:  { display: 'flex', alignItems: 'center', gap: 1, minHeight: 14 },

  cornerCell: { width: 36, flexShrink: 0 },
  rowLabel:   { width: 36, flexShrink: 0, fontSize: 9, color: 'var(--t-text4)', fontFamily: 'monospace', textAlign: 'right', paddingRight: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  colLabel:   { width: 14, flexShrink: 0, fontSize: 8, color: 'var(--t-text4)', fontFamily: 'monospace', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', transform: 'rotate(-55deg)', transformOrigin: 'bottom left', height: 40, display: 'flex', alignItems: 'flex-end', marginBottom: 2 },
  heatCell:   { width: 14, height: 14, flexShrink: 0, borderRadius: 1, cursor: 'default' },

  legend:    { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 2, flexShrink: 0 },
  legendLabel: { fontSize: 10, color: 'var(--t-text4)', fontFamily: 'monospace', whiteSpace: 'nowrap' },
  legendGrad:  {
    width: 48, height: 10, borderRadius: 2, flexShrink: 0,
    background: 'linear-gradient(to right, rgb(0,0,255), rgb(180,180,180))',
  },
  legendGrad2: {
    width: 48, height: 10, borderRadius: 2, flexShrink: 0,
    background: 'linear-gradient(to right, rgb(180,180,180), rgb(255,105,105))',
  },
};
