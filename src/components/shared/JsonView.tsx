import React, { useState } from 'react';

// ── Public component ──────────────────────────────────────────────────────────

export function JsonView({ value, inline = false }: { value: unknown; inline?: boolean }) {
  const [expandDepth, setExpandDepth] = useState(2);
  const [treeKey, setTreeKey] = useState(0);
  const isExpanded = expandDepth === Infinity;

  const rootStyle = inline
    ? { ...s.rootInline, position: 'relative' as const }
    : { ...s.root, position: 'relative' as const };

  return (
    <div style={rootStyle}>
      <button
        style={s.expandBtn}
        onClick={() => {
          const next = isExpanded ? 2 : Infinity;
          setExpandDepth(next);
          setTreeKey(k => k + 1);
        }}
        title={isExpanded ? 'Collapse to default depth' : 'Expand all nodes'}
      >
        {isExpanded ? '⊟' : '⊞'}
      </button>
      <div key={treeKey}>
        <JsonNode value={value} depth={0} defaultOpenDepth={expandDepth} />
      </div>
    </div>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

function JsonNode({ value, depth, defaultOpenDepth }: { value: unknown; depth: number; defaultOpenDepth: number }) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);

  // Primitives
  if (value === null) return <span style={s.null}>null</span>;
  if (typeof value === 'boolean') return <span style={s.bool}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={s.num}>{value}</span>;
  if (typeof value === 'string') return <span style={s.str}>"{value}"</span>;
  if (typeof value !== 'object') return <span style={s.str}>{String(value)}</span>;

  const isArray = Array.isArray(value);
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);

  const ob = isArray ? '[' : '{';
  const cb = isArray ? ']' : '}';
  const summary = `${entries.length} ${isArray ? (entries.length === 1 ? 'item' : 'items') : (entries.length === 1 ? 'key' : 'keys')}`;

  if (entries.length === 0) {
    return <span style={s.bracket}>{ob}{cb}</span>;
  }

  if (!open) {
    return (
      <button style={s.collapsed} onClick={() => setOpen(true)}>
        <span style={s.chevron}>▶</span>
        <span style={s.bracket}>{ob}</span>
        <span style={s.summary}>{summary}</span>
        <span style={s.bracket}>{cb}</span>
      </button>
    );
  }

  return (
    <span style={s.expandedWrap}>
      <button style={s.openHeader} onClick={() => setOpen(false)}>
        <span style={s.chevron}>▼</span>
        <span style={s.bracket}>{ob}</span>
      </button>
      <div style={s.children}>
        {entries.map(([key, val], i) => (
          <div key={key} style={s.entry}>
            {!isArray && (
              <>
                <span style={s.key}>"{key}"</span>
                <span style={s.colon}>: </span>
              </>
            )}
            <JsonNode value={val} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
            {i < entries.length - 1 && <span style={s.comma}>,</span>}
          </div>
        ))}
      </div>
      <span style={s.bracket}>{cb}</span>
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'var(--t-text2)',
    background: 'var(--t-surface)',
    border: '1px solid var(--t-frame)',
    borderRadius: 6,
    padding: 14,
    overflowX: 'auto',
    lineHeight: 1.7,
  },
  rootInline: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'var(--t-text2)',
    background: 'none',
    border: 'none',
    padding: 0,
    lineHeight: 1.7,
  },
  expandBtn: {
    position: 'absolute',
    top: 6,
    right: 8,
    background: 'none',
    border: 'none',
    color: 'var(--t-text4)',
    fontSize: 12,
    padding: 0,
    cursor: 'pointer',
    lineHeight: 1,
    opacity: 0.6,
  },
  // primitive values
  null: { color: 'var(--t-text4)' },
  bool: { color: 'var(--t-warn)' },
  num: { color: 'var(--t-accent)' },
  str: { color: 'var(--t-ok)' },
  // structural
  bracket: { color: 'var(--t-text2)' },
  key: { color: 'var(--t-accent2)' },
  colon: { color: 'var(--t-text4)' },
  comma: { color: 'var(--t-text4)' },
  summary: {
    color: 'var(--t-text4)',
    fontStyle: 'italic',
    margin: '0 4px',
  },
  chevron: {
    fontSize: 8,
    color: 'var(--t-text4)',
    marginRight: 3,
    display: 'inline-block',
    verticalAlign: 'middle',
  },
  // collapsed: entire row is a button
  collapsed: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'inherit',
    lineHeight: 'inherit',
  },
  // expanded: header button just toggles (shows ▼ + open bracket)
  openHeader: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'inherit',
    lineHeight: 'inherit',
  },
  expandedWrap: {
    display: 'inline',
  },
  children: {
    paddingLeft: 16,
    borderLeft: '1px solid var(--t-frame)',
    marginLeft: 4,
    display: 'block',
  },
  entry: {
    display: 'block',
    lineHeight: 1.7,
  },
};
