import React, { useState, useCallback } from 'react';

// ── Path-based immutable update ───────────────────────────────────────────────

type JsonPath = (string | number)[];

function setAtPath(root: unknown, path: JsonPath, newVal: unknown): unknown {
  if (path.length === 0) return newVal;
  const [head, ...tail] = path;
  if (Array.isArray(root)) {
    const arr = [...(root as unknown[])];
    arr[head as number] = setAtPath(arr[head as number], tail, newVal);
    return arr;
  }
  if (root !== null && typeof root === 'object') {
    const obj = { ...(root as Record<string, unknown>) };
    obj[String(head)] = setAtPath(obj[String(head)], tail, newVal);
    return obj;
  }
  return newVal;
}

// ── Primitive helpers ─────────────────────────────────────────────────────────

function parsePrimitive(raw: string): unknown {
  const t = raw.trim();
  try { return JSON.parse(t); } catch { return raw; }
}

function displayPrimitive(val: unknown): string {
  if (val === null) return 'null';
  if (typeof val === 'string') return JSON.stringify(val);
  return String(val);
}

// ── Recursive editor node ─────────────────────────────────────────────────────

interface NodeProps {
  value: unknown;
  path: JsonPath;
  onChangePath: (path: JsonPath, newVal: unknown) => void;
  isLast: boolean;
  parentIsArray: boolean;
}

function EditorNode({ value, path, onChangePath, isLast, parentIsArray }: NodeProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const keyLabel = path[path.length - 1];

  const commitEdit = useCallback((raw: string) => {
    onChangePath(path, parsePrimitive(raw));
    setEditing(false);
  }, [path, onChangePath]);

  // ── Primitive leaf ──────────────────────────────────────────────────────────
  if (value === null || typeof value !== 'object') {
    const display = displayPrimitive(value);
    const valStyle = value === null ? s.null
      : typeof value === 'boolean' ? s.bool
      : typeof value === 'number' ? s.num
      : s.str;

    return (
      <div style={s.row}>
        {!parentIsArray && (
          <><span style={s.key}>"{keyLabel}"</span><span style={s.colon}>: </span></>
        )}
        {editing ? (
          <input
            autoFocus
            style={s.inlineInput}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={() => commitEdit(editText)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit(editText);
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span
            style={{ ...valStyle, ...s.editable }}
            title="Click to edit"
            onClick={() => { setEditText(display); setEditing(true); }}
          >
            {display}
          </span>
        )}
        {!isLast && <span style={s.comma}>,</span>}
      </div>
    );
  }

  // ── Object / Array ──────────────────────────────────────────────────────────
  const isArray = Array.isArray(value);
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const ob = isArray ? '[' : '{';
  const cb = isArray ? ']' : '}';
  const summary = `${entries.length} ${isArray
    ? (entries.length === 1 ? 'item' : 'items')
    : (entries.length === 1 ? 'key' : 'keys')}`;

  const keyPrefix = !parentIsArray
    ? <><span style={s.key}>"{keyLabel}"</span><span style={s.colon}>: </span></>
    : null;

  if (entries.length === 0) {
    return (
      <div style={s.row}>
        {keyPrefix}
        <span style={s.bracket}>{ob}{cb}</span>
        {!isLast && <span style={s.comma}>,</span>}
      </div>
    );
  }

  if (!open) {
    return (
      <div style={s.row}>
        {keyPrefix}
        <button style={s.collapsed} onClick={() => setOpen(true)}>
          <span style={s.chevron}>▶</span>
          <span style={s.bracket}>{ob}</span>
          <span style={s.summary}>{summary}</span>
          <span style={s.bracket}>{cb}</span>
        </button>
        {!isLast && <span style={s.comma}>,</span>}
      </div>
    );
  }

  return (
    <div style={s.nodeWrap}>
      <div style={s.row}>
        {keyPrefix}
        <button style={s.openHeader} onClick={() => setOpen(false)}>
          <span style={s.chevron}>▼</span>
          <span style={s.bracket}>{ob}</span>
        </button>
      </div>
      <div style={s.children}>
        {entries.map(([key, val], i) => (
          <EditorNode
            key={key}
            value={val}
            path={[...path, isArray ? Number(key) : key]}
            onChangePath={onChangePath}
            isLast={i === entries.length - 1}
            parentIsArray={isArray}
          />
        ))}
      </div>
      <div style={s.row}>
        <span style={s.bracket}>{cb}</span>
        {!isLast && <span style={s.comma}>,</span>}
      </div>
    </div>
  );
}

// ── Root node (no key label, always expanded) ─────────────────────────────────

function RootNode({ value, onChangePath }: {
  value: unknown;
  onChangePath: (path: JsonPath, newVal: unknown) => void;
}) {
  if (value === null || typeof value !== 'object') {
    const display = displayPrimitive(value);
    const valStyle = value === null ? s.null
      : typeof value === 'boolean' ? s.bool
      : typeof value === 'number' ? s.num
      : s.str;
    return <span style={valStyle}>{display}</span>;
  }

  const isArray = Array.isArray(value);
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const ob = isArray ? '[' : '{';
  const cb = isArray ? ']' : '}';

  return (
    <span>
      <span style={s.bracket}>{ob}</span>
      <div style={s.children}>
        {entries.map(([key, val], i) => (
          <EditorNode
            key={key}
            value={val}
            path={[isArray ? Number(key) : key]}
            onChangePath={onChangePath}
            isLast={i === entries.length - 1}
            parentIsArray={isArray}
          />
        ))}
      </div>
      <span style={s.bracket}>{cb}</span>
    </span>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function JsonEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (newValue: unknown) => void;
}) {
  const handleChangePath = useCallback((path: JsonPath, newVal: unknown) => {
    onChange(setAtPath(value, path, newVal));
  }, [value, onChange]);

  return (
    <div style={s.root}>
      <RootNode value={value} onChangePath={handleChangePath} />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'var(--t-text2)',
    lineHeight: 1.7,
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: '0 2px',
  },
  nodeWrap: { display: 'block' },
  children: {
    paddingLeft: 16,
    borderLeft: '1px solid var(--t-frame)',
    marginLeft: 4,
  },
  // primitives
  null: { color: 'var(--t-text4)' },
  bool: { color: 'var(--t-warn)' },
  num:  { color: 'var(--t-accent)' },
  str:  { color: 'var(--t-ok)' },
  editable: {
    cursor: 'text',
    borderBottom: '1px dashed transparent',
  },
  inlineInput: {
    fontFamily: 'monospace',
    fontSize: 11,
    background: 'var(--t-input)',
    border: '1px solid var(--t-accent)',
    borderRadius: 3,
    color: 'var(--t-text)',
    padding: '0 4px',
    outline: 'none',
    minWidth: 60,
  },
  // structural
  bracket: { color: 'var(--t-text2)' },
  key:    { color: 'var(--t-accent2)' },
  colon:  { color: 'var(--t-text4)' },
  comma:  { color: 'var(--t-text4)' },
  summary: { color: 'var(--t-text4)', fontStyle: 'italic', margin: '0 4px' },
  chevron: {
    fontSize: 8,
    color: 'var(--t-text4)',
    marginRight: 3,
    display: 'inline-block',
    verticalAlign: 'middle',
  },
  collapsed: {
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
};
