import React, { useState } from 'react';
import type { Feature } from '@openmle/omle.js';
import { scalarToNumber } from '@openmle/omle.js';
import { JsonView } from '../shared/JsonView.tsx';
import { useApp } from '../../App.tsx';

export function FeatureView({ feature, displayName }: { feature: Feature; displayName?: string }) {
  const { state, dispatch } = useApp();

  const headerName = displayName ?? feature.name ?? (feature.range
    ? `${feature.range.prefix}[${feature.range.start ?? 0}…${feature.range.end - 1}]`
    : 'feature');
  const goToSource = () => {
    if (!feature.source) return;
    const idx = state.model?.inputs?.findIndex(i => i.name === feature.source) ?? -1;
    dispatch({ type: 'SET_SELECTION', selection: { kind: 'input', id: feature.source, index: idx >= 0 ? idx : undefined } });
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.icon}>ƒ</span>
        <span style={styles.name}>{headerName}</span>
        {feature.type?.shape && feature.type.shape.length > 0 && (
          <span style={styles.rankBadge}>{feature.type.shape.length}D</span>
        )}
        {feature.measure_level && feature.measure_level !== 'MEASURE_LEVEL_UNSPECIFIED' && (
          <span style={styles.badge}>{feature.measure_level}</span>
        )}
      </div>

      <div style={styles.content}>
        {feature.description && <p style={styles.desc}>{feature.description}</p>}

        {/* 1. Source */}
        {feature.source && (
          <Section label="Source">
            <SourceLink name={feature.source} onClick={goToSource} />
          </Section>
        )}

        {/* 2. Tensor type */}
        {feature.type && (
          <Section label="Tensor type">
            <PropGrid>
              <Prop k="dtype" v={feature.type.dtype ?? '—'} />
              {feature.type.shape && <Prop k="shape" v={`[${feature.type.shape.map(d => d <= 0 ? 'N' : d).join(', ')}]`} />}
            </PropGrid>
          </Section>
        )}

        {/* 3. Discrete domain */}
        {feature.domain?.discrete?.values && (
          <Section label="Discrete domain">
            <div style={styles.domainValues}>
              {feature.domain.discrete.values.slice(0, 50).map((dv, i) => (
                <span key={i} style={styles.domainValue}>
                  {String(dv?.value?.string_value ?? dv?.value?.double_value ?? dv?.value?.float_value ?? dv?.value?.int_value ?? '?')}
                </span>
              ))}
              {feature.domain.discrete.values.length > 50 && (
                <span style={styles.more}>+{feature.domain.discrete.values.length - 50} more</span>
              )}
            </div>
          </Section>
        )}

        {/* 4. Range domain (continuous) */}
        {feature.domain?.continuous?.intervals && (
          <Section label="Range domain">
            {feature.domain.continuous.intervals.map((iv, i) => (
              <div key={i} style={styles.interval}>
                {closureLeft(iv.closure)}{scalarToNumber(iv.left_margin)},&nbsp;{scalarToNumber(iv.right_margin)}{closureRight(iv.closure)}
              </div>
            ))}
          </Section>
        )}

        {/* 5. Raw */}
        <Section label="Raw">
          <JsonView value={feature} />
        </Section>
      </div>
    </div>
  );
}

function SourceLink({ name, onClick }: { name: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{ ...styles.sourceLink, ...(hovered ? styles.sourceLinkHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Go to input: ${name}`}
    >
      <span style={styles.sourceLinkArrow}>→</span>
      <span style={styles.sourceLinkName}>{name}</span>
    </button>
  );
}

function closureLeft(c?: string) {
  return (c === 'CLOSED_OPEN' || c === 'CLOSED_CLOSED') ? '[' : '(';
}
function closureRight(c?: string) {
  return (c === 'OPEN_CLOSED' || c === 'CLOSED_CLOSED') ? ']' : ')';
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      {children}
    </div>
  );
}

function PropGrid({ children }: { children: React.ReactNode }) {
  return <div style={styles.propGrid}>{children}</div>;
}

function Prop({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span style={styles.pk}>{k}</span>
      <span style={styles.pv}>{v}</span>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 10px', borderBottom: '1px solid var(--t-border)', flexShrink: 0 },
  icon: { fontSize: 15, color: 'var(--t-text3)' },
  name: { fontFamily: 'monospace', fontSize: 14, color: 'var(--t-text)' },
  rankBadge: { fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 10, padding: '2px 8px', color: 'var(--t-text3)', fontFamily: 'monospace' },
  badge: { fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 10, padding: '2px 8px', color: 'var(--t-accent)' },
  rangeBadge: { fontSize: 10, fontFamily: 'monospace', background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 4, padding: '1px 6px', color: 'var(--t-text4)' },
  content: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  desc: { color: 'var(--t-text3)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 },
  cardLabel: { fontSize: 11, fontWeight: 600, color: 'var(--t-text4)', marginBottom: 8 },
  propGrid: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', fontSize: 12 },
  pk: { color: 'var(--t-accent)' },
  pv: { color: 'var(--t-text2)', fontFamily: 'monospace', fontSize: 11 },
  sourceLink: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'var(--t-surface)', border: '1px solid var(--t-frame)',
    borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
    fontFamily: 'monospace', fontSize: 12, color: 'var(--t-text2)',
  },
  sourceLinkHover: { background: 'var(--t-active)', color: 'var(--t-text)' },
  sourceLinkArrow: { color: 'var(--t-accent)', fontSize: 13 },
  sourceLinkName: {},
  domainValues: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  domainValue: { background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text2)' },
  more: { color: 'var(--t-muted)', fontSize: 11, padding: '2px 8px' },
  interval: { fontFamily: 'monospace', fontSize: 12, color: 'var(--t-text2)', marginBottom: 2 },
};
