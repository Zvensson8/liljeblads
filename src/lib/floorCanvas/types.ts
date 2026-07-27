import type { FabricObject } from 'fabric';
import type { Canvas as FabricCanvas } from 'fabric';

export interface FloorComponent {
  id: string;
  name: string;
  type: string;
  status: string;
  supplier: string | null;
  aff_code: string | null;
  notes: string | null;
  room_zone: string | null;
  priority: number | null;
  cost_center: string | null;
  next_service_date: string | null;
  registration_number: string | null;
  installation_year: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
}

export type CanvasObject = FabricObject & {
  componentId?: string | null;
  componentType?: string;
  existingComponentId?: string;
  isGrid?: boolean;
  isMoving?: boolean;
};

export type ComponentWithGeometry = FloorComponent & {
  component_geometry?: Array<{ x: number; y: number }> | null;
};

export type CanvasHistoryEntry = ReturnType<FabricCanvas['toJSON']>;

export const MARKER_STYLE = {
  fill: 'rgba(59, 130, 246, 0.5)',
  stroke: '#3b82f6',
  strokeWidth: 2,
  hoverFill: 'rgba(37, 99, 235, 0.7)',
  hoverStroke: '#2563eb',
  hoverStrokeWidth: 4,
  radius: 5,
} as const;

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
