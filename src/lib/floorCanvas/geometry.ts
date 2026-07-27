import { Circle } from 'fabric';
import { MARKER_STYLE, type CanvasObject } from '@/lib/floorCanvas/types';

export function clampZoom(zoom: number, min = 0.1, max = 5): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(max, Math.max(min, zoom));
}

/** Create a non-scalable component marker at canvas coords. */
export function createComponentMarker(
  x: number,
  y: number,
  opts?: {
    componentId?: string | null;
    existingComponentId?: string;
    radius?: number;
    color?: string;
  },
): CanvasObject {
  const color = opts?.color || MARKER_STYLE.stroke;
  const fill = opts?.color
    ? `${opts.color}80`
    : MARKER_STYLE.fill;
  const circle = new Circle({
    left: x,
    top: y,
    fill,
    stroke: color,
    strokeWidth: MARKER_STYLE.strokeWidth,
    radius: opts?.radius ?? MARKER_STYLE.radius,
    selectable: true,
    evented: true,
    hoverCursor: 'move',
    hasControls: false,
    hasBorders: true,
    lockScalingX: true,
    lockScalingY: true,
  }) as CanvasObject;

  if (opts?.componentId !== undefined) {
    circle.componentId = opts.componentId;
  }
  if (opts?.existingComponentId) {
    circle.existingComponentId = opts.existingComponentId;
  }
  return circle;
}

export function resetMarkerStyle(obj: CanvasObject) {
  obj.set({
    strokeWidth: MARKER_STYLE.strokeWidth,
    stroke: MARKER_STYLE.stroke,
    fill: MARKER_STYLE.fill,
  });
}

export function hoverMarkerStyle(obj: CanvasObject) {
  obj.set({
    strokeWidth: MARKER_STYLE.hoverStrokeWidth,
    stroke: MARKER_STYLE.hoverStroke,
    fill: MARKER_STYLE.hoverFill,
  });
}

/**
 * Map Fabric object center → fixed-position screen coords for tooltips.
 * Handles viewportTransform, CSS scale, and mobile VisualViewport offsets.
 */
export function computeTooltipPosition(args: {
  centerX: number;
  centerY: number;
  viewportTransform: number[] | null | undefined;
  canvasWidth: number;
  canvasHeight: number;
  canvasRect: DOMRect;
  tooltipWidth?: number;
  tooltipHeight?: number;
}): { x: number; y: number } {
  const {
    centerX,
    centerY,
    viewportTransform,
    canvasWidth,
    canvasHeight,
    canvasRect,
    tooltipWidth = 180,
    tooltipHeight = 90,
  } = args;

  const vpt = viewportTransform || [1, 0, 0, 1, 0, 0];
  const xVpt = centerX * vpt[0] + centerY * vpt[2] + vpt[4];
  const yVpt = centerX * vpt[1] + centerY * vpt[3] + vpt[5];

  const scaleX = canvasRect.width / (canvasWidth || canvasRect.width || 1);
  const scaleY = canvasRect.height / (canvasHeight || canvasRect.height || 1);

  const screenX = canvasRect.left + xVpt * scaleX;
  const screenY = canvasRect.top + yVpt * scaleY;

  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const viewportOffsetLeft = vv?.offsetLeft ?? 0;
  const viewportOffsetTop = vv?.offsetTop ?? 0;
  const viewportWidth = vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const viewportHeight = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 800);

  const offsetX = 14;
  const offsetY = 14;

  let finalX = screenX + offsetX + viewportOffsetLeft;
  let finalY = screenY + offsetY + viewportOffsetTop;

  if (finalX + tooltipWidth > viewportOffsetLeft + viewportWidth - 10) {
    finalX = screenX - tooltipWidth - 10 + viewportOffsetLeft;
  }
  if (finalY + tooltipHeight > viewportOffsetTop + viewportHeight - 10) {
    finalY = viewportOffsetTop + viewportHeight - tooltipHeight - 10;
  }
  if (finalY < viewportOffsetTop + 10) {
    finalY = viewportOffsetTop + 10;
  }
  if (finalX < viewportOffsetLeft + 10) {
    finalX = viewportOffsetLeft + 10;
  }

  return { x: finalX, y: finalY };
}
