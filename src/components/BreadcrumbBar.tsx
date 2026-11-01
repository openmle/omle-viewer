import React from 'react';
import { useApp } from '../App.tsx';

export function BreadcrumbBar({ onOpenJsonEditor }: { onOpenJsonEditor?: () => void }) {
  const { state, dispatch } = useApp();
  const { model, fileName, navHistory, navCursor } = state;

  if (!model) return null;

  const canBack    = navCursor > 0;
  const canForward = navCursor < navHistory.length - 1;

  const modelLabel = model.metadata?.name ?? fileName ?? 'Model';

  return (
    <div style={styles.root}>
      {/* Back / Forward */}
      <button
        style={{ ...styles.navBtn, opacity: canBack ? 1 : 0.3 }}
        disabled={!canBack}
        title="Back"
        onClick={() => dispatch({ type: 'NAV_BACK' })}
      >
        ←
      </button>
      <button
        style={{ ...styles.navBtn, opacity: canForward ? 1 : 0.3 }}
        disabled={!canForward}
        title="Forward"
        onClick={() => dispatch({ type: 'NAV_FORWARD' })}
      >
        →
      </button>

      <div style={styles.divider} />

      {/* Model root — always jumps to cursor 0 */}
      <button
        style={styles.seg}
        onClick={() => dispatch({ type: 'NAV_GOTO', cursor: 0 })}
        title={modelLabel}
      >
        {modelLabel}
      </button>

      {/* History segments */}
      {navHistory.slice(0, navCursor + 1).map((entry, i) => (
        <React.Fragment key={i}>
          <span style={styles.sep}>/</span>
          <button
            style={{ ...styles.seg, ...(i === navCursor ? styles.segActive : {}) }}
            onClick={() => dispatch({ type: 'NAV_GOTO', cursor: i })}
          >
            {entry.label}
          </button>
        </React.Fragment>
      ))}

      {/* JSON editor button */}
      {onOpenJsonEditor && (
        <>
          <div style={{ flex: 1 }} />
          <button style={styles.jsonBtn} title="Open JSON editor" onClick={onOpenJsonEditor}>
            {'{ }'}
          </button>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '0 10px',
    height: 32,
    flexShrink: 0,
    borderBottom: '1px solid var(--t-line)',
    background: 'var(--t-bg)',
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    fontSize: 12,
  },
  navBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--t-accent)',
    fontSize: 14,
    width: 24,
    height: 24,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'color 0.1s',
  },
  divider: {
    width: 1,
    height: 14,
    background: 'var(--t-frame)',
    margin: '0 4px',
    flexShrink: 0,
  },
  seg: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--t-text4)',
    fontSize: 12,
    padding: '2px 4px',
    borderRadius: 3,
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  segActive: {
    color: 'var(--t-text2)',
    fontWeight: 600,
    cursor: 'default',
  },
  sep: {
    color: 'var(--t-muted)',
    fontSize: 11,
    userSelect: 'none',
  },
  jsonBtn: {
    background: 'none', border: '1px solid var(--t-frame)', borderRadius: 4,
    cursor: 'pointer', color: 'var(--t-text4)',
    fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
    padding: '1px 7px', lineHeight: '18px',
  },
};
