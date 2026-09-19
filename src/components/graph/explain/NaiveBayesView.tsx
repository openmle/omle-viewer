import React, { useState } from 'react';
import type { NaiveBayesExplain } from '@openmle/omle.js';

const C = {
  header:  'var(--t-surface2)',
  border:  'var(--t-frame)',
  text:    'var(--t-text2)',
  dim:     'var(--t-text4)',
  label:   'var(--t-text4)',
  pos:     'var(--t-edge-out)',
  neg:     'var(--t-err)',
  score:   'var(--t-accent2)',
  winner:  'var(--t-ok)',
  rowAlt:  'var(--t-hover)',
} as const;

function fmt(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
  return v.toPrecision(3).replace(/\.?0+$/, '');
}

const MAX_FEATURES = 20;

export function NaiveBayesView({ explain }: { explain: NaiveBayesExplain }) {
  const { variant, numClasses, logPriors, featureContributions, classLogScores } = explain;
  const [showAll, setShowAll] = useState(false);

  const winnerIdx = classLogScores.indexOf(Math.max(...classLogScores));
  const cols = Math.min(numClasses, 6);  // cap displayed classes

  const visible = showAll ? featureContributions : featureContributions.slice(0, MAX_FEATURES);

  const ClassHeader = () => (
    <div style={{ display: 'flex', gap: 0, padding: '4px 0', background: C.header, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 106, paddingLeft: 10, fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature</div>
      <div style={{ width: 42, fontSize: 9, color: C.label, textAlign: 'right', paddingRight: 6 }}>Value</div>
      {Array.from({ length: cols }, (_, c) => (
        <div key={c} style={{ flex: 1, fontSize: 9, color: c === winnerIdx ? C.winner : C.label, textAlign: 'right', paddingRight: 6 }}>
          c{c}
        </div>
      ))}
    </div>
  );

  const FeatureRow = ({ name, value, lls, rowIdx }: { name: string; value: number; lls: number[]; rowIdx: number }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '2px 0', background: rowIdx % 2 === 1 ? C.rowAlt : 'transparent' }}>
      <div style={{ width: 106, paddingLeft: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: C.text, fontFamily: 'monospace' }} title={name}>
        {name}
      </div>
      <div style={{ width: 42, fontSize: 10, color: C.dim, fontFamily: 'monospace', textAlign: 'right', paddingRight: 6 }}>
        {fmt(value)}
      </div>
      {lls.slice(0, cols).map((ll, c) => (
        <div key={c} style={{ flex: 1, fontSize: 9, color: ll >= 0 ? C.pos : C.neg, fontFamily: 'monospace', textAlign: 'right', paddingRight: 6 }}>
          {fmt(ll)}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* Variant badge + winner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: C.header, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--t-chip)', border: '1px solid var(--t-trim)', borderRadius: 4, padding: '1px 5px' }}>
          {variant}
        </span>
        <span style={{ fontSize: 9, color: C.label, marginLeft: 'auto' }}>
          winner:
        </span>
        <span style={{ fontSize: 10, color: C.winner, fontFamily: 'monospace' }}>
          class {winnerIdx} ({fmt(classLogScores[winnerIdx])})
        </span>
      </div>

      {/* Priors row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '3px 0', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 106, paddingLeft: 10, fontSize: 10, color: C.label, fontFamily: 'monospace' }}>log prior</div>
        <div style={{ width: 42 }} />
        {logPriors.slice(0, cols).map((p, c) => (
          <div key={c} style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: 'monospace', textAlign: 'right', paddingRight: 6 }}>
            {fmt(p)}
          </div>
        ))}
      </div>

      {/* Feature likelihood table */}
      <ClassHeader />
      {visible.map((fc, i) => (
        <FeatureRow key={i} name={fc.name} value={fc.value} lls={fc.logLikelihoods} rowIdx={i} />
      ))}

      {featureContributions.length > MAX_FEATURES && (
        <div
          style={{ padding: '4px 10px', cursor: 'pointer', fontSize: 10, color: 'var(--t-muted)', textAlign: 'center' }}
          onClick={() => setShowAll(s => !s)}
        >
          {showAll ? '▲ show less' : `▼ +${featureContributions.length - MAX_FEATURES} more`}
        </div>
      )}

      {/* Total class log scores */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '3px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ width: 106, paddingLeft: 10, fontSize: 10, color: C.label, fontFamily: 'monospace' }}>log score</div>
          <div style={{ width: 42 }} />
          {classLogScores.slice(0, cols).map((s, c) => (
            <div key={c} style={{ flex: 1, fontSize: 10, color: c === winnerIdx ? C.winner : C.score, fontFamily: 'monospace', textAlign: 'right', paddingRight: 6, fontWeight: c === winnerIdx ? 600 : undefined }}>
              {fmt(s)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
