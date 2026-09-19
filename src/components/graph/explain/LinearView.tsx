import React from 'react';
import type { LinearExplain } from '@openmle/omle.js';

const C = {
  header:   'var(--t-surface2)',
  border:   'var(--t-frame)',
  text:     'var(--t-text2)',
  dim:      'var(--t-text4)',
  label:    'var(--t-text4)',
  pos:      'var(--t-edge-in)',
  neg:      'var(--t-err)',
  intercept:'var(--t-text3)',
  score:    'var(--t-accent2)',
  rowAlt:   'var(--t-hover)',
} as const;

function fmt(v: number, digits = 4): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
  return v.toPrecision(digits).replace(/\.?0+$/, '');
}

function ContribBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(1, Math.abs(value) / max) * 100 : 0;
  const isPos = value >= 0;
  return (
    <div style={{ width: 40, height: 6, background: 'var(--t-surface)', borderRadius: 2, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: isPos ? C.pos : C.neg, borderRadius: 2 }} />
    </div>
  );
}

function ContribRow({
  rank, name, value, coefficients: _coefficients, contributions, isIntercept, maxAbs, multiclass,
}: {
  rank?: number;
  name: string;
  value?: number;
  coefficients: number[];
  contributions: number[];
  isIntercept?: boolean;
  maxAbs: number;
  multiclass: boolean;
}) {
  const totalContrib = contributions.reduce((s, c) => s + c, 0);
  const isPos = totalContrib >= 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '2px 0', background: rank !== undefined && rank % 2 === 1 ? C.rowAlt : 'transparent' }}>
      {/* Feature name */}
      <div style={{ width: 100, paddingLeft: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: isIntercept ? C.intercept : C.text, fontFamily: 'monospace' }} title={name}>
        {name}
      </div>
      {/* Value */}
      <div style={{ width: 52, fontSize: 10, color: C.dim, fontFamily: 'monospace', textAlign: 'right', paddingRight: 8 }}>
        {value !== undefined ? fmt(value) : '—'}
      </div>
      {/* Per-class contributions */}
      {multiclass ? (
        <div style={{ flex: 1, display: 'flex', gap: 4, paddingRight: 8 }}>
          {contributions.map((c, i) => (
            <span key={i} style={{ fontSize: 9, color: c >= 0 ? C.pos : C.neg, fontFamily: 'monospace', minWidth: 40, textAlign: 'right' }}>
              {fmt(c)}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8 }}>
          <ContribBar value={contributions[0] ?? 0} max={maxAbs} />
          <span style={{ fontSize: 10, color: isPos ? C.pos : C.neg, fontFamily: 'monospace', minWidth: 48 }}>
            {fmt(contributions[0] ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
}

export function LinearView({ explain }: { explain: LinearExplain }) {
  const { intercept, contributions, rawScores, finalScores } = explain;
  const outWidth  = finalScores.length;
  const multiclass = outWidth > 2;

  const maxAbs = contributions.reduce((m, c) => Math.max(m, c.absContribution), 0);

  const ScoreRow = ({ label, scores, color }: { label: string; scores: number[]; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
      <span style={{ fontSize: 9, color: C.label, minWidth: 68 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {scores.map((s, i) => (
          <span key={i} style={{ fontSize: 10, color, fontFamily: 'monospace', background: 'var(--t-chip)', border: '1px solid var(--t-trim)', borderRadius: 4, padding: '1px 6px' }}>
            {outWidth > 1 ? `c${i}: ` : ''}{fmt(s)}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '4px 0', background: 'var(--t-surface2)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 100, paddingLeft: 10, fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature</div>
        <div style={{ width: 52, fontSize: 9, color: C.label, textAlign: 'right', paddingRight: 8 }}>Value</div>
        <div style={{ flex: 1, paddingLeft: 2, fontSize: 9, color: C.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {multiclass ? 'Contrib per class' : 'Contribution'}
        </div>
      </div>

      {/* Contributions (sorted by abs) */}
      {contributions.map((c, i) => (
        <ContribRow
          key={i}
          rank={i}
          name={c.name}
          value={c.value}
          coefficients={c.coefficients}
          contributions={c.contributions}
          maxAbs={maxAbs}
          multiclass={multiclass}
        />
      ))}

      {/* Intercept row */}
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <ContribRow
          name="intercept"
          value={undefined}
          coefficients={intercept}
          contributions={intercept}
          isIntercept
          maxAbs={maxAbs}
          multiclass={multiclass}
        />
      </div>

      {/* Score summary */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 2 }}>
        {rawScores.some((r, i) => Math.abs(r - finalScores[i]) > 1e-9) && (
          <ScoreRow label="raw score" scores={rawScores} color={C.dim} />
        )}
        <ScoreRow label="final score" scores={finalScores} color={C.score} />
      </div>
    </div>
  );
}
