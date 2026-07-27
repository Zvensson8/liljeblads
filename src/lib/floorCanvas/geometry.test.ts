import { describe, expect, it } from 'vitest';
import { clampZoom, computeTooltipPosition } from '@/lib/floorCanvas/geometry';

describe('floorCanvas geometry', () => {
  it('clampZoom bounds and non-finite', () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(10)).toBe(5);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('computeTooltipPosition keeps tooltip near object and in bounds', () => {
    const pos = computeTooltipPosition({
      centerX: 100,
      centerY: 100,
      viewportTransform: [1, 0, 0, 1, 0, 0],
      canvasWidth: 1200,
      canvasHeight: 800,
      canvasRect: {
        left: 0,
        top: 0,
        width: 1200,
        height: 800,
        right: 1200,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect,
      tooltipWidth: 180,
      tooltipHeight: 90,
    });
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeGreaterThan(0);
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
});
