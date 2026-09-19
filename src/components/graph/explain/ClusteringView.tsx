import React from 'react';
import type { ClusteringExplain } from '@openmle/omle.js';

const C = {
  header:   'var(--t-surface2)',
  border:   'var(--t-frame)',
  text:     'var(--t-text2)',
  dim:      'var(--t-text4)',
  label:    'var(--t-text4)',
  selected: 'var(--t-edge-out)',
  bar:      'var(--t-trim)',
  barFill:  'var(--t-accent)',
  barSel:   'var(--t-edge-out)',
  rowAlt:   'var(--t-hover)',
} as const;

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return '+∞';
  if (v === 0) return '0';
  return v.toPrecision(4).replace(/\.?0+$/, '');
}

export function ClusteringView({ explain }: { explain: ClusteringExplain }) {
  const { variant, distanceMeasure, distances, selectedCentroid } = explain;

  const sorted = [...distances].sort((a, b) => a.distance - b.distance);
  const maxDist = sorted.reduce((m, d) => Math.max(m, d.distance), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: C.header, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--t-chip)', border: '1px solid var(--t-trim)', borderRadius: 4, padding: '1px 5px' }}>
          {variant}
        </span>
        <span style={{ fontSize: 9, color: C.label }}>
          {distanceMeasure.toLowerCase().replace('_', ' ')}
        </span>
        <span style={{ fontSize: 9, color: C.selected, marginLeft: 'auto', fontFamily: 'monospace' }}>
          → cluster {selectedCentroid}
        </span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '3px 0', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 72, paddingLeft: 10, fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Centroid</div>
        <div style={{ flex: 1, paddingLeft: 6, fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distance</div>
        <div style={{ width: 60, fontSize: 9, color: C.label, textAlign: 'right', paddingRight: 10 }}>Value</div>
      </div>

      {/* Distance rows sorted by distance */}
      {sorted.map((d, i) => {
        const isSelected = d.centroidIndex === selectedCentroid;
        const pct = maxDist > 0 ? (d.distance / maxDist) * 100 : 0;
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', padding: '3px 0',
              background: isSelected ? 'var(--t-ok-bg)' : i % 2 === 1 ? C.rowAlt : 'transparent',
            }}
          >
            <div style={{ width: 72, paddingLeft: 10, fontSize: 10, color: isSelected ? C.selected : C.dim, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
              {isSelected && <span style={{ fontSize: 8, color: C.selected }}>●</span>}
              {!isSelected && <span style={{ fontSize: 8, color: 'transparent' }}>●</span>}
              {d.centroidIndex}
            </div>
            <div style={{ flex: 1, paddingLeft: 6, paddingRight: 10 }}>
              <div style={{ height: 6, background: C.bar, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: isSelected ? C.barSel : C.barFill, borderRadius: 2, transition: 'width 0.2s' }} />
              </div>
            </div>
            <div style={{ width: 60, fontSize: 10, color: isSelected ? C.selected : C.text, fontFamily: 'monospace', textAlign: 'right', paddingRight: 10, fontWeight: isSelected ? 600 : undefined }}>
              {fmt(d.distance)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
