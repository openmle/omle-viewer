// Mini-map overlay: scaled-down view of the entire graph with viewport rect.

import React, { useCallback, useRef } from 'react';
import type { GNode, GEdge } from './layout.ts';

interface MiniMapProps {
  nodes: Map<string, GNode>;
  edges: GEdge[];
  bbox: { w: number; h: number };
  viewport: { tx: number; ty: number; scale: number };
  containerRef: React.RefObject<HTMLDivElement>;
  onNavigate: (graphX: number, graphY: number) => void;
}

const MAP_W = 160;
const MAP_H = 100;
const MAP_PAD = 4;

export function MiniMap({ nodes, bbox, viewport, containerRef, onNavigate }: MiniMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const scaleX = (MAP_W - MAP_PAD * 2) / Math.max(bbox.w, 1);
  const scaleY = (MAP_H - MAP_PAD * 2) / Math.max(bbox.h, 1);
  const mapScale = Math.min(scaleX, scaleY);

  // Map a graph coordinate to minimap SVG coordinate
  const toMap = (gx: number, gy: number) => ({
    x: MAP_PAD + gx * mapScale,
    y: MAP_PAD + gy * mapScale,
  });

  // Viewport rect in graph coordinates
  const cw = containerRef.current?.clientWidth ?? 800;
  const ch = containerRef.current?.clientHeight ?? 600;
  const vpLeft = -viewport.tx / viewport.scale;
  const vpTop = -viewport.ty / viewport.scale;
  const vpW = cw / viewport.scale;
  const vpH = ch / viewport.scale;

  const vpMapX = MAP_PAD + vpLeft * mapScale;
  const vpMapY = MAP_PAD + vpTop * mapScale;
  const vpMapW = vpW * mapScale;
  const vpMapH = vpH * mapScale;

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const gx = (mx - MAP_PAD) / mapScale;
    const gy = (my - MAP_PAD) / mapScale;
    onNavigate(gx, gy);
  }, [mapScale, onNavigate]);

  return (
    <div style={styles.container}>
      <svg
        ref={svgRef}
        width={MAP_W}
        height={MAP_H}
        style={{ display: 'block', cursor: 'crosshair' }}
        onClick={handleClick}
      >
        <rect width={MAP_W} height={MAP_H} fill="var(--t-map-bg)" rx={4} />
        <rect width={MAP_W} height={MAP_H} rx={4} fill="none" stroke="var(--t-frame)" strokeWidth={0.5} />

        {/* Node rects */}
        {[...nodes.values()].map(n => {
          const mp = toMap(n.x, n.y);
          const mw = Math.max(2, n.w * mapScale);
          const mh = Math.max(1, n.h * mapScale);
          const fill = n.kind === 'input' ? 'var(--t-map-in)'
            : n.kind === 'output' ? 'var(--t-map-out)'
            : n.isComposite ? 'var(--t-map-comp)'
            : 'var(--t-map-node)';
          const stroke = n.kind === 'input' ? 'var(--t-map-in-b)'
            : n.kind === 'output' ? 'var(--t-map-out-b)'
            : 'var(--t-map-node-b)';
          return (
            <rect key={n.id}
              x={mp.x} y={mp.y} width={mw} height={mh}
              fill={fill} stroke={stroke} strokeWidth={0.3} rx={0.5}
            />
          );
        })}

        {/* Viewport rectangle */}
        <rect
          x={vpMapX} y={vpMapY}
          width={Math.max(4, vpMapW)} height={Math.max(4, vpMapH)}
          fill="var(--t-map-vp)"
          stroke="var(--t-map-vp-b)"
          strokeWidth={0.8}
          rx={1}
        />
      </svg>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderRadius: 6,
    border: '1px solid var(--t-frame)',
    background: 'var(--t-map-bg)',
    boxShadow: '0 2px 12px var(--t-node-shadow)',
    overflow: 'hidden',
    zIndex: 10,
    opacity: 0.9,
  },
};
