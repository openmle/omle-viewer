// SVG overlay card shown near the active node during inference playback.
// Displays input values, output values, and any warnings for that step.

import React from 'react';
import type { StepSnapshot, SerializedTensor } from '@openmle/omle.js';
import type { GNode } from './layout.ts';

interface StepOverlayProps {
  step: StepSnapshot;
  node: GNode;
  canvasW: number;
  canvasH: number;
}

const CARD_W = 230;
const CARD_PAD = 10;
const ROW_H = 14;
const _SECTION_H = 16;

export function StepOverlay({ step, node, canvasW, canvasH }: StepOverlayProps) {
  const inputEntries = Object.entries(step.inputs);
  const outputEntries = Object.entries(step.outputs);
  const hasWarnings = step.warnings.length > 0;

  // Count rows: section headers + value rows + warning rows
  const inputRows = inputEntries.length;
  const outputRows = outputEntries.length;
  const warnRows = hasWarnings ? step.warnings.length : 0;
  const totalRows = (inputRows > 0 ? 1 + inputRows : 0) +
                    (outputRows > 0 ? 1 + outputRows : 0) +
                    (warnRows > 0 ? 1 + warnRows : 0);

  if (totalRows === 0) return null;

  const cardH = CARD_PAD * 2 + totalRows * ROW_H + (hasWarnings ? 4 : 0);

  // Position card to the right of the node, shift left if it would overflow
  let cx = node.x + node.w + 16;
  let cy = node.y;
  if (cx + CARD_W > canvasW) cx = node.x - CARD_W - 16;
  if (cy + cardH > canvasH) cy = canvasH - cardH - 8;
  cy = Math.max(4, cy);

  let row = 0;
  const rowY = (r: number) => cy + CARD_PAD + r * ROW_H + ROW_H * 0.75;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Connector line from card to node */}
      <line
        x1={node.x + node.w} y1={node.y + node.h / 2}
        x2={cx} y2={cy + cardH / 2}
        stroke="var(--t-frame)" strokeWidth={0.8} strokeDasharray="3 2"
      />

      {/* Card background */}
      <rect x={cx} y={cy} width={CARD_W} height={cardH} rx={5}
        fill="var(--t-bg)" stroke="var(--t-trim)" strokeWidth={0.8} />
      <rect x={cx} y={cy} width={CARD_W} height={cardH} rx={5}
        fill="var(--t-accent-bg)" />

      {/* Inputs section */}
      {inputRows > 0 && (
        <>
          <SectionLabel x={cx + CARD_PAD} y={rowY(row)} label="Inputs" />
          {inputEntries.map(([name, t]) => {
            row++;
            return <TensorRow key={name} x={cx + CARD_PAD} y={rowY(row)} name={name} tensor={t} isOutput={false} />;
          })}
          {(() => { row++; return null; })()}
        </>
      )}

      {/* Outputs section */}
      {outputRows > 0 && (
        <>
          <SectionLabel x={cx + CARD_PAD} y={rowY(row)} label="Outputs" />
          {outputEntries.map(([name, t]) => {
            row++;
            return <TensorRow key={name} x={cx + CARD_PAD} y={rowY(row)} name={name} tensor={t} isOutput />;
          })}
          {(() => { row++; return null; })()}
        </>
      )}

      {/* Warnings section */}
      {hasWarnings && (
        <>
          <SectionLabel x={cx + CARD_PAD} y={rowY(row)} label="Warnings" isWarn />
          {step.warnings.map((w, i) => {
            row++;
            return (
              <text key={i} x={cx + CARD_PAD + 6} y={rowY(row)}
                fill="var(--t-warn)" fontSize={9} fontFamily="monospace">
                {truncate(w, 28)}
              </text>
            );
          })}
        </>
      )}
    </g>
  );
}

function SectionLabel({ x, y, label, isWarn = false }: { x: number; y: number; label: string; isWarn?: boolean }) {
  return (
    <text x={x} y={y}
      fill={isWarn ? 'var(--t-warn)' : 'var(--t-muted)'}
      fontSize={9} fontWeight="600"
      style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
    >
      {label}
    </text>
  );
}

function TensorRow({ x, y, name, tensor, isOutput }: {
  x: number; y: number; name: string; tensor: SerializedTensor; isOutput: boolean;
}) {
  const isNull = tensor.data === null;
  const nameColor = isNull ? 'var(--t-err)' : isOutput ? 'var(--t-edge-out)' : 'var(--t-text3)';
  const valueColor = isNull ? 'var(--t-err)' : isOutput ? 'var(--t-ok)' : 'var(--t-text2)';

  const valueStr = isNull
    ? 'null'
    : formatData(tensor.data!, tensor.shape);

  return (
    <g>
      <text x={x + 6} y={y} fill={nameColor} fontSize={9} fontFamily="monospace">
        {truncate(name, 14)}
      </text>
      <text x={x + 100} y={y} fill={valueColor} fontSize={9} fontFamily="monospace">
        {valueStr}
      </text>
    </g>
  );
}

function formatData(data: (number | string | boolean)[], shape: number[]): string {
  if (data.length === 0) return '[]';
  const shapeStr = shape.length ? `[${shape.join('×')}]` : '';
  if (data.length === 1) {
    const v = data[0];
    return `${typeof v === 'number' ? fmtNum(v) : String(v)} ${shapeStr}`;
  }
  const preview = data.slice(0, 4).map(v => typeof v === 'number' ? fmtNum(v) : String(v)).join(', ');
  const suffix = data.length > 4 ? '…' : '';
  return `[${preview}${suffix}] ${shapeStr}`;
}

function fmtNum(v: number): string {
  if (isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(2);
  return v.toPrecision(4).replace(/\.?0+$/, '');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
