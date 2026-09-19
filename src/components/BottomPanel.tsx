import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../App.tsx';
import { generateSampleInput } from '../sampleGenerator.ts';
import { VerificationView } from './views/VerificationView.tsx';

type Tab = 'logs' | 'validation' | 'inference' | 'verification';

export function BottomPanel() {
  const { state, dispatch, runInference } = useApp();
  const { logs, validation, model, inferenceInputJson, inferenceOutputJson, isRunningInference } = state;
  const [tab, setTab] = useState<Tab>('logs');
  const [sampleIdx, setSampleIdx] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const samples = model?.sample_inputs?.cases ?? [];

  const buildSampleJson = useCallback((idx: number): string => {
    const sc = samples[idx];
    if (!sc) return '{}';
    const inputs = model?.inputs ?? [];
    const tensors = model?.tensor_entries ?? [];
    const obj: Record<string, unknown> = {};
    (sc.inputs ?? []).forEach((ref, i) => {
      const inputName = inputs[i]?.name;
      if (!inputName) return;
      const entry = tensors.find(te => te.id === ref.id);
      if (entry?.dense) obj[inputName] = entry.dense;
    });
    return JSON.stringify(obj, null, 2);
  }, [samples, model]);

  // Auto-load first sample when a model with samples is loaded
  useEffect(() => {
    if (samples.length > 0) {
      setSampleIdx(0);
      dispatch({ type: 'SET_INFERENCE_INPUT', json: buildSampleJson(0) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    if (tab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, tab]);

  return (
    <div style={styles.root}>
      <div style={styles.tabBar}>
        <TabBtn label="Logs" active={tab === 'logs'} badge={logs.length > 0 ? logs.length : undefined} onClick={() => setTab('logs')} />
        <TabBtn label="Validation" active={tab === 'validation'} badge={validation?.errors.length || undefined} onClick={() => setTab('validation')} />
        <TabBtn label="Inference" active={tab === 'inference'} onClick={() => setTab('inference')} />
        {(model?.verification?.cases?.length ?? 0) > 0 && (
          <TabBtn label="Verification" active={tab === 'verification'} onClick={() => setTab('verification')} />
        )}
        <div style={{ flex: 1 }} />
        {tab === 'logs' && (
          <button style={styles.clearBtn} onClick={() => dispatch({ type: 'CLEAR_LOGS' })}>
            Clear
          </button>
        )}
      </div>

      <div style={styles.content}>
        {tab === 'logs' && (
          <div style={styles.logList}>
            {logs.length === 0 && <span style={styles.empty}>No log entries</span>}
            {logs.map(entry => (
              <div key={entry.id} style={{ ...styles.logEntry, ...logLevelStyle(entry.level) }}>
                <span style={styles.logTime}>{entry.timestamp.toLocaleTimeString()}</span>
                <span style={styles.logLevel}>{entry.level.toUpperCase()}</span>
                <span style={styles.logMsg}>{entry.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {tab === 'validation' && (
          <div style={styles.logList}>
            {!validation && <span style={styles.empty}>No model loaded</span>}
            {validation?.valid && (
              <div style={{ ...styles.logEntry, ...logLevelStyle('success') }}>
                <span style={styles.logLevel}>OK</span>
                <span style={styles.logMsg}>Model is valid</span>
              </div>
            )}
            {validation?.errors.map((issue, i) => (
              <div key={i} style={{ ...styles.logEntry, ...logLevelStyle('error') }}>
                <span style={styles.logLevel}>ERROR</span>
                <span style={styles.logCode}>[{issue.path}]</span>
                <span style={styles.logMsg}>{issue.message}</span>
              </div>
            ))}
            {validation?.warnings.map((issue, i) => (
              <div key={i} style={{ ...styles.logEntry, ...logLevelStyle('warn') }}>
                <span style={styles.logLevel}>WARN</span>
                <span style={styles.logCode}>[{issue.path}]</span>
                <span style={styles.logMsg}>{issue.message}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'verification' && <VerificationView />}

        {tab === 'inference' && (
          <div style={styles.inferenceLayout}>
            <div style={styles.inferenceCol}>
              <div style={styles.inferInputHeader}>
                <span style={styles.inferLabel}>Input JSON</span>
                {samples.length > 0 && (
                  <div style={styles.sampleNav}>
                    <span style={styles.sampleLabel}>
                      {samples[sampleIdx]?.description ?? `Sample ${sampleIdx}`}
                      {samples.length > 1 && <span style={styles.sampleCount}> {sampleIdx + 1}/{samples.length}</span>}
                    </span>
                    <button
                      style={{ ...styles.sampleBtn, opacity: sampleIdx > 0 ? 1 : 0.35 }}
                      disabled={sampleIdx <= 0}
                      onClick={() => {
                        const i = sampleIdx - 1;
                        const json = buildSampleJson(i);
                        setSampleIdx(i);
                        dispatch({ type: 'SET_INFERENCE_INPUT', json });
                        runInference(json);
                      }}
                      title="Previous sample"
                    >←</button>
                    <button
                      style={{ ...styles.sampleBtn, opacity: sampleIdx < samples.length - 1 ? 1 : 0.35 }}
                      disabled={sampleIdx >= samples.length - 1}
                      onClick={() => {
                        const i = sampleIdx + 1;
                        const json = buildSampleJson(i);
                        setSampleIdx(i);
                        dispatch({ type: 'SET_INFERENCE_INPUT', json });
                        runInference(json);
                      }}
                      title="Next sample"
                    >→</button>
                    <button
                      style={styles.sampleResetBtn}
                      onClick={() => {
                        dispatch({ type: 'SET_INFERENCE_INPUT', json: '{}' });
                        dispatch({ type: 'SET_INFERENCE_OUTPUT', json: null });
                      }}
                      title="Reset input"
                    >Reset</button>
                  </div>
                )}
                {model && (
                  <button
                    style={styles.generateBtn}
                    onClick={() => {
                      const json = generateSampleInput(model);
                      dispatch({ type: 'SET_INFERENCE_INPUT', json });
                      dispatch({ type: 'SET_INFERENCE_OUTPUT', json: null });
                    }}
                    title="Generate random sample input from model schema"
                  >⚄ Generate</button>
                )}
              </div>
              <textarea
                style={styles.jsonArea}
                value={inferenceInputJson}
                onChange={e => dispatch({ type: 'SET_INFERENCE_INPUT', json: e.target.value })}
                spellCheck={false}
                placeholder='{}'
              />
            </div>
            <div style={styles.inferActions}>
              <button
                style={{ ...styles.runBtn, opacity: (!model || isRunningInference) ? 0.5 : 1 }}
                disabled={!model || isRunningInference}
                onClick={() => runInference()}
              >
                {isRunningInference ? '…' : '▶ Run'}
              </button>
            </div>
            <div style={styles.inferenceCol}>
              <div style={styles.inferInputHeader}>
                <span style={styles.inferLabel}>Output JSON</span>
              </div>
              <pre style={styles.outputArea}>
                {inferenceOutputJson ?? (model ? 'Press ▶ Run to execute' : 'No model loaded')}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ label, active, badge, onClick }: {
  label: string; active: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button
      style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
      onClick={onClick}
    >
      {label}
      {badge !== undefined && <span style={styles.tabBadge}>{badge}</span>}
    </button>
  );
}

function logLevelStyle(level: string): React.CSSProperties {
  switch (level) {
    case 'error': return { color: 'var(--t-err)' };
    case 'warn': return { color: 'var(--t-warn)' };
    case 'success': return { color: 'var(--t-ok)' };
    default: return { color: 'var(--t-text3)' };
  }
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--t-bg)', overflow: 'hidden' },
  tabBar: {
    display: 'flex', alignItems: 'center', gap: 2,
    padding: '4px 10px 0',
    borderBottom: '1px solid var(--t-border)',
    flexShrink: 0,
  },
  tab: {
    background: 'none', border: 'none', borderBottom: '2px solid transparent',
    cursor: 'pointer', color: 'var(--t-text4)', fontSize: 11, padding: '3px 10px 5px',
    display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500,
  },
  tabActive: { color: 'var(--t-accent2)', borderBottom: '2px solid var(--t-accent)' },
  tabBadge: {
    fontSize: 9, background: 'var(--t-chip)', border: '1px solid var(--t-frame)',
    borderRadius: 8, padding: '1px 5px', color: 'var(--t-accent)',
  },
  clearBtn: {
    background: 'none', border: '1px solid var(--t-frame)', borderRadius: 4, cursor: 'pointer',
    color: 'var(--t-text4)', fontSize: 10, padding: '2px 8px',
  },
  content: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  logList: { flex: 1, overflowY: 'auto', padding: '4px 0', fontFamily: 'monospace', fontSize: 11 },
  logEntry: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 12px', lineHeight: 1.5 },
  logTime: { color: 'var(--t-muted)', flexShrink: 0, fontSize: 10 },
  logLevel: { flexShrink: 0, fontWeight: 700, width: 48 },
  logCode: { color: 'var(--t-accent)', flexShrink: 0 },
  logMsg: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: { color: 'var(--t-muted)', padding: '8px 14px', fontStyle: 'italic' },
  inferenceLayout: {
    flex: 1, display: 'flex', overflow: 'hidden', gap: 0,
  },
  inferenceCol: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '8px 10px' },
  inferInputHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, minHeight: 22 },
  inferLabel: { fontSize: 10, color: 'var(--t-text4)', fontWeight: 700, letterSpacing: '0.06em' },
  sampleNav: { display: 'flex', alignItems: 'center', gap: 4, flex: 1 },
  sampleBtn: {
    background: 'none', border: '1px solid var(--t-frame)', borderRadius: 3,
    cursor: 'pointer', color: 'var(--t-text3)', fontSize: 11, padding: '1px 6px', lineHeight: 1.4,
  },
  sampleLabel: { fontSize: 10, color: 'var(--t-text3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'center' as const },
  sampleCount: { color: 'var(--t-muted)' },
  sampleResetBtn: {
    background: 'none', border: '1px solid var(--t-frame)', borderRadius: 3,
    cursor: 'pointer', color: 'var(--t-text4)', fontSize: 10, padding: '1px 7px', lineHeight: 1.4, marginLeft: 2,
  },
  generateBtn: {
    background: 'none', border: '1px solid var(--t-frame)', borderRadius: 3,
    cursor: 'pointer', color: 'var(--t-accent)', fontSize: 10, padding: '1px 8px', lineHeight: 1.4,
    fontFamily: 'inherit', marginLeft: 'auto',
  },
  jsonArea: {
    flex: 1, fontFamily: 'monospace', fontSize: 11, background: 'var(--t-input)',
    border: '1px solid var(--t-frame)', borderRadius: 5, padding: 8, color: 'var(--t-accent2)',
    resize: 'none', outline: 'none',
  },
  outputArea: {
    flex: 1, fontFamily: 'monospace', fontSize: 11, background: 'var(--t-input)',
    border: '1px solid var(--t-frame)', borderRadius: 5, padding: 8, color: 'var(--t-text2)',
    overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  inferActions: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', padding: '0 8px', gap: 6,
  },
  runBtn: {
    background: 'var(--t-accent-bg)', border: '1px solid var(--t-accent)', borderRadius: 6,
    color: 'var(--t-accent2)', cursor: 'pointer', fontSize: 13, padding: '6px 14px', fontWeight: 600,
  },
};
