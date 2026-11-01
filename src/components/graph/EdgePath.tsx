// SVG cubic-bezier edge renderer with hover tooltip.

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import type { GEdge, GNode } from './layout.ts';
import { getOutputPortPos, getInputPortPos } from './layout.ts';

interface EdgePathProps {
  edge: GEdge;
  nodes: Map<string, GNode>;
  direction?: 'LR' | 'TB';
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  inferenceRole?: 'input' | 'output' | 'done';
  onHover: (id: string) => void;
  onLeave: () => void;
}

const COLOR = {
  default: 'var(--t-edge)',
  selected: 'var(--t-edge-sel)',
  hovered: 'var(--t-edge-hov)',
  dim: 'var(--t-edge-dim)',
  inferenceInput: 'var(--t-edge-in)',
  inferenceOutput: 'var(--t-edge-out)',
  inferenceDone: 'var(--t-edge-done)',
  label: 'var(--t-muted)',
  labelHover: 'var(--t-text3)',
} as const;

export function EdgePath({ edge, nodes, direction = 'LR', hovered, selected, dimmed, inferenceRole, onHover, onLeave }: EdgePathProps) {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const from = getOutputPortPos(edge.fromId, edge.fromPortName, nodes, direction);
  const to = getInputPortPos(edge.toId, nodes, direction);

  if (from.x === 0 && from.y === 0) return null;
  if (to.x === 0 && to.y === 0) return null;

  // Cubic bezier: horizontal for LR, vertical for TB
  const path = direction === 'TB'
    ? (() => {
        const dy = Math.max(60, Math.abs(to.y - from.y) * 0.5);
        return `M ${from.x} ${from.y} C ${from.x} ${from.y + dy}, ${to.x} ${to.y - dy}, ${to.x} ${to.y}`;
      })()
    : (() => {
        const dx = Math.max(60, Math.abs(to.x - from.x) * 0.5);
        return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
      })();

  const strokeColor = inferenceRole === 'input' ? COLOR.inferenceInput
    : inferenceRole === 'output' ? COLOR.inferenceOutput
    : inferenceRole === 'done' ? COLOR.inferenceDone
    : selected ? COLOR.selected
    : hovered ? COLOR.hovered
    : COLOR.default;
  const strokeOpacity = dimmed ? 0.12 : 1;
  const strokeWidth = inferenceRole === 'input' || inferenceRole === 'output' ? 1.8
    : selected ? 1.5
    : hovered ? 1.3
    : 1.5;

  // Midpoint for label
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;

  const handleMouseEnter = (e: React.MouseEvent<SVGGElement>) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
    onHover(edge.id);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGGElement>) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <g onMouseEnter={handleMouseEnter} onMouseMove={handleMouseMove} onMouseLeave={() => { setTooltipPos(null); onLeave(); }}>
      {/* Wider invisible hit area */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'default' }} />

      {/* Visible edge */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap="round"
      />

      {/* Arrowhead */}
      <Arrow x={to.x} y={to.y} color={strokeColor} opacity={strokeOpacity} direction={direction} />

      {/* Edge label (value name) */}
      {(hovered || selected) && (
        <text x={mx} y={my - 6} textAnchor="middle"
          fill={hovered ? COLOR.labelHover : COLOR.label}
          fontSize={9} fontFamily="monospace"
          style={{ pointerEvents: 'none' }}
        >
          {truncate(edge.valueName, 24)}
        </text>
      )}

      {/* Hover tooltip — rendered as HTML portal so it's never occluded by SVG nodes */}
      {hovered && tooltipPos && ReactDOM.createPortal(
        <EdgeTooltip x={tooltipPos.x} y={tooltipPos.y} edge={edge} />,
        document.body,
      )}
    </g>
  );
}

function Arrow({ x, y, color, opacity, direction }: { x: number; y: number; color: string; opacity: number; direction: 'LR' | 'TB' }) {
  const points = direction === 'TB'
    ? `${x},${y} ${x - 3},${y - 6} ${x + 3},${y - 6}`
    : `${x},${y} ${x - 6},${y - 3} ${x - 6},${y + 3}`;
  return (
    <polygon
      points={points}
      fill={color}
      opacity={opacity}
      style={{ pointerEvents: 'none' }}
    />
  );
}

function EdgeTooltip({ x, y, edge }: { x: number; y: number; edge: GEdge }) {
  const lines: Array<{ label: string; value: string }> = [
    { label: 'name', value: edge.valueName },
  ];
  if (edge.type) {
    if (edge.type.dtype) lines.push({ label: 'dtype', value: edge.type.dtype });
    if (edge.type.shape && edge.type.shape.length > 0) {
      lines.push({ label: 'shape', value: `[${edge.type.shape.map(d => d <= 0 ? 'N' : d).join(', ')}]` });
    }
  }
  if (edge.measureLevel) lines.push({ label: 'measure', value: edge.measureLevel });
  if (edge.role) lines.push({ label: 'role', value: edge.role });

  // Keep the tooltip inside the viewport
  const OFFSET = 14;
  const W = 200;
  const left = x + OFFSET + W > window.innerWidth ? x - OFFSET - W : x + OFFSET;
  const top = y - 10;

  return (
    <div style={{
      position: 'fixed',
      left,
      top,
      width: W,
      background: 'var(--t-surface)',
      border: '1px solid var(--t-trim)',
      borderRadius: 5,
      padding: '6px 10px',
      pointerEvents: 'none',
      zIndex: 9999,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      {lines.map((ln, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, lineHeight: '18px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--t-text4)', width: 46, flexShrink: 0 }}>
            {ln.label}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--t-text2)', wordBreak: 'break-all' }}>
            {ln.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
