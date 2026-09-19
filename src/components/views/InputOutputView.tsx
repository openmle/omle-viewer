import React, { useState } from 'react';
import type { InputSpec, OutputSpec, Feature } from '@openmle/omle.js';
import { JsonView } from '../shared/JsonView.tsx';
import { useApp } from '../../App.tsx';

export function InputOutputView({
  spec, kind, features = [],
}: { spec: InputSpec | OutputSpec; kind: 'input' | 'output'; features?: Feature[] }) {
  const { state, dispatch } = useApp();
  const allFeatures = state.model?.model_schema?.features ?? [];

  const role = 'role' in spec ? spec.role : undefined;
  const type = spec.type;

  const selectFeature = (id: string, feature: Feature) => {
    const globalIndex = allFeatures.indexOf(feature);
    dispatch({ type: 'SET_SELECTION', selection: { kind: 'feature', id, index: globalIndex >= 0 ? globalIndex : undefined } });
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.arrow}>{kind === 'input' ? '→' : '←'}</span>
        <span style={styles.name}>{spec.name}</span>
        {type?.shape && type.shape.length > 0 && (
          <span style={styles.rank}>{type.shape.length}D</span>
        )}
        {role && role !== 'OUTPUT_ROLE_UNSPECIFIED' && <span style={styles.role}>{role}</span>}
      </div>

      <div style={styles.content}>
        {spec.description && <p style={styles.desc}>{spec.description}</p>}

        <Section label="Tensor type">
          <PropGrid>
            <Prop k="dtype" v={type?.dtype ?? '—'} />
            <Prop k="shape" v={type?.shape ? `[${type.shape.map(d => d <= 0 ? 'N' : d).join(', ')}]` : '—'} />
          </PropGrid>
        </Section>

        {'binding' in spec && spec.binding && (
          <Section label="Binding">
            <PropGrid>
              {spec.binding.target_name && <Prop k="target" v={spec.binding.target_name} />}
              {spec.binding.segment_id && <Prop k="segment" v={spec.binding.segment_id} />}
              {spec.binding.rank !== undefined && <Prop k="rank" v={String(spec.binding.rank)} />}
              {spec.binding.values && spec.binding.values.length > 0 && (
                <Prop k="values" v={spec.binding.values.map(v =>
                  v?.string_value ?? v?.double_value ?? v?.float_value ?? v?.int_value ?? '?',
                ).join(', ')} />
              )}
            </PropGrid>
          </Section>
        )}

        {spec.attributes && Object.keys(spec.attributes).length > 0 && (
          <Section label="Attributes">
            <PropGrid>
              {Object.entries(spec.attributes).map(([k, v]) => (
                <Prop key={k} k={k} v={v} />
              ))}
            </PropGrid>
          </Section>
        )}

        {features.length > 0 && (() => {
          const rows = features.flatMap((f, i) => {
            if (f.range) {
              const { prefix, start = 0, end } = f.range;
              return Array.from({ length: end - start }, (_, k) => ({
                key: `${prefix}${start + k}`,
                name: `${prefix}${start + k}`,
                feature: f,
              }));
            }
            return [{ key: f.name ?? String(i), name: f.name ?? String(i), feature: f }];
          });
          return (
            <Section label={`Features (${rows.length})`}>
              {rows.map((r, colIdx) => (
                <FeatureRow
                  key={r.key}
                  index={colIdx}
                  showIndex={rows.length > 1}
                  name={r.name}
                  feature={r.feature}
                  active={state.selection?.kind === 'feature' && state.selection.id === r.name}
                  onClick={() => selectFeature(r.name, r.feature)}
                />
              ))}
            </Section>
          );
        })()}

        <Section label="Raw">
          <JsonView value={spec} />
        </Section>
      </div>
    </div>
  );
}

function FeatureRow({ feature: f, name, index, showIndex = true, active, onClick }: {
  feature: Feature; name: string; index: number; showIndex?: boolean; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const typeStr = f.type ? `${f.type.dtype}${f.type.shape?.length ? ` [${f.type.shape.map(d => d <= 0 ? 'N' : d).join('×')}]` : ''}` : null;
  const domainHint = f.domain?.discrete?.values
    ? `${f.domain.discrete.values.length} categories`
    : f.domain?.continuous?.intervals
    ? `${f.domain.continuous.intervals.length} interval${f.domain.continuous.intervals.length > 1 ? 's' : ''}`
    : null;

  return (
    <button
      style={{
        ...styles.featureRow,
        ...(active ? styles.featureRowActive : hovered ? styles.featureRowHover : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Open feature: ${name}`}
    >
      {showIndex && <span style={styles.featureIndex}>{index}</span>}
      <span style={styles.featureName}>{name}</span>
      <span style={styles.featureMeta}>
        {f.measure_level && f.measure_level !== 'MEASURE_LEVEL_UNSPECIFIED' && (
          <span style={styles.featureChip}>{f.measure_level}</span>
        )}
        {typeStr && <span style={styles.featureType}>{typeStr}</span>}
        {domainHint && <span style={styles.featureDomain}>{domainHint}</span>}
      </span>
      <span style={styles.featureArrow}>›</span>
    </button>
  );
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

function Prop({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <span style={styles.pk}>{k}</span>
      <span style={styles.pv}>{v}</span>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 20px 10px', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
  },
  arrow: { fontSize: 14, color: 'var(--t-text3)' },
  name: { fontFamily: 'monospace', fontSize: 14, color: 'var(--t-text)' },
  rank: {
    fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)',
    borderRadius: 10, padding: '2px 8px', color: 'var(--t-text3)', fontFamily: 'monospace',
  },
  role: {
    fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)',
    borderRadius: 10, padding: '2px 8px', color: 'var(--t-accent)',
  },
  content: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  desc: { color: 'var(--t-text3)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 },
  cardLabel: { fontSize: 11, fontWeight: 600, color: 'var(--t-text4)', marginBottom: 8 },
  propGrid: {
    display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', fontSize: 12,
  },
  pk: { color: 'var(--t-accent)' },
  pv: { color: 'var(--t-text2)', fontFamily: 'monospace', fontSize: 11 },
  featureRow: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '5px 6px', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
    borderBottom: '1px solid var(--t-line)',
    fontSize: 12, background: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 4,
  },
  featureRowHover: { background: 'var(--t-active)' },
  featureRowActive: { background: 'var(--t-active)' },
  featureIndex: { fontFamily: 'monospace', fontSize: 10, color: 'var(--t-muted)', flexShrink: 0 },
  featureName: { fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text2)', flexShrink: 0 },
  featureMeta: { display: 'flex', gap: 5, flexWrap: 'wrap' as const, alignItems: 'center', flex: 1 },
  featureArrow: { fontSize: 12, color: 'var(--t-text4)', flexShrink: 0 },
  featureChip: {
    fontSize: 9, padding: '1px 5px', borderRadius: 8,
    background: 'var(--t-chip)', border: '1px solid var(--t-frame)', color: 'var(--t-accent)',
  },
  featureType: { fontFamily: 'monospace', fontSize: 10, color: 'var(--t-text4)' },
  featureDomain: { fontSize: 10, color: 'var(--t-muted)', fontStyle: 'italic' },
};
