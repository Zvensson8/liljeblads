import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas as FabricCanvas, Circle, Rect, Line, FabricText, FabricImage, Point } from 'fabric';
import type { FabricObject, TPointerEventInfo, TPointerEvent } from 'fabric';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { CanvasToolbar } from './CanvasToolbar';
import { ComponentLibraryPanel } from './ComponentLibraryPanel';
import { ComponentFormDialog } from './ComponentFormDialog';
import { ComponentTemplate } from '@/hooks/useComponentLibrary';
import { debounce } from 'lodash-es';
import { ArrowLeft } from 'lucide-react';

interface FloorCanvasProps {
  floorId: string;
  drawingUrl: string;
  onUpdate: () => void;
  onBack?: () => void;
}

interface Component {
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

/**
 * Fabric object with our custom metadata fields. Fabric allows attaching
 * arbitrary props at runtime; we keep them on a single intersection type to
 * avoid scattered `(obj as any).foo` casts.
 */
type CanvasObject = FabricObject & {
  componentId?: string | null;
  componentType?: string;
  existingComponentId?: string;
  isGrid?: boolean;
  isMoving?: boolean;
};

/** Components data shape returned by the loadComponents query (with geometry join). */
type ComponentWithGeometry = Component & {
  component_geometry?: Array<{ x: number; y: number }> | null;
};

/** History entry returned by `fabricCanvas.toJSON()`. */
type CanvasHistoryEntry = ReturnType<FabricCanvas['toJSON']>;

export const FloorCanvas = ({ floorId, drawingUrl, onUpdate, onBack }: FloorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<CanvasObject | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ComponentTemplate | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const componentsRef = useRef<Component[]>([]);
  const [history, setHistory] = useState<CanvasHistoryEntry[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [propertyId, setPropertyId] = useState<string>('');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipComponent, setTooltipComponent] = useState<Component | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const lastSavedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const { toast } = useToast();

  // Auto-save component position when moved
  const saveComponentPosition = useCallback(
    debounce(async (componentId: string, x: number, y: number) => {
      const lastPos = lastSavedPositions.current.get(componentId);
      if (lastPos && lastPos.x === x && lastPos.y === y) {
        return; // Position hasn't changed
      }

      await supabase
        .from('component_geometry')
        .delete()
        .eq('component_id', componentId);

      const { error } = await supabase
        .from('component_geometry')
        .insert({
          component_id: componentId,
          x,
          y,
        });

      if (!error) {
        lastSavedPositions.current.set(componentId, { x, y });
      }
    }, 500),
    []
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Space for panning
      if (e.code === 'Space' && !spacePressed && fabricCanvas) {
        e.preventDefault();
        setSpacePressed(true);
        fabricCanvas.defaultCursor = 'grab';
        fabricCanvas.hoverCursor = 'grab';
        return;
      }
      
      if (e.key === 'v' || e.key === 'V') setActiveTool('select');
      if (e.key === 'h' || e.key === 'H') setActiveTool('pan');
      if (e.key === 'd' || e.key === 'D') setActiveTool('draw');
      if (e.key === 'c' || e.key === 'C') setActiveTool('circle');
      if (e.key === 'r' || e.key === 'R') setActiveTool('rectangle');
      if (e.key === 'l' || e.key === 'L') setActiveTool('line');
      if (e.key === 't' || e.key === 'T') setActiveTool('text');
      if (e.key === 'g' || e.key === 'G') setGridEnabled(prev => !prev);
      
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-' || e.key === '_') handleZoomOut();
      
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          handleUndo();
        }
        if (e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (fabricCanvas && fabricCanvas.getActiveObject()) {
          fabricCanvas.remove(fabricCanvas.getActiveObject()!);
          saveHistory();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && fabricCanvas) {
        setSpacePressed(false);
        if (activeTool !== 'pan') {
          fabricCanvas.defaultCursor = 'default';
          fabricCanvas.hoverCursor = 'move';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [fabricCanvas, historyStep, spacePressed, activeTool]);

  // Fetch property ID for this floor
  useEffect(() => {
    const fetchPropertyId = async () => {
      const { data } = await supabase
        .from('floors')
        .select('property_id')
        .eq('id', floorId)
        .single();
      
      if (data) {
        setPropertyId(data.property_id);
      }
    };
    
    fetchPropertyId();
  }, [floorId]);

  useEffect(() => {
    if (!canvasRef.current) return;

    console.log('FloorCanvas: Initializing canvas with drawingUrl:', drawingUrl);
    setImageLoading(true);
    setImageError(false);

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: '#ffffff',
    });

    FabricImage.fromURL(drawingUrl, {
      crossOrigin: 'anonymous',
    }).then((img) => {
      console.log('FloorCanvas: Image loaded successfully');
      const scale = Math.min(
        canvas.width! / img.width!,
        canvas.height! / img.height!
      );
      img.scale(scale);
      canvas.backgroundImage = img;
      canvas.renderAll();
      setImageLoading(false);
    }).catch((error) => {
      console.error('FloorCanvas: Failed to load image:', error);
      setImageError(true);
      setImageLoading(false);
      toast({
        title: 'Fel vid laddning av ritning',
        description: 'Kunde inte ladda ritningen. Försök ladda om sidan.',
        variant: 'destructive',
      });
    });

    setFabricCanvas(canvas);

    canvas.on('selection:created', (e) => {
      const obj: any = e.selected?.[0];
      setSelectedObject(obj);
    });

    canvas.on('selection:updated', (e) => {
      const obj: any = e.selected?.[0];
      setSelectedObject(obj);
    });

    canvas.on('selection:cleared', () => {
      setSelectedObject(null);
    });

    // Double-click to edit component
    canvas.on('mouse:dblclick', (e) => {
      const obj: any = e.target;
      if (obj?.componentId) {
        const component = componentsRef.current.find(c => c.id === obj.componentId);
        if (component) {
          setEditingComponent(component);
          setDialogOpen(true);
        }
      }
    });

    // Mouse wheel zoom
    const handleWheel = (opt: any) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      
      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      
      if (zoom > 5) zoom = 5;
      if (zoom < 0.1) zoom = 0.1;
      
      const point = new Point(e.offsetX, e.offsetY);
      canvas.zoomToPoint(point, zoom);
      setZoom(zoom);
    };
    
    canvas.on('mouse:wheel', handleWheel);

    canvas.on('mouse:move', (e) => {
      // Handle panning with Space or Pan tool
      // Fabric v7: use getScenePoint() or scenePoint instead of pointer
      const scenePoint = e.scenePoint || (e as any).pointer;
      if (isPanning && scenePoint) {
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += scenePoint.x - panStart.current.x;
          vpt[5] += scenePoint.y - panStart.current.y;
          canvas.requestRenderAll();
          panStart.current = { x: scenePoint.x, y: scenePoint.y };
        }
        return;
      }

      // Handle hover effect for components
      const target: any = e.target;
      if (target && target.componentId && scenePoint) {
        target.set({ 
          strokeWidth: 4,
          stroke: '#2563eb',
          fill: 'rgba(37, 99, 235, 0.7)'
        });
        canvas.hoverCursor = 'pointer';
        canvas.renderAll();
        
        // Show tooltip positioned directly next to the component
        const component = componentsRef.current.find(c => c.id === target.componentId);
        if (component) {
          const canvasElement = canvasRef.current;
          if (canvasElement) {
            const rect = canvasElement.getBoundingClientRect();

            // Anchor tooltip to the hovered object (not the mouse), and correctly account for:
            // - Fabric viewportTransform (pan/zoom)
            // - CSS scaling of the canvas element inside the layout
            // - Mobile viewport offsets (VisualViewport) when the page is pinch-zoomed
            const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
            const center = target.getCenterPoint
              ? target.getCenterPoint()
              : { x: target.left || 0, y: target.top || 0 };

            // Transform object center from canvas coords -> viewport coords (Fabric)
            const xVpt = center.x * vpt[0] + center.y * vpt[2] + vpt[4];
            const yVpt = center.x * vpt[1] + center.y * vpt[3] + vpt[5];

            // Map viewport coords (Fabric pixels) -> screen pixels (DOM)
            const scaleX = rect.width / (canvas.getWidth() || rect.width);
            const scaleY = rect.height / (canvas.getHeight() || rect.height);

            const screenX = rect.left + xVpt * scaleX;
            const screenY = rect.top + yVpt * scaleY;

            // Fixed-position elements are laid out against the *layout viewport*, but
            // getBoundingClientRect() is relative to the *visual viewport*.
            // When users pinch-zoom on mobile, we must add VisualViewport offsets.
            const vv = window.visualViewport;
            const viewportOffsetLeft = vv?.offsetLeft ?? 0;
            const viewportOffsetTop = vv?.offsetTop ?? 0;
            const viewportWidth = vv?.width ?? window.innerWidth;
            const viewportHeight = vv?.height ?? window.innerHeight;

            // Position tooltip next to the hovered component point
            const tooltipWidth = 180;
            const tooltipHeight = 90;
            const offsetX = 14;
            const offsetY = 14;

            let finalX = screenX + offsetX + viewportOffsetLeft;
            let finalY = screenY + offsetY + viewportOffsetTop;

            // Keep tooltip within viewport bounds
            if (finalX + tooltipWidth > viewportOffsetLeft + viewportWidth - 10) {
              finalX = screenX - tooltipWidth - 10 + viewportOffsetLeft;
            }
            if (finalY + tooltipHeight > viewportOffsetTop + viewportHeight - 10) {
              finalY = viewportOffsetTop + viewportHeight - tooltipHeight - 10;
            }
            if (finalY < viewportOffsetTop + 10) {
              finalY = viewportOffsetTop + 10;
            }

            setTooltipPosition({ x: finalX, y: finalY });
            setTooltipComponent(component);
            setTooltipVisible(true);
          }
        }
        
        // Reset other objects
        canvas.getObjects().forEach((obj: any) => {
          if (obj.componentId && obj !== target) {
            obj.set({ 
              strokeWidth: 2,
              stroke: '#3b82f6',
              fill: 'rgba(59, 130, 246, 0.5)'
            });
          }
        });
      } else {
        // Hide tooltip
        setTooltipVisible(false);
        setTooltipComponent(null);
        
        // Reset all component objects when not hovering
        canvas.getObjects().forEach((obj: any) => {
          if (obj.componentId) {
            obj.set({ 
              strokeWidth: 2,
              stroke: '#3b82f6',
              fill: 'rgba(59, 130, 246, 0.5)'
            });
          }
        });
        canvas.hoverCursor = activeTool === 'pan' || spacePressed ? 'grab' : 'default';
        canvas.renderAll();
      }
    });

    canvas.on('mouse:down', (e) => {
      // Enable panning with Space key or Pan tool or middle mouse button
      // Fabric v7: use scenePoint instead of pointer
      const scenePoint = e.scenePoint || (e as any).pointer;
      const isMiddleButton = e.e instanceof MouseEvent && e.e.button === 1;
      if ((activeTool === 'pan' || spacePressed || isMiddleButton) && scenePoint) {
        if (isMiddleButton) {
          e.e.preventDefault();
        }
        setIsPanning(true);
        panStart.current = { x: scenePoint.x, y: scenePoint.y };
        canvas.selection = false;
        canvas.defaultCursor = 'grabbing';
      }
    });

    canvas.on('mouse:up', (e) => {
      setIsPanning(false);
      if (activeTool === 'pan' || spacePressed) {
        canvas.selection = activeTool !== 'pan';
        canvas.defaultCursor = activeTool === 'pan' || spacePressed ? 'grab' : 'default';
      }
    });

    // Auto-save component positions when moved
    canvas.on('object:modified', (e) => {
      const obj: any = e.target;
      if (obj && obj.componentId) {
        saveComponentPosition(obj.componentId, obj.left || 0, obj.top || 0);
        toast({
          title: 'Position sparad',
          description: 'Komponentens position uppdaterades automatiskt.',
          duration: 2000,
        });
      }
      saveHistory();
    });

    return () => {
      canvas.dispose();
    };
  }, [drawingUrl, floorId]);

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

    if (gridEnabled) {
      drawGrid();
    } else {
      removeGrid();
    }
  }, [activeTool, fabricCanvas, gridEnabled]);

  const renderComponentsOnCanvas = useCallback((componentsData: any[]) => {
    if (!fabricCanvas) return;

    // Store current positions of components being dragged
    const activeObject = fabricCanvas.getActiveObject();
    const isDragging = activeObject && (activeObject as any).isMoving;

    // Remove all component objects
    fabricCanvas.getObjects().forEach((obj: any) => {
      if (obj.componentId) {
        fabricCanvas.remove(obj);
      }
    });

    // Re-render components from database
    componentsData.forEach((component) => {
      if (component.component_geometry && component.component_geometry.length > 0) {
        const geometry = component.component_geometry[0];
        
        // Store last known position
        lastSavedPositions.current.set(component.id, { x: geometry.x, y: geometry.y });
        
        const circle: any = new Circle({
          left: geometry.x,
          top: geometry.y,
          fill: 'rgba(59, 130, 246, 0.5)',
          stroke: '#3b82f6',
          strokeWidth: 2,
          radius: 5,
          selectable: true,
          evented: true,
          hoverCursor: 'move',
          hasControls: false, // Remove scaling controls
          hasBorders: true,
          lockScalingX: true,
          lockScalingY: true,
        });
        circle.componentId = component.id;
        fabricCanvas.add(circle);
      }
    });
    fabricCanvas.renderAll();
  }, [fabricCanvas]);

  const loadComponents = useCallback(async () => {
    const { data, error } = await supabase
      .from('components')
      .select(`
        *,
        component_geometry (
          x,
          y
        )
      `)
      .eq('floor_id', floorId);

    if (error) {
      console.error('Error loading components:', error);
    } else {
      setComponents(data || []);
      componentsRef.current = data || [];
      renderComponentsOnCanvas(data || []);
    }
  }, [floorId, renderComponentsOnCanvas]);

  useEffect(() => {
    if (!fabricCanvas) return;
    loadComponents();
  }, [fabricCanvas, loadComponents]);

  const drawGrid = () => {
    if (!fabricCanvas) return;
    
    const gridSize = 20;
    const width = fabricCanvas.width || 1200;
    const height = fabricCanvas.height || 800;

    for (let i = 0; i < (width / gridSize); i++) {
      const lineV = new Line([i * gridSize, 0, i * gridSize, height], {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (lineV as any).isGrid = true;
      fabricCanvas.add(lineV);
    }

    for (let i = 0; i < (height / gridSize); i++) {
      const lineH = new Line([0, i * gridSize, width, i * gridSize], {
        stroke: '#e5e7eb',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (lineH as any).isGrid = true;
      fabricCanvas.add(lineH);
    }
    
    const gridObjects = fabricCanvas.getObjects().filter((obj: any) => obj.isGrid);
    gridObjects.forEach(obj => fabricCanvas.sendObjectToBack(obj));
  };

  const removeGrid = () => {
    if (!fabricCanvas) return;
    fabricCanvas.getObjects().forEach((obj: any) => {
      if (obj.isGrid) fabricCanvas.remove(obj);
    });
  };

  const saveHistory = () => {
    if (!fabricCanvas) return;
    const json = fabricCanvas.toJSON();
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(json);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyStep > 0 && fabricCanvas) {
      const step = historyStep - 1;
      setHistoryStep(step);
      fabricCanvas.loadFromJSON(history[step], () => {
        fabricCanvas.renderAll();
      });
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1 && fabricCanvas) {
      const step = historyStep + 1;
      setHistoryStep(step);
      fabricCanvas.loadFromJSON(history[step], () => {
        fabricCanvas.renderAll();
      });
    }
  };

  const handleZoomIn = () => {
    if (!fabricCanvas) return;
    const center = new Point(fabricCanvas.width! / 2, fabricCanvas.height! / 2);
    const newZoom = Math.min(zoom * 1.2, 5);
    setZoom(newZoom);
    fabricCanvas.zoomToPoint(center, newZoom);
    fabricCanvas.renderAll();
  };

  const handleZoomOut = () => {
    if (!fabricCanvas) return;
    const center = new Point(fabricCanvas.width! / 2, fabricCanvas.height! / 2);
    const newZoom = Math.max(zoom / 1.2, 0.1);
    setZoom(newZoom);
    fabricCanvas.zoomToPoint(center, newZoom);
    fabricCanvas.renderAll();
  };

  const handleExport = () => {
    if (!fabricCanvas) return;
    const dataURL = fabricCanvas.toDataURL({
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
  };

  const handleToolClick = (tool: string) => {
    setActiveTool(tool);
    setEditingComponent(null);
    setSelectedTemplate(null);

    if (tool === 'line' && fabricCanvas) {
      const line = new Line([50, 50, 200, 50], {
        stroke: '#3b82f6',
        strokeWidth: 3,
      });
      fabricCanvas.add(line);
      fabricCanvas.setActiveObject(line);
      saveHistory();
    } else if (tool === 'rectangle' && fabricCanvas) {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.3)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        width: 150,
        height: 100,
      });
      fabricCanvas.add(rect);
      fabricCanvas.setActiveObject(rect);
      saveHistory();
    } else if (tool === 'circle' && fabricCanvas) {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.3)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        radius: 50,
      });
      fabricCanvas.add(circle);
      fabricCanvas.setActiveObject(circle);
      saveHistory();
    } else if (tool === 'text' && fabricCanvas) {
      const text = new FabricText('Dubbelklicka för att redigera', {
        left: 100,
        top: 100,
        fontSize: 20,
        fill: '#333',
        editable: true,
      });
      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      saveHistory();
    }
  };

  const handleTemplateSelect = (template: ComponentTemplate) => {
    if (!fabricCanvas) return;
    
    const shape = new Circle({
      left: 150,
      top: 150,
      fill: template.color + '80',
      stroke: template.color,
      strokeWidth: 2,
      radius: 20,
    });
    (shape as any).componentId = null;
    (shape as any).componentType = template.type;
    
    fabricCanvas.add(shape);
    fabricCanvas.setActiveObject(shape);
    setSelectedObject(shape);
    setSelectedTemplate(template);
    setEditingComponent(null);
    setDialogOpen(true);
    saveHistory();
  };

  const handleExistingComponentSelect = async (component: Component) => {
    if (!fabricCanvas) return;
    
    // Place the existing component on the canvas
    const shape = new Circle({
      left: 150,
      top: 150,
      fill: 'rgba(59, 130, 246, 0.5)',
      stroke: '#3b82f6',
      strokeWidth: 2,
      radius: 15,
    });
    (shape as any).existingComponentId = component.id;
    
    fabricCanvas.add(shape);
    fabricCanvas.setActiveObject(shape);
    
    toast({
      title: 'Placera komponenten',
      description: 'Dra komponenten till rätt position och klicka "Spara position" för att bekräfta.',
    });
    
    saveHistory();
  };

  const handleSaveComponentPosition = async () => {
    if (!fabricCanvas || !selectedObject) return;
    
    const existingComponentId = (selectedObject as any).existingComponentId;
    if (!existingComponentId) return;

    // Delete existing geometry if any
    await supabase
      .from('component_geometry')
      .delete()
      .eq('component_id', existingComponentId);

    // Save new position
    const { error } = await supabase
      .from('component_geometry')
      .insert({
        component_id: existingComponentId,
        x: selectedObject.left || 0,
        y: selectedObject.top || 0,
      });

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      // Ask if user wants to update floor_id for this component
      const shouldUpdateFloor = window.confirm(
        'Vill du koppla komponenten till denna våning?'
      );
      
      if (shouldUpdateFloor) {
        await supabase
          .from('components')
          .update({ floor_id: floorId })
          .eq('id', existingComponentId);
      }
      
      toast({
        title: 'Position sparad',
        description: shouldUpdateFloor 
          ? 'Komponentens position och våningskoppling har sparats.'
          : 'Komponentens position har sparats.',
      });
      loadComponents();
      fabricCanvas.remove(selectedObject);
      setSelectedObject(null);
    }
  };

  const handleComponentSaved = (componentId?: string) => {
    loadComponents();
    onUpdate();
    if (selectedObject) {
      fabricCanvas?.remove(selectedObject);
      setSelectedObject(null);
    }
    setSelectedTemplate(null);
    setEditingComponent(null);
  };

  return (
    <div className="flex gap-4">
      <ComponentLibraryPanel 
        onSelectTemplate={handleTemplateSelect}
        propertyId={propertyId}
        onSelectExistingComponent={handleExistingComponentSelect}
      />
      
      <div className="flex-1 flex flex-col gap-4">
        {/* Back button */}
        {onBack && (
          <Button 
            variant="outline" 
            onClick={onBack}
            className="w-fit"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till fastighet
          </Button>
        )}
        
        {selectedObject && (selectedObject as any).existingComponentId && (
          <Button onClick={handleSaveComponentPosition} size="lg">
            Spara position
          </Button>
        )}
        
        <div className="bg-muted/30 p-2 rounded-lg text-sm text-muted-foreground">
          💡 Tips: Tryck mellanslag eller använd mellersta musknappen för att panorera. Dubbelklicka på komponent för att redigera.
        </div>
        
        <CanvasToolbar
          activeTool={activeTool}
          onToolClick={handleToolClick}
          onClear={() => {
            if (fabricCanvas) {
              fabricCanvas.clear();
              fabricCanvas.backgroundColor = '#ffffff';
              fabricCanvas.renderAll();
              saveHistory();
              toast({ title: 'Canvas rensad!' });
            }
          }}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onExport={handleExport}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onToggleGrid={() => setGridEnabled(!gridEnabled)}
          canUndo={historyStep > 0}
          canRedo={historyStep < history.length - 1}
          gridEnabled={gridEnabled}
        />
        
        <div className="border-2 border-border rounded-lg overflow-hidden shadow-[var(--shadow-card)] bg-white relative">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground">Laddar ritning...</p>
              </div>
            </div>
          )}
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 z-10">
              <div className="text-center space-y-2 p-4">
                <p className="text-destructive font-semibold">⚠️ Kunde inte ladda ritningen</p>
                <p className="text-sm text-muted-foreground">Försök ladda om sidan eller kontrollera din internetanslutning</p>
                <Button 
                  onClick={() => window.location.reload()} 
                  variant="outline"
                  size="sm"
                >
                  Ladda om sidan
                </Button>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} />
          {spacePressed && (
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm font-medium">
              Panoreringläge
            </div>
          )}
        </div>

        {/* Tooltip */}
        {tooltipVisible && tooltipComponent && (
          <div
            className="fixed z-50 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg pointer-events-none"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
            }}
          >
            <div className="space-y-1 text-sm">
              <div className="font-semibold text-foreground">{tooltipComponent.name}</div>
              <div className="text-muted-foreground">{tooltipComponent.type}</div>
              {tooltipComponent.manufacturer && (
                <div className="text-muted-foreground">
                  {tooltipComponent.manufacturer}
                </div>
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
          canvasPosition={selectedObject && !editingComponent ? { x: selectedObject.left || 0, y: selectedObject.top || 0 } : null}
          onSuccess={handleComponentSaved}
        />
      </div>
    </div>
  );
};
