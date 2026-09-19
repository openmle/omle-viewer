// Scope view: lists names visible at each execution step for debugging name resolution.

import React, { useState } from 'react';
import type { ScopeStep } from './layout.ts';

interface ScopeViewProps {
  steps: ScopeStep[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

export function ScopeView({ steps, selectedNodeId, onSelectNode }: ScopeViewProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0]));

  const toggleStep = (i: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Scope View</span>
        <span style={styles.headerHint}>{steps.length} steps</span>
      </div>
      <div style={styles.list}>
        {steps.map((step, i) => {
          const isExpanded = expandedSteps.has(i);
          const isSelected = step.nodeId === selectedNodeId;
          return (
            <div key={i} style={{ ...styles.step, ...(isSelected ? styles.stepSelected : {}) }}>
              <div
                style={styles.stepHeader}
                onClick={() => {
                  toggleStep(i);
                  if (step.nodeId) onSelectNode(step.nodeId);
                }}
              >
                <span style={styles.stepChevron}>{isExpanded ? '▾' : '▸'}</span>
                <span style={{ ...styles.stepLabel, ...(isSelected ? styles.stepLabelSelected : {}) }}>
                  {step.label}
                </span>
                <span style={styles.stepCount}>+{step.addedNames.length}</span>
                <span style={styles.stepTotal}>{step.allNames.length} total</span>
              </div>
              {isExpanded && (
                <div style={styles.nameList}>
                  {step.addedNames.length > 0 && (
                    <div style={styles.sectionLabel}>Added</div>
                  )}
                  {step.addedNames.map(name => (
                    <span key={name} style={{ ...styles.name, ...styles.nameAdded }}>{name}</span>
                  ))}
                  {step.allNames.length > step.addedNames.length && (
                    <>
                      <div style={styles.sectionLabel}>All visible</div>
                      {step.allNames.map(name => (
                        <span
                          key={name}
                          style={{
                            ...styles.name,
                            ...(step.addedNames.includes(name) ? styles.nameAdded : styles.nameInherited),
                          }}
                        >
                          {name}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 240,
    background: 'var(--t-bg)',
    borderLeft: '1px solid var(--t-border)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 10,
    overflow: 'hidden',
  },
  header: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--t-border)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerTitle: { fontSize: 12, fontWeight: 600, color: 'var(--t-text3)' },
  headerHint: { fontSize: 10, color: 'var(--t-muted)', marginLeft: 'auto' },
  list: { flex: 1, overflowY: 'auto', padding: '4px 0' },
  step: {
    borderBottom: '1px solid var(--t-line)',
  },
  stepSelected: {
    background: 'var(--t-hover)',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 10px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  stepChevron: { color: 'var(--t-muted)', fontSize: 10, width: 10, flexShrink: 0 },
  stepLabel: { fontSize: 11, color: 'var(--t-accent)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  stepLabelSelected: { color: 'var(--t-accent2)' },
  stepCount: {
    fontSize: 9, color: 'var(--t-text3)', background: 'var(--t-chip)',
    border: '1px solid var(--t-frame)', borderRadius: 8, padding: '1px 5px',
  },
  stepTotal: { fontSize: 9, color: 'var(--t-faint)' },
  nameList: {
    padding: '0 10px 8px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sectionLabel: { fontSize: 9, color: 'var(--t-faint)', marginTop: 4, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' },
  name: {
    fontSize: 10,
    fontFamily: 'monospace',
    padding: '1px 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameAdded: { color: 'var(--t-text3)' },
  nameInherited: { color: 'var(--t-muted)' },
};
