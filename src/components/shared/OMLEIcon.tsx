// OMLE logo icon — hexagon with a 4-node diamond network inside.
// Two variants: Html (for HTML/React context) and Svg (for inline SVG context).

import React from 'react';

// ── TreeEnsemble icon — two overlapping pine trees ────────────────────────────

function TreeEnsembleParts() {
  const fill = '#4a9e5c';
  return (
    <>
      {/* Back tree (smaller, dimmer) */}
      <polygon points="0,13 5.5,1 11,13" fill={fill} opacity={0.45} />
      <rect x="4.5" y="13" width="2" height="2" fill={fill} opacity={0.45} />
      {/* Front tree (taller, prominent) */}
      <polygon points="5,15 10.5,1 16,15" fill={fill} opacity={0.9} />
      <rect x="9.5" y="15" width="2" height="1" fill={fill} opacity={0.9} />
    </>
  );
}

export function TreeEnsembleIconHtml({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <TreeEnsembleParts />
    </svg>
  );
}

export function TreeEnsembleIconSvg({ x, y, size = 14 }: { x: number; y: number; size: number }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 16 16" overflow="visible">
      <TreeEnsembleParts />
    </svg>
  );
}

// ── NeuralNetwork icon — classic MLP: 3 input, 4 hidden, 2 output nodes ─────

function NeuralNetworkParts() {
  const col = '#7b6cf6';
  const inp = [3.5, 8, 12.5];
  const hid = [2, 5.5, 9.5, 13];
  const out = [5.5, 10.5];
  const lx = 2, mx = 8, rx = 14;
  return (
    <>
      {inp.flatMap(iy => hid.map((hy, hi) =>
        <line key={`ih${iy}-${hi}`} x1={lx} y1={iy} x2={mx} y2={hy} stroke={col} strokeWidth={0.6} opacity={0.35} />
      ))}
      {hid.flatMap((hy, hi) => out.map((oy, oi) =>
        <line key={`ho${hi}-${oi}`} x1={mx} y1={hy} x2={rx} y2={oy} stroke={col} strokeWidth={0.6} opacity={0.35} />
      ))}
      {inp.map((y, i) => <circle key={`i${i}`} cx={lx} cy={y} r={1.5} fill={col} opacity={0.7} />)}
      {hid.map((y, i) => <circle key={`h${i}`} cx={mx} cy={y} r={1.5} fill={col} />)}
      {out.map((y, i) => <circle key={`o${i}`} cx={rx} cy={y} r={1.5} fill={col} opacity={0.85} />)}
    </>
  );
}

export function NeuralNetworkIconHtml({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <NeuralNetworkParts />
    </svg>
  );
}

export function NeuralNetworkIconSvg({ x, y, size = 14 }: { x: number; y: number; size: number }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 16 16" overflow="visible">
      <NeuralNetworkParts />
    </svg>
  );
}

interface IconProps {
  size?: number;
  hexColor?: string;
  nodeColor?: string;
}

// For use inside React HTML trees (sidebar header, nav items, etc.)
export function OMLEIconHtml({ size = 20, hexColor = 'var(--t-accent)', nodeColor = 'var(--t-ok)' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <IconParts hexColor={hexColor} nodeColor={nodeColor} />
    </svg>
  );
}

// For use inside a parent <svg> element (NodeCard, etc.)
export function OMLEIconSvg({
  x, y, size = 14,
  hexColor = 'var(--t-accent)', nodeColor = 'var(--t-ok)',
}: IconProps & { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24" overflow="visible">
      <IconParts hexColor={hexColor} nodeColor={nodeColor} />
    </svg>
  );
}

// Shared path data (pointy-top hexagon, 4-node diamond)
function IconParts({ hexColor, nodeColor }: { hexColor: string; nodeColor: string }) {
  // Pointy-top hexagon, radius 10.5, center (12,12)
  const hex = '12,1.5 21.6,7 21.6,17 12,22.5 2.4,17 2.4,7';
  // Diamond nodes at radius 6.5 from center
  const T = { cx: 12, cy: 5.5 };
  const R = { cx: 18.5, cy: 12 };
  const B = { cx: 12, cy: 18.5 };
  const L = { cx: 5.5, cy: 12 };
  const r = 2.2;
  const lw = 1.4;

  return (
    <>
      <polygon points={hex} fill="none" stroke={hexColor} strokeWidth="1.6" strokeLinejoin="round" />
      <line x1={T.cx} y1={T.cy} x2={R.cx} y2={R.cy} stroke={nodeColor} strokeWidth={lw} />
      <line x1={R.cx} y1={R.cy} x2={B.cx} y2={B.cy} stroke={nodeColor} strokeWidth={lw} />
      <line x1={B.cx} y1={B.cy} x2={L.cx} y2={L.cy} stroke={nodeColor} strokeWidth={lw} />
      <line x1={L.cx} y1={L.cy} x2={T.cx} y2={T.cy} stroke={nodeColor} strokeWidth={lw} />
      <circle cx={T.cx} cy={T.cy} r={r} fill={nodeColor} />
      <circle cx={R.cx} cy={R.cy} r={r} fill={nodeColor} />
      <circle cx={B.cx} cy={B.cy} r={r} fill={nodeColor} />
      <circle cx={L.cx} cy={L.cy} r={r} fill={nodeColor} />
    </>
  );
}
