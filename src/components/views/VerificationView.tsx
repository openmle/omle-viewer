import React, { useState, useEffect } from 'react';
import { Engine, scalarToNumber, tensorToData } from '@openmle/omle.js';
import type { OMLEModel, VerificationCase, TensorData, TensorEntry } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OutputDiff {
  name: string;
  pass: boolean;
  maxAbsErr: number;
  maxRelErr: number;
  expectedData: number[];
  actualData: number[];
  shape: number[];
}

type CaseResult =
  | { status: 'pass'; outputJson: string; diffs: OutputDiff[]; durationMs: number }
  | { status: 'fail'; outputJson: string; diffs: OutputDiff[]; durationMs: number }
  | { status: 'error'; message: string; durationMs: number };

// ── Tensor resolution helpers ─────────────────────────────────────────────────

function buildTensorIndex(model: OMLEModel): Map<string, TensorEntry> {
  return new Map((model.tensor_entries ?? []).map(te => [te.id, te]));
}

function resolveInputJson(vc: VerificationCase, model: OMLEModel, index: Map<string, TensorEntry>): string {
  const inputs = model.inputs ?? [];
  const obj: Record<string, unknown> = {};
  (vc.inputs ?? []).forEach((ref, i) => {
    const entry = index.get(ref.id);
    if (!entry?.dense) return;
    const name = entry.dense.name ?? inputs[i]?.name ?? ref.id;
    const td = tensorToData(entry.dense);
    obj[name] = { dtype: td.dtype, shape: td.shape, data: Array.from(td.data as Iterable<unknown>) };
  });
  return JSON.stringify(obj, null, 2);
}

function compareTensors(actual: TensorData, expected: TensorData, atol: number, rtol: number, name: string): OutputDiff {
  const a = actual.data;
  const e = expected.data;
  let maxAbsErr = 0, maxRelErr = 0, pass = true;
  const n = a.length;
  if (n !== e.length) {
    return { name, pass: false, maxAbsErr: Infinity, maxRelErr: Infinity,
      expectedData: Array.from(e as Iterable<number>), actualData: Array.from(a as Iterable<number>), shape: actual.shape };
  }
  for (let i = 0; i < n; i++) {
    const ai = Number(a[i]), ei = Number(e[i]);
    const absErr = Math.abs(ai - ei);
    const relErr = Math.abs(ei) > 0 ? absErr / Math.abs(ei) : absErr;
    if (absErr > maxAbsErr) maxAbsErr = absErr;
    if (relErr > maxRelErr) maxRelErr = relErr;
    if (absErr > atol + rtol * Math.abs(ei)) pass = false;
  }
  return { name, pass, maxAbsErr, maxRelErr,
    expectedData: Array.from(e as Iterable<number>), actualData: Array.from(a as Iterable<number>), shape: actual.shape };
}

function runCase(model: OMLEModel, vc: VerificationCase, engine: Engine, atol: number, rtol: number): CaseResult {
  const index = buildTensorIndex(model);
  const inputs = model.inputs ?? [];
  const t0 = performance.now();
  try {
    const inferInputs: Record<string, TensorData> = {};
    for (const [i, ref] of (vc.inputs ?? []).entries()) {
      const entry = index.get(ref.id);
      if (!entry?.dense) throw new Error(`No dense tensor for input ref "${ref.id}"`);
      const name = entry.dense.name ?? inputs[i]?.name ?? ref.id;
      inferInputs[name] = tensorToData(entry.dense);
    }

    const output = engine.run(inferInputs);

    // Serialize actual output for display
    const serializable: Record<string, unknown> = {};
    for (const [name, td] of Object.entries(output)) {
      serializable[name] = { dtype: td.dtype, shape: td.shape, data: Array.from(td.data as Iterable<unknown>) };
    }
    const outputJson = JSON.stringify(serializable, null, 2);

    const diffs: OutputDiff[] = [];
    for (const [i, ref] of (vc.expected_outputs ?? []).entries()) {
      const entry = index.get(ref.id);
      if (!entry?.dense) throw new Error(`No dense tensor for expected output ref "${ref.id}"`);
      const expectedName = entry.dense.name ?? model.outputs?.[i]?.name ?? ref.id;
      const actual = output[expectedName];
      if (!actual) throw new Error(`Engine produced no output named "${expectedName}"`);
      diffs.push(compareTensors(actual, tensorToData(entry.dense), atol, rtol, expectedName));
    }

    const pass = diffs.length > 0 && diffs.every(d => d.pass);
    const durationMs = performance.now() - t0;
    return pass
      ? { status: 'pass', outputJson, diffs, durationMs }
      : { status: 'fail', outputJson, diffs, durationMs };
  } catch (e) {
    return { status: 'error', message: (e as Error).message, durationMs: performance.now() - t0 };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VerificationView() {
  const { state } = useApp();
  const { model } = state;
  const ver = model?.verification;

  const [caseIdx, setCaseIdx] = useState(0);
  const [result, setResult] = useState<CaseResult | null>(null);
  const [running, setRunning] = useState(false);

  // Reset result when case or model changes
  useEffect(() => { setResult(null); }, [caseIdx, model]);

  if (!model || !ver?.cases?.length) {
    return <div style={styles.empty}>No verification data</div>;
  }

  const cases = ver.cases;
  const vc = cases[caseIdx];
  const tolerance = ver.tolerance;
  const atol = tolerance?.atol != null ? scalarToNumber(tolerance.atol) : 1e-6;
  const rtol = tolerance?.rtol != null ? scalarToNumber(tolerance.rtol) : 1e-5;

  const index = buildTensorIndex(model);
  const inputJson = resolveInputJson(vc, model, index);

  function run() {
    if (!model || !vc) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const engine = new Engine(model);
        setResult(runCase(model, vc, engine, atol, rtol));
      } catch (e) {
        setResult({ status: 'error', message: (e as Error).message, durationMs: 0 });
      } finally {
        setRunning(false);
      }
    }, 0);
  }

  const statusColor = !result ? 'var(--t-text4)'
    : result.status === 'pass' ? 'var(--t-ok)'
    : result.status === 'fail' ? 'var(--t-err)'
    : 'var(--t-warn)';

  const statusLabel = !result ? null
    : result.status === 'pass' ? `✓ PASS`
    : result.status === 'fail' ? `✗ FAIL`
    : `! ERROR`;

  return (
    <div style={styles.root}>
      {/* Left — input JSON with case navigator in header */}
      <div style={styles.col}>
        <div style={styles.colHeader}>
          <span style={styles.colLabel}>Input</span>
          <div style={styles.caseNav}>
            <span style={styles.caseLabel}>
              {vc.description ?? `Case ${caseIdx + 1}`}
              <span style={styles.caseFraction}> {caseIdx + 1}/{cases.length}</span>
            </span>
            <button
              style={{ ...styles.navBtn, opacity: caseIdx > 0 ? 1 : 0.3 }}
              disabled={caseIdx <= 0}
              onClick={() => setCaseIdx(i => i - 1)}
            >←</button>
            <button
              style={{ ...styles.navBtn, opacity: caseIdx < cases.length - 1 ? 1 : 0.3 }}
              disabled={caseIdx >= cases.length - 1}
              onClick={() => setCaseIdx(i => i + 1)}
            >→</button>
          </div>
        </div>
        <pre style={styles.jsonPre}>{inputJson}</pre>
      </div>

      {/* Middle — controls */}
      <div style={styles.controls}>
        <button
          style={{ ...styles.runBtn, opacity: running ? 0.5 : 1 }}
          disabled={running}
          onClick={run}
        >
          {running ? '…' : '▶ Run'}
        </button>
      </div>

      {/* Right — result */}
      <div style={styles.col}>
        <div style={styles.colHeader}>
          <span style={styles.colLabel}>Output</span>
          <span style={styles.tol}>atol={fmtNum(atol)} rtol={fmtNum(rtol)}</span>
          {result && (
            <span style={{ ...styles.statusBadge, color: statusColor, marginLeft: 'auto' }}>
              {statusLabel}
              {result.status !== 'error' && (
                <span style={styles.timing}> {result.durationMs.toFixed(1)}ms</span>
              )}
            </span>
          )}
        </div>
        <div style={styles.resultArea}>
          {!result && (
            <span style={styles.placeholder}>Press ▶ Run to verify</span>
          )}
          {result?.status === 'error' && (
            <span style={{ color: 'var(--t-err)', fontFamily: 'monospace', fontSize: 11 }}>{result.message}</span>
          )}
          {(result?.status === 'pass' || result?.status === 'fail') && (
            <>
              {result.status === 'pass' ? (
                <pre style={{ ...styles.jsonPre, flex: 1 }}>{result.outputJson}</pre>
              ) : (
                <div style={styles.diffList}>
                  {result.diffs.map((d, i) => (
                    <DiffBlock key={i} diff={d} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Diff block ────────────────────────────────────────────────────────────────

function DiffBlock({ diff }: { diff: OutputDiff }) {
  const MAX_SHOW = 20;
  const n = diff.actualData.length;
  const rows = Math.min(n, MAX_SHOW);

  return (
    <div style={styles.diffBlock}>
      <div style={styles.diffHeader}>
        <span style={styles.diffName}>{diff.name}</span>
        <span style={{ ...styles.diffBadge, color: diff.pass ? 'var(--t-ok)' : 'var(--t-err)' }}>
          {diff.pass ? 'PASS' : 'FAIL'}
        </span>
        <span style={styles.diffStats}>
          max abs {fmtNum(diff.maxAbsErr)} · max rel {fmtNum(diff.maxRelErr)} · shape [{diff.shape.join('×')}]
        </span>
      </div>
      {!diff.pass && (
        <table style={styles.diffTable}>
          <thead>
            <tr>
              <th style={styles.th}>i</th>
              <th style={styles.th}>expected</th>
              <th style={styles.th}>actual</th>
              <th style={styles.th}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => {
              const exp = diff.expectedData[i];
              const act = diff.actualData[i];
              const delta = act - exp;
              const bad = Math.abs(delta) > 0;
              return (
                <tr key={i} style={bad ? styles.badRow : undefined}>
                  <td style={styles.td}>{i}</td>
                  <td style={styles.tdMono}>{fmtVal(exp)}</td>
                  <td style={styles.tdMono}>{fmtVal(act)}</td>
                  <td style={{ ...styles.tdMono, color: bad ? 'var(--t-err)' : 'var(--t-text4)' }}>
                    {delta >= 0 ? '+' : ''}{fmtVal(delta)}
                  </td>
                </tr>
              );
            })}
            {n > MAX_SHOW && (
              <tr>
                <td colSpan={4} style={{ ...styles.td, color: 'var(--t-text4)', fontStyle: 'italic' }}>
                  … {n - MAX_SHOW} more rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n === 0) return '0';
  return n < 0.001 ? n.toExponential(2) : n.toPrecision(3);
}

function fmtVal(n: number): string {
  if (!isFinite(n)) return String(n);
  return Math.abs(n) < 1e-4 || Math.abs(n) >= 1e6 ? n.toExponential(4) : n.toPrecision(6);
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100%', overflow: 'hidden', gap: 0 },
  col: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '8px 10px' },
  colHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexShrink: 0, minHeight: 22 },
  colLabel: { fontSize: 10, color: 'var(--t-text4)', fontWeight: 700, letterSpacing: '0.06em' },
  tol: { fontSize: 10, color: 'var(--t-text4)', fontFamily: 'monospace' },
  jsonPre: {
    flex: 1, margin: 0, fontFamily: 'monospace', fontSize: 11,
    background: 'var(--t-input)', border: '1px solid var(--t-frame)', borderRadius: 5,
    padding: 8, color: 'var(--t-text2)', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  resultArea: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: 'var(--t-input)', border: '1px solid var(--t-frame)', borderRadius: 5, padding: 8,
  },
  placeholder: { color: 'var(--t-muted)', fontStyle: 'italic', fontSize: 11 },
  controls: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', padding: '0 8px', gap: 8, flexShrink: 0,
  },
  caseNav: { display: 'flex', alignItems: 'center', gap: 4, flex: 1 },
  navBtn: {
    background: 'none', border: '1px solid var(--t-frame)', borderRadius: 3,
    cursor: 'pointer', color: 'var(--t-text3)', fontSize: 11, padding: '1px 7px', lineHeight: 1.4,
  },
  caseLabel: {
    fontSize: 10, color: 'var(--t-text3)', fontFamily: 'monospace',
    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center',
  },
  caseFraction: { color: 'var(--t-muted)' },
  runBtn: {
    background: 'var(--t-accent-bg)', border: '1px solid var(--t-accent)', borderRadius: 6,
    color: 'var(--t-accent2)', cursor: 'pointer', fontSize: 13, padding: '6px 14px', fontWeight: 600,
  },
  statusBadge: { fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
  timing: { fontSize: 10, fontWeight: 400, color: 'var(--t-text4)' },
  diffList: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 },
  diffBlock: { display: 'flex', flexDirection: 'column', gap: 6 },
  diffHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  diffName: { fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--t-text)' },
  diffBadge: { fontSize: 10, fontWeight: 700, fontFamily: 'monospace' },
  diffStats: { fontSize: 10, color: 'var(--t-text4)', fontFamily: 'monospace' },
  diffTable: { borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'monospace' },
  th: { textAlign: 'left', color: 'var(--t-text4)', fontWeight: 600, padding: '2px 8px 2px 0', borderBottom: '1px solid var(--t-frame)' },
  td: { padding: '2px 8px 2px 0', color: 'var(--t-text3)' },
  tdMono: { padding: '2px 8px 2px 0', color: 'var(--t-text2)' },
  badRow: { background: 'var(--t-err-bg, rgba(255,80,80,0.06))' },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t-muted)', fontSize: 12 },
};
