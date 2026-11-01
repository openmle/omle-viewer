// SVG node card renderer for the graph canvas.

import React from 'react';
import type { GNode } from './layout.ts';
import { DIM, typeLabel } from './layout.ts';
import { TreeEnsembleIconSvg, NeuralNetworkIconSvg } from '../shared/OMLEIcon.tsx';

const FEATURE_ROW_H = DIM.TERMINAL_FEATURE_H;

interface NodeCardProps {
  node: GNode;
  selected: boolean;
  dimmed: boolean;
  hovered: boolean;
  inferenceState?: 'active' | 'done';
  direction?: 'LR' | 'TB';
  onHover: (id: string) => void;
  onLeave: () => void;
  onClick: () => void;
  onEnterComposite?: () => void;
  onToggleCollapse: () => void;
}

const COLOR = {
  bg: 'var(--t-node)',
  bgInput: 'var(--t-node-in)',
  bgOutput: 'var(--t-node-out)',
  border: 'var(--t-trim)',
  borderSelected: 'var(--t-node-sel)',
  headerNode: 'var(--t-node-hdr)',
  headerInput: 'var(--t-node-hdr-in)',
  headerOutput: 'var(--t-node-hdr-out)',
  portCircle: 'var(--t-node-port)',
  portCircleHover: 'var(--t-node-port-h)',
  text: 'var(--t-node-text)',
  textDim: 'var(--t-node-dim)',
  labelInput: 'var(--t-node-lbl-in)',
  labelOutput: 'var(--t-node-lbl-out)',
  labelNode: 'var(--t-node-lbl)',
  badge: 'var(--t-node-badge)',
  badgeBorder: 'var(--t-node-badge-b)',
  badgeError: 'var(--t-node-err)',
  badgeBorderError: 'var(--t-node-err-b)',
  badgeWarn: 'var(--t-node-warn)',
  badgeBorderWarn: 'var(--t-node-warn-b)',
  shadow: 'var(--t-node-shadow)',
  dimOpacity: 0.25,
  composite: 'var(--t-node-comp)',
} as const;

export function NodeCard({
  node, selected, dimmed, inferenceState, direction = 'LR',
  hovered, onHover, onLeave, onClick, onEnterComposite, onToggleCollapse,
}: NodeCardProps) {
  const opacity = dimmed ? COLOR.dimOpacity : 1;

  const borderColor = inferenceState === 'active' ? 'var(--t-accent2)'
    : inferenceState === 'done' ? 'var(--t-edge-out)'
    : selected ? COLOR.borderSelected
    : hovered ? 'var(--t-node-hov)'
    : COLOR.border;

  const strokeWidth = selected ? 1.5 : 1;

  if (node.kind === 'input' || node.kind === 'output') {
    return (
      <TerminalCard
        node={node} selected={selected} direction={direction}
        opacity={opacity} borderColor={borderColor} strokeWidth={strokeWidth}
        hovered={hovered} onHover={onHover} onLeave={onLeave} onClick={onClick}
      />
    );
  }

  return (
    <ModelNodeCard
      node={node} selected={selected} opacity={opacity} direction={direction}
      borderColor={borderColor} strokeWidth={strokeWidth}
      inferenceState={inferenceState}
      hovered={hovered} onHover={onHover} onLeave={onLeave} onClick={onClick}
      onEnterComposite={onEnterComposite}
      onToggleCollapse={onToggleCollapse}
    />
  );
}

// ── Terminal card (input/output) ──────────────────────────────────────────────

function TerminalCard({
  node, selected, opacity, borderColor, strokeWidth, direction = 'LR',
  onHover, onLeave, onClick,
}: {
  node: GNode; selected: boolean;
  opacity: number; borderColor: string; strokeWidth: number;
  direction?: 'LR' | 'TB';
  hovered: boolean;
  onHover: (id: string) => void; onLeave: () => void; onClick: () => void;
}) {
  const { x, y, w, kind, label, portY, featureLabels, featureDtypes } = node;
  const isInput = kind === 'input';
  const bg = isInput ? COLOR.bgInput : COLOR.bgOutput;
  const headerBg = isInput ? COLOR.headerInput : COLOR.headerOutput;
  const labelColor = isInput ? COLOR.labelInput : COLOR.labelOutput;
  const termType = node.terminalType;
  const typeText = node.featureCastLabel ?? typeLabel(termType);
  const typeBadgeColor = node.featureCastLabel ? 'var(--t-muted)' : dtypeColor(termType?.dtype ?? '');

  // Feature rows sit below the header; header height is always TERMINAL_H
  const headerH = DIM.TERMINAL_H;
  const totalH = node.h;

  return (
    <g
      data-node={node.id}
      style={{ cursor: 'pointer' }}
      opacity={opacity}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {/* Drop shadow */}
      <rect x={x + 2} y={y + 2} width={w} height={totalH} rx={8} fill={COLOR.shadow} />
      {/* Main bg (fill only — border drawn last so header fill can't obscure it) */}
      <rect x={x} y={y} width={w} height={totalH} rx={8} fill={bg} />
      {/* Header strip */}
      <path
        d={`M ${x+8},${y} H ${x+w-8} A 8,8,0,0,1,${x+w},${y+8} V ${y+headerH} H ${x} V ${y+8} A 8,8,0,0,1,${x+8},${y} Z`}
        fill={headerBg}
      />
      {/* Border drawn on top of all fills */}
      <rect x={x} y={y} width={w} height={totalH} rx={8} fill="none"
        stroke={borderColor} strokeWidth={strokeWidth} />
      {/* Divider below header (only when features present) */}
      {featureLabels && featureLabels.length > 0 && (
        <line x1={x} y1={y + headerH} x2={x + w} y2={y + headerH}
          stroke={borderColor} strokeWidth={0.5} opacity={0.5} />
      )}

      {/* Direction arrow */}
      <text x={isInput ? x + 10 : x + w - 10} y={y + 10}
        textAnchor={isInput ? 'start' : 'end'}
        fill={labelColor} fontSize={9} opacity={0.7}
      >{isInput ? '▶' : '◀'}</text>

      {/* Label */}
      <text x={x + w / 2} y={y + 26}
        textAnchor="middle" fill={labelColor} fontSize={11} fontFamily="monospace"
        clipPath={`url(#clip-${node.id})`}
      >{truncate(label, 18)}</text>

      {/* Type badge */}
      {typeText && (
        <TypeBadge
          x={x + w / 2} y={y + headerH - 5}
          text={typeText}
          anchor="middle"
          color={typeBadgeColor}
        />
      )}

      {/* Feature labels */}
      {featureLabels && featureLabels.map((lbl, i) => (
        <text
          key={i}
          x={x + 10}
          y={y + headerH + i * FEATURE_ROW_H + 10}
          fill={dtypeColor(featureDtypes?.[i] ?? '')}
          fontSize={9}
          fontFamily="monospace"
        >{truncate(lbl, 22)}</text>
      ))}

      {/* Port circle — LR: left/right edges; TB: top/bottom edges */}
      {direction === 'TB' ? (
        <circle
          cx={x + w / 2}
          cy={isInput ? y + totalH : y}
          r={DIM.PORT_R}
          fill={selected ? COLOR.portCircleHover : COLOR.portCircle}
          stroke={borderColor} strokeWidth={0.5} />
      ) : isInput ? (
        <circle cx={x + w} cy={y + portY} r={DIM.PORT_R}
          fill={selected ? COLOR.portCircleHover : COLOR.portCircle}
          stroke={borderColor} strokeWidth={0.5} />
      ) : (
        <circle cx={x} cy={y + portY} r={DIM.PORT_R}
          fill={selected ? COLOR.portCircleHover : COLOR.portCircle}
          stroke={borderColor} strokeWidth={0.5} />
      )}
    </g>
  );
}

// ── Model node card ───────────────────────────────────────────────────────────

function ModelNodeCard({
  node, selected, opacity, borderColor, strokeWidth, inferenceState, direction = 'LR',
  hovered: _hovered, onHover, onLeave, onClick, onEnterComposite, onToggleCollapse,
}: {
  node: GNode; selected: boolean; opacity: number;
  borderColor: string; strokeWidth: number;
  inferenceState?: 'active' | 'done';
  direction?: 'LR' | 'TB';
  hovered: boolean;
  onHover: (id: string) => void; onLeave: () => void; onClick: () => void;
  onEnterComposite?: () => void; onToggleCollapse: () => void;
}) {
  const { x, y, w, h, label, bodyType, icon, outPorts, isComposite, collapsed, hasErrors, hasWarnings } = node;

  return (
    <g
      data-node={node.id}
      style={{ cursor: 'pointer' }}
      opacity={opacity}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {/* Inference: active glow / done tint */}
      {inferenceState === 'active' && (
        <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={8}
          fill="none" stroke="var(--t-accent2)" strokeWidth={2} opacity={0.5} />
      )}
      {inferenceState === 'done' && (
        <rect x={x} y={y} width={w} height={h} rx={6} fill="rgba(40,100,60,0.08)" />
      )}

      {/* Composite stacked shadow effect */}
      {isComposite && (
        <>
          <rect x={x + 4} y={y + 4} width={w} height={h} rx={6}
            fill="none" stroke={COLOR.border} strokeWidth={0.5} opacity={0.4} />
          <rect x={x + 2} y={y + 2} width={w} height={h} rx={6}
            fill="none" stroke={COLOR.border} strokeWidth={0.5} opacity={0.6} />
        </>
      )}

      {/* Drop shadow */}
      <rect x={x + 2} y={y + 3} width={w} height={h} rx={6} fill={COLOR.shadow} />

      {/* Card bg (fill only) */}
      <rect x={x} y={y} width={w} height={h} rx={6}
        fill={isComposite ? COLOR.composite : COLOR.bg} />

      {/* Header */}
      <path
        d={`M ${x+6},${y} H ${x+w-6} A 6,6,0,0,1,${x+w},${y+6} V ${y+DIM.NODE_HEADER_H} H ${x} V ${y+6} A 6,6,0,0,1,${x+6},${y} Z`}
        fill={COLOR.headerNode}
      />

      {/* Border drawn on top of all fills */}
      <rect x={x} y={y} width={w} height={h} rx={6}
        fill="none" stroke={borderColor} strokeWidth={strokeWidth} />

      {/* Header divider */}
      <line x1={x} y1={y + DIM.NODE_HEADER_H} x2={x + w} y2={y + DIM.NODE_HEADER_H}
        stroke={COLOR.border} strokeWidth={0.5} />

      {/* Icon */}
      {node.modelNode?.neural_network
        ? <NeuralNetworkIconSvg x={x + 4} y={y + 5} size={14} />
        : node.modelNode?.tree_ensemble
        ? <TreeEnsembleIconSvg x={x + 4} y={y + 5} size={14} />
        : <text x={x + 10} y={y + 16} fontSize={11} fill="var(--t-text3)">{icon}</text>
      }

      {/* Node label */}
      <text x={x + 26} y={y + 16}
        fill={COLOR.labelNode} fontSize={11} fontFamily="monospace" fontWeight="500"
      >{truncate(label, 18)}</text>

      {/* Body type badge */}
      {bodyType && (
        <BodyBadge x={x + 26} y={y + 33} text={bodyType} />
      )}

      {/* Warnings/errors badge — shift left when composite icon occupies top-right */}
      {hasErrors && <WarnBadge x={x + w - (isComposite ? 24 : 10)} y={y + 8} isError />}
      {!hasErrors && hasWarnings && <WarnBadge x={x + w - (isComposite ? 24 : 10)} y={y + 8} isError={false} />}

      {/* Output ports */}
      {!collapsed && outPorts.map((port, i) => (
        <g key={i}>
          {/* Port row bg (alternate) — only in LR */}
          {direction === 'LR' && i % 2 === 1 && (
            <rect x={x} y={y + DIM.NODE_HEADER_H + i * DIM.NODE_PORT_H}
              width={w} height={DIM.NODE_PORT_H} fill="rgba(255,255,255,0.015)" />
          )}
          {/* Port name + type — only in LR */}
          {direction === 'LR' && <>
            <text
              x={x + w - 14}
              y={y + port.py + 4}
              textAnchor="end"
              fill="var(--t-node-dim)"
              fontSize={10}
              fontFamily="monospace"
            >{truncate(port.name, 20)}</text>
            {port.type && (
              <text x={x + 8} y={y + port.py + 4} fill={dtypeColor(port.type.dtype)} fontSize={9} fontFamily="monospace">
                {typeLabel(port.type)}
              </text>
            )}
            {/* Port circle on right edge */}
            <circle cx={x + w} cy={y + port.py} r={DIM.PORT_R}
              fill={selected ? COLOR.portCircleHover : COLOR.portCircle}
              stroke={borderColor} strokeWidth={0.5} />
          </>}
        </g>
      ))}

      {/* TB: single output port at bottom center */}
      {direction === 'TB' && (
        <circle cx={x + w / 2} cy={y + h} r={DIM.PORT_R}
          fill={selected ? COLOR.portCircleHover : COLOR.portCircle}
          stroke={borderColor} strokeWidth={0.5} />
      )}

      {/* Input port — LR: left edge; TB: top center */}
      {direction === 'TB' ? (
        <circle cx={x + w / 2} cy={y} r={DIM.PORT_R}
          fill={selected ? COLOR.portCircleHover : COLOR.portCircle}
          stroke={borderColor} strokeWidth={0.5} />
      ) : (
        <circle cx={x} cy={y + node.inPortY} r={DIM.PORT_R}
          fill={selected ? COLOR.portCircleHover : COLOR.portCircle}
          stroke={borderColor} strokeWidth={0.5} />
      )}

      {/* Collapse button */}
      <g
        style={{ cursor: 'pointer' }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onToggleCollapse(); }}
      >
        <circle cx={x + w - 8} cy={y + DIM.NODE_HEADER_H - 8} r={6}
          fill={COLOR.badge} stroke={COLOR.badgeBorder} strokeWidth={0.5} />
        <text x={x + w - 8} y={y + DIM.NODE_HEADER_H - 4}
          textAnchor="middle" fill="var(--t-text4)" fontSize={8}
        >{collapsed ? '▶' : '▼'}</text>
      </g>

      {/* Enter composite button — top right of header */}
      {isComposite && (
        <g
          style={{ cursor: 'pointer' }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onEnterComposite?.(); }}
        >
          <circle cx={x + w - 10} cy={y + 8} r={6}
            fill={COLOR.badge} stroke={COLOR.badgeBorder} strokeWidth={0.5} />
          <text x={x + w - 10} y={y + 12}
            textAnchor="middle" fill="var(--t-accent)" fontSize={8}>⊕</text>
        </g>
      )}
    </g>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ x, y, text, anchor, color = 'var(--t-muted)' }: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; color?: string }) {
  if (!text) return null;
  return (
    <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={9} fontFamily="monospace">
      {text}
    </text>
  );
}

function BodyBadge({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.min(text.length * 6.2 + 8, 90);
  return (
    <g>
      <rect x={x - 2} y={y - 9} width={w} height={12} rx={3}
        fill={COLOR.badge} stroke={COLOR.badgeBorder} strokeWidth={0.5} />
      <text x={x - 2 + w / 2} y={y} textAnchor="middle" fill="var(--t-text4)" fontSize={9} fontFamily="monospace">{truncate(text, 14)}</text>
    </g>
  );
}

function WarnBadge({ x, y, isError }: { x: number; y: number; isError: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={6}
        fill={isError ? COLOR.badgeError : COLOR.badgeWarn}
        stroke={isError ? COLOR.badgeBorderError : COLOR.badgeBorderWarn}
        strokeWidth={0.5} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={8} fill={isError ? 'var(--t-err)' : 'var(--t-warn)'}>
        {isError ? '!' : '⚠'}
      </text>
    </g>
  );
}


function dtypeColor(dtype: string): string {
  if (dtype.startsWith('INT') || dtype.startsWith('UINT')) return 'var(--t-edge-out)';
  if (dtype === 'STRING') return 'var(--t-warn)';
  if (dtype === 'BOOL') return 'var(--t-accent2)';
  return 'var(--t-node-dim)';
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
