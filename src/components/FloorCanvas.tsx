import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Canvas as FabricCanvas,
  Circle,
  Rect,
  Line,
  FabricText,
  FabricImage,
  Point,
} from 'fabric';
import type { TPointerEventInfo } from 'fabric';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { CanvasToolbar } from './CanvasToolbar';
import { ComponentLibraryPanel } from './ComponentLibraryPanel';
import { ComponentFormDialog } from './ComponentFormDialog';
import type { ComponentTemplate } from '@/hooks/useComponentLibrary';
import { ArrowLeft } from 'lucide-react';
import {
  type CanvasObject,
  type ComponentWithGeometry,
  type FloorComponent,
  type CanvasHistoryEntry,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/lib/floorCanvas/types';
import {
  clampZoom,
  computeTooltipPosition,
  createComponentMarker,
  hoverMarkerStyle,
  resetMarkerStyle,
} from '@/lib/floorCanvas/geometry';
import { useComponentGeometrySave } from '@/hooks/useComponentGeometrySave';

interface FloorCanvasProps {
  floorId: string;
  drawingUrl: string;
  onUpdate: () => void;
  onBack?: () => void;
}

export const FloorCanvas = ({ floorId, drawingUrl, onUpdate, onBack }: FloorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);

  const [activeTool, setActiveTool] = useState('select');
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<CanvasObject | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ComponentTemplate | null>(null);
  const componentsRef = useRef<FloorComponent[]>([]);
  const [history, setHistory] = useState<CanvasHistoryEntry[]>([]);
  const historyRef = useRef<CanvasHistoryEntry[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const historyStepRef = useRef(-1);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const [editingComponent, setEditingComponent] = useState<FloorComponent | null>(null);
  const [propertyId, setPropertyId] = useState('');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipComponent, setTooltipComponent] = useState<FloorComponent | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const spacePressedRef = useRef(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const panStart = useRef({ x: 0, y: 0 });
  const loadGenRef = useRef(0);
  const { toast } = useToast();

  const { savePosition, savePositionNow, rememberPosition } = useComponentGeometrySave({
    onError: (message) =>
      toast({
        title: 'Kunde inte spara position',
        description: message,
        variant: 'destructive',
      }),
  });

  // Keep refs in sync for event handlers (avoid stale closures)
  useEffect(() => {
    isPanningRef.current = isPanning;
  }, [isPanning]);
  useEffect(() => {
    spacePressedRef.current = spacePressed;
  }, [spacePressed]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    historyStepRef.current = historyStep;
  }, [historyStep]);

  const saveHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      const json = canvas.toJSON();
      setHistory((prev) => {
        const step = historyStepRef.current;
        const next = prev.slice(0, step + 1);
        next.push(json);
        // Cap history to avoid unbounded memory
        const capped = next.length > 50 ? next.slice(next.length - 50) : next;
        historyStepRef.current = capped.length - 1;
        setHistoryStep(capped.length - 1);
        return capped;
      });
    } catch (e) {
      console.warn('FloorCanvas: saveHistory failed', e);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = new Point(canvas.width! / 2, canvas.height! / 2);
    const newZoom = clampZoom(canvas.getZoom() * 1.2, ZOOM_MIN, ZOOM_MAX);
    setZoom(newZoom);
    canvas.zoomToPoint(center, newZoom);
    canvas.requestRenderAll();
  }, []);

  const handleZoomOut = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const center = new Point(canvas.width! / 2, canvas.height! / 2);
    const newZoom = clampZoom(canvas.getZoom() / 1.2, ZOOM_MIN, ZOOM_MAX);
    setZoom(newZoom);
    canvas.zoomToPoint(center, newZoom);
    canvas.requestRenderAll();
  }, []);

  const handleUndo = useCallback(() => {
    const canvas = fabricRef.current;
    const step = historyStepRef.current;
    const hist = historyRef.current;
    if (!canvas || step <= 0 || !hist[step - 1]) return;
    const next = step - 1;
    setHistoryStep(next);
    historyStepRef.current = next;
    canvas
      .loadFromJSON(hist[next])
      .then(() => canvas.requestRenderAll())
      .catch((e) => console.warn('FloorCanvas undo failed', e));
  }, []);

  const handleRedo = useCallback(() => {
    const canvas = fabricRef.current;
    const step = historyStepRef.current;
    const hist = historyRef.current;
    if (!canvas || step >= hist.length - 1 || !hist[step + 1]) return;
    const next = step + 1;
    setHistoryStep(next);
    historyStepRef.current = next;
    canvas
      .loadFromJSON(hist[next])
      .then(() => canvas.requestRenderAll())
      .catch((e) => console.warn('FloorCanvas redo failed', e));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const canvas = fabricRef.current;
      if (!canvas) return;

      if (e.code === 'Space' && !spacePressedRef.current) {
        e.preventDefault();
        setSpacePressed(true);
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'v') setActiveTool('select');
      if (key === 'h') setActiveTool('pan');
      if (key === 'd') setActiveTool('draw');
      if (key === 'c') setActiveTool('circle');
      if (key === 'r') setActiveTool('rectangle');
      if (key === 'l') setActiveTool('line');
      if (key === 't') setActiveTool('text');
      if (key === 'g') setGridEnabled((prev) => !prev);
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-' || e.key === '_') handleZoomOut();

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          handleUndo();
        }
        if (key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = canvas.getActiveObject();
        if (active) {
          canvas.remove(active);
          saveHistory();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && fabricRef.current) {
        setSpacePressed(false);
        if (activeToolRef.current !== 'pan') {
          fabricRef.current.defaultCursor = 'default';
          fabricRef.current.hoverCursor = 'move';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleZoomIn, handleZoomOut, handleUndo, handleRedo, saveHistory]);

  // Property id for library panel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('floors')
        .select('property_id')
        .eq('id', floorId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('FloorCanvas: property lookup failed', error.message);
        return;
      }
      if (data?.property_id) setPropertyId(data.property_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [floorId]);

  // Init / dispose canvas when floor or drawing changes
  useEffect(() => {
    if (!canvasRef.current) return;
    if (!drawingUrl) {
      setImageError(true);
      setImageLoading(false);
      return;
    }

    const gen = ++loadGenRef.current;
    setImageLoading(true);
    setImageError(false);
    setHistory([]);
    setHistoryStep(-1);
    historyRef.current = [];
    historyStepRef.current = -1;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: '#ffffff',
    });
    fabricRef.current = canvas;
    setFabricCanvas(canvas);

    FabricImage.fromURL(drawingUrl, { crossOrigin: 'anonymous' })
      .then((img) => {
        if (loadGenRef.current !== gen || fabricRef.current !== canvas) {
          // Stale load — ignore
          return;
        }
        const cw = canvas.getWidth() || 1200;
        const ch = canvas.getHeight() || 800;
        const iw = img.width || 1;
        const ih = img.height || 1;
        const scale = Math.min(cw / iw, ch / ih);
        img.scale(scale);
        canvas.backgroundImage = img;
        canvas.requestRenderAll();
        setImageLoading(false);
      })
      .catch((error) => {
        if (loadGenRef.current !== gen) return;
        console.error('FloorCanvas: Failed to load image:', error);
        setImageError(true);
        setImageLoading(false);
        toast({
          title: 'Fel vid laddning av ritning',
          description: 'Kunde inte ladda ritningen. Kontrollera URL/behörighet.',
          variant: 'destructive',
        });
      });

    canvas.on('selection:created', (e) => {
      setSelectedObject((e.selected?.[0] as CanvasObject) ?? null);
    });
    canvas.on('selection:updated', (e) => {
      setSelectedObject((e.selected?.[0] as CanvasObject) ?? null);
    });
    canvas.on('selection:cleared', () => setSelectedObject(null));

    canvas.on('mouse:dblclick', (e) => {
      const obj = e.target as CanvasObject | undefined;
      if (!obj?.componentId) return;
      const component = componentsRef.current.find((c) => c.id === obj.componentId);
      if (component) {
        setEditingComponent(component);
        setDialogOpen(true);
      }
    });

    const handleWheel = (opt: TPointerEventInfo<WheelEvent>) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      let z = canvas.getZoom();
      z *= 0.999 ** e.deltaY;
      z = clampZoom(z, ZOOM_MIN, ZOOM_MAX);
      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), z);
      setZoom(z);
    };
    canvas.on('mouse:wheel', handleWheel);

    canvas.on('mouse:move', (e) => {
      const scenePoint = e.scenePoint;
      if (isPanningRef.current && scenePoint) {
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += scenePoint.x - panStart.current.x;
          vpt[5] += scenePoint.y - panStart.current.y;
          canvas.requestRenderAll();
          panStart.current = { x: scenePoint.x, y: scenePoint.y };
        }
        return;
      }

      const target = e.target as CanvasObject | undefined;
      if (target?.componentId) {
        hoverMarkerStyle(target);
        canvas.hoverCursor = 'pointer';
        canvas.requestRenderAll();

        const component = componentsRef.current.find((c) => c.id === target.componentId);
        const canvasElement = canvasRef.current;
        if (component && canvasElement) {
          const rect = canvasElement.getBoundingClientRect();
          const center = target.getCenterPoint
            ? target.getCenterPoint()
            : { x: target.left || 0, y: target.top || 0 };
          const pos = computeTooltipPosition({
            centerX: center.x,
            centerY: center.y,
            viewportTransform: canvas.viewportTransform,
            canvasWidth: canvas.getWidth() || 1200,
            canvasHeight: canvas.getHeight() || 800,
            canvasRect: rect,
          });
          setTooltipPosition(pos);
          setTooltipComponent(component);
          setTooltipVisible(true);
        }

        canvas.getObjects().forEach((obj) => {
          const co = obj as CanvasObject;
          if (co.componentId && co !== target) resetMarkerStyle(co);
        });
      } else {
        setTooltipVisible(false);
        setTooltipComponent(null);
        canvas.getObjects().forEach((obj) => {
          const co = obj as CanvasObject;
          if (co.componentId) resetMarkerStyle(co);
        });
        const panMode = activeToolRef.current === 'pan' || spacePressedRef.current;
        canvas.hoverCursor = panMode ? 'grab' : 'default';
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:down', (e) => {
      const scenePoint = e.scenePoint;
      const isMiddleButton = e.e instanceof MouseEvent && e.e.button === 1;
      if (
        (activeToolRef.current === 'pan' || spacePressedRef.current || isMiddleButton) &&
        scenePoint
      ) {
        if (isMiddleButton) e.e.preventDefault();
        setIsPanning(true);
        isPanningRef.current = true;
        panStart.current = { x: scenePoint.x, y: scenePoint.y };
        canvas.selection = false;
        canvas.defaultCursor = 'grabbing';
      }
    });

    canvas.on('mouse:up', () => {
      setIsPanning(false);
      isPanningRef.current = false;
      const panMode = activeToolRef.current === 'pan' || spacePressedRef.current;
      canvas.selection = !panMode;
      canvas.defaultCursor = panMode ? 'grab' : 'default';
    });

    canvas.on('object:modified', (e) => {
      const obj = e.target as CanvasObject | undefined;
      if (obj?.componentId) {
        const x = obj.left ?? 0;
        const y = obj.top ?? 0;
        if (Number.isFinite(x) && Number.isFinite(y)) {
          savePosition(obj.componentId, x, y);
          toast({
            title: 'Position sparad',
            description: 'Komponentens position uppdaterades automatiskt.',
            duration: 2000,
          });
        }
      }
      saveHistory();
    });

    return () => {
      loadGenRef.current += 1;
      try {
        canvas.dispose();
      } catch (e) {
        console.warn('FloorCanvas dispose', e);
      }
      if (fabricRef.current === canvas) fabricRef.current = null;
      setFabricCanvas(null);
      setTooltipVisible(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init on floor/drawing/reload
  }, [drawingUrl, floorId, reloadNonce]);

  const drawGrid = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const gridSize = 20;
    const width = canvas.width || 1200;
    const height = canvas.height || 800;

    for (let i = 0; i < width / gridSize; i++) {
      const lineV = new Line([i * gridSize, 0, i * gridSize, height], {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (lineV as CanvasObject).isGrid = true;
      canvas.add(lineV);
    }
    for (let i = 0; i < height / gridSize; i++) {
      const lineH = new Line([0, i * gridSize, width, i * gridSize], {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (lineH as CanvasObject).isGrid = true;
      canvas.add(lineH);
    }
    canvas.getObjects().forEach((obj) => {
      if ((obj as CanvasObject).isGrid) canvas.sendObjectToBack(obj);
    });
  }, []);

  const removeGrid = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((obj) => {
      if ((obj as CanvasObject).isGrid) canvas.remove(obj);
    });
  }, []);

  useEffect(() => {
    if (!fabricCanvas) return;
    fabricCanvas.isDrawingMode = activeTool === 'draw';
    if (activeTool === 'pan') {
      fabricCanvas.selection = false;
      fabricCanvas.defaultCursor = 'grab';
      fabricCanvas.hoverCursor = 'grab';
    } else {
      fabricCanvas.selection = true;
      fabricCanvas.defaultCursor = 'default';
      fabricCanvas.hoverCursor = 'move';
    }
    if (gridEnabled) drawGrid();
    else removeGrid();
    fabricCanvas.requestRenderAll();
  }, [activeTool, fabricCanvas, gridEnabled, drawGrid, removeGrid]);

  const renderComponentsOnCanvas = useCallback(
    (componentsData: ComponentWithGeometry[]) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      canvas.getObjects().forEach((obj) => {
        if ((obj as CanvasObject).componentId) canvas.remove(obj);
      });

      componentsData.forEach((component) => {
        const geometry = component.component_geometry?.[0];
        if (!geometry || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)) return;
        rememberPosition(component.id, geometry.x, geometry.y);
        const circle = createComponentMarker(geometry.x, geometry.y, {
          componentId: component.id,
        });
        canvas.add(circle);
      });
      canvas.requestRenderAll();
    },
    [rememberPosition],
  );

  const loadComponents = useCallback(async () => {
    const gen = loadGenRef.current;
    const { data, error } = await supabase
      .from('components')
      .select(
        `
        *,
        component_geometry (
          x,
          y
        )
      `,
      )
      .eq('floor_id', floorId);

    if (loadGenRef.current !== gen) return; // stale floor

    if (error) {
      console.error('Error loading components:', error);
      toast({
        title: 'Kunde inte ladda komponenter',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    const rows = (data || []) as ComponentWithGeometry[];
    componentsRef.current = rows;
    renderComponentsOnCanvas(rows);
  }, [floorId, renderComponentsOnCanvas, toast]);

  useEffect(() => {
    if (!fabricCanvas) return;
    void loadComponents();
  }, [fabricCanvas, loadComponents]);

  const handleExport = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 2,
      });
      const link = document.createElement('a');
      link.download = `floor-plan-${floorId}.png`;
      link.href = dataURL;
      link.click();
      toast({
        title: 'Ritning exporterad!',
        description: 'Din ritning har sparats som PNG.',
      });
    } catch (e) {
      toast({
        title: 'Export misslyckades',
        description: e instanceof Error ? e.message : 'Okänt fel',
        variant: 'destructive',
      });
    }
  };

  const handleToolClick = (tool: string) => {
    setActiveTool(tool);
    setEditingComponent(null);
    setSelectedTemplate(null);
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (tool === 'line') {
      const line = new Line([50, 50, 200, 50], { stroke: '#3b82f6', strokeWidth: 3 });
      canvas.add(line);
      canvas.setActiveObject(line);
      saveHistory();
    } else if (tool === 'rectangle') {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.3)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        width: 150,
        height: 100,
      });
      canvas.add(rect);
      canvas.setActiveObject(rect);
      saveHistory();
    } else if (tool === 'circle') {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.3)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        radius: 50,
      });
      canvas.add(circle);
      canvas.setActiveObject(circle);
      saveHistory();
    } else if (tool === 'text') {
      const text = new FabricText('Dubbelklicka för att redigera', {
        left: 100,
        top: 100,
        fontSize: 20,
        fill: '#333',
        editable: true,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      saveHistory();
    }
  };

  const handleTemplateSelect = (template: ComponentTemplate) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const shape = createComponentMarker(150, 150, {
      componentId: null,
      radius: 20,
      color: template.color,
    });
    shape.componentType = template.type;
    canvas.add(shape);
    canvas.setActiveObject(shape);
    setSelectedObject(shape);
    setSelectedTemplate(template);
    setEditingComponent(null);
    setDialogOpen(true);
    saveHistory();
  };

  const handleExistingComponentSelect = (component: FloorComponent) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const shape = createComponentMarker(150, 150, {
      existingComponentId: component.id,
      radius: 15,
    });
    canvas.add(shape);
    canvas.setActiveObject(shape);
    setSelectedObject(shape);
    toast({
      title: 'Placera komponenten',
      description:
        'Dra komponenten till rätt position och klicka "Spara position" för att bekräfta.',
    });
    saveHistory();
  };

  const handleSaveComponentPosition = async () => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObject?.existingComponentId) return;
    const id = selectedObject.existingComponentId;
    const x = selectedObject.left ?? 0;
    const y = selectedObject.top ?? 0;

    const result = await savePositionNow(id, x, y);
    if (!result.ok) {
      toast({
        title: 'Fel',
        description: result.error,
        variant: 'destructive',
      });
      return;
    }

    const shouldUpdateFloor = window.confirm(
      'Vill du koppla komponenten till denna våning?',
    );
    if (shouldUpdateFloor) {
      const { error } = await supabase
        .from('components')
        .update({ floor_id: floorId })
        .eq('id', id);
      if (error) {
        toast({
          title: 'Position sparad, men våning kunde inte uppdateras',
          description: error.message,
          variant: 'destructive',
        });
      }
    }

    toast({
      title: 'Position sparad',
      description: shouldUpdateFloor
        ? 'Komponentens position och våningskoppling har sparats.'
        : 'Komponentens position har sparats.',
    });
    await loadComponents();
    canvas.remove(selectedObject);
    setSelectedObject(null);
  };

  const handleComponentSaved = () => {
    void loadComponents();
    onUpdate();
    if (selectedObject) {
      fabricRef.current?.remove(selectedObject);
      setSelectedObject(null);
    }
    setSelectedTemplate(null);
    setEditingComponent(null);
  };

  const reloadDrawing = () => {
    setImageError(false);
    setImageLoading(true);
    setReloadNonce((n) => n + 1);
  };

  return (
    <div className="flex gap-4">
      <ComponentLibraryPanel
        onSelectTemplate={handleTemplateSelect}
        propertyId={propertyId}
        onSelectExistingComponent={handleExistingComponentSelect}
      />

      <div className="flex-1 flex flex-col gap-4">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="w-fit">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till fastighet
          </Button>
        )}

        {selectedObject?.existingComponentId && (
          <Button onClick={() => void handleSaveComponentPosition()} size="lg">
            Spara position
          </Button>
        )}

        <div className="bg-muted/30 p-2 rounded-lg text-sm text-muted-foreground">
          💡 Tips: Mellanslag eller mellersta musknappen för panorering. Dubbelklicka på
          komponent för att redigera. Ctrl+Z / Ctrl+Y för ångra/gör om.
        </div>

        <CanvasToolbar
          activeTool={activeTool}
          onToolClick={handleToolClick}
          onClear={() => {
            const canvas = fabricRef.current;
            if (!canvas) return;
            canvas.clear();
            canvas.backgroundColor = '#ffffff';
            canvas.requestRenderAll();
            saveHistory();
            toast({ title: 'Canvas rensad!' });
          }}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onExport={handleExport}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onToggleGrid={() => setGridEnabled((g) => !g)}
          canUndo={historyStep > 0}
          canRedo={historyStep < history.length - 1}
          gridEnabled={gridEnabled}
        />

        <div className="border-2 border-border rounded-lg overflow-hidden shadow-[var(--shadow-card)] bg-white relative">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Laddar ritning...</p>
              </div>
            </div>
          )}
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 z-10">
              <div className="text-center space-y-2 p-4">
                <p className="text-destructive font-semibold">Kunde inte ladda ritningen</p>
                <p className="text-sm text-muted-foreground">
                  Kontrollera nätverk/behörighet eller ladda upp ritningen igen.
                </p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                    Ladda om sidan
                  </Button>
                  <Button onClick={reloadDrawing} variant="secondary" size="sm">
                    Försök igen
                  </Button>
                </div>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} />
          {spacePressed && (
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm font-medium">
              Panoreringläge · zoom {Math.round(zoom * 100)}%
            </div>
          )}
        </div>

        {tooltipVisible && tooltipComponent && (
          <div
            className="fixed z-50 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg pointer-events-none"
            style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
          >
            <div className="space-y-1 text-sm">
              <div className="font-semibold text-foreground">{tooltipComponent.name}</div>
              <div className="text-muted-foreground">{tooltipComponent.type}</div>
              {tooltipComponent.manufacturer && (
                <div className="text-muted-foreground">{tooltipComponent.manufacturer}</div>
              )}
              {tooltipComponent.installation_year && (
                <div className="text-muted-foreground">
                  Installerad: {tooltipComponent.installation_year}
                </div>
              )}
            </div>
          </div>
        )}

        <ComponentFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          floorId={floorId}
          propertyId={propertyId}
          selectedTemplate={selectedTemplate}
          editingComponent={editingComponent}
          canvasPosition={
            selectedObject && !editingComponent
              ? { x: selectedObject.left || 0, y: selectedObject.top || 0 }
              : null
          }
          onSuccess={handleComponentSaved}
        />
      </div>
    </div>
  );
};
