import type { LayoutResult } from '@kinfolk/shared/layout/layoutTypes';
import { memo, useRef } from 'react';
import type { Size, Viewport } from './viewport';

interface MinimapProps {
  layout: LayoutResult;
  viewport: Viewport;
  size: Size;
  selectedId: string | null;
  onCentre: (worldX: number, worldY: number) => void;
}

const WIDTH = 220;
const HEIGHT = 140;

/**
 * An overview for trees too big to take in at once. A pointer convenience: keyboard users get
 * the same reach through search, arrow navigation, and Fit, so it is hidden from assistive tech.
 */
export const Minimap = memo(function Minimap({ layout, viewport, size, selectedId, onCentre }: MinimapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { bounds } = layout;
  const scale = Math.min(WIDTH / Math.max(bounds.width, 1), HEIGHT / Math.max(bounds.height, 1));
  const offsetX = (WIDTH - bounds.width * scale) / 2;
  const offsetY = (HEIGHT - bounds.height * scale) / 2;
  const view = {
    x: (-viewport.x / viewport.scale) * scale + offsetX,
    y: (-viewport.y / viewport.scale) * scale + offsetY,
    width: (size.width / viewport.scale) * scale,
    height: (size.height / viewport.scale) * scale,
  };

  const centreAt = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    onCentre((clientX - rect.left - offsetX) / scale, (clientY - rect.top - offsetY) / scale);
  };

  return (
    <div aria-hidden="true" className="pointer-events-auto rounded-card border border-line bg-surface/95 p-1.5 shadow-card">
      <svg
        ref={svgRef}
        width={WIDTH}
        height={HEIGHT}
        className="block cursor-pointer touch-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          centreAt(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) centreAt(event.clientX, event.clientY);
        }}
      >
        <rect width={WIDTH} height={HEIGHT} fill="var(--kf-canvas)" rx="6" />
        {layout.nodes.map((node) => (
          <rect
            key={node.personId}
            x={node.x * scale + offsetX}
            y={node.y * scale + offsetY}
            width={Math.max(node.width * scale, 1.5)}
            height={Math.max(node.height * scale, 1.5)}
            fill={node.personId === selectedId ? 'var(--kf-accent)' : 'var(--kf-border-strong)'}
          />
        ))}
        <rect
          x={view.x}
          y={view.y}
          width={Math.max(view.width, 2)}
          height={Math.max(view.height, 2)}
          fill="var(--kf-accent)"
          fillOpacity="0.12"
          stroke="var(--kf-accent)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
});
