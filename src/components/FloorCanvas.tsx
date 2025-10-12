import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas as FabricCanvas, Circle, Rect, Line, FabricText, FabricImage } from 'fabric';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useToast } from '@/hooks/use-toast';
import { CanvasToolbar } from './CanvasToolbar';
import { ComponentLibraryPanel } from './ComponentLibraryPanel';
import { ComponentFormDialog } from './ComponentFormDialog';
import { ComponentTemplate } from '@/hooks/useComponentLibrary';

interface FloorCanvasProps {
  floorId: string;
  drawingUrl: string;
  onUpdate: () => void;
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

export const FloorCanvas = ({ floorId, drawingUrl, onUpdate }: FloorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ComponentTemplate | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const componentsRef = useRef<Component[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [propertyId, setPropertyId] = useState<string>('');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipComponent, setTooltipComponent] = useState<Component | null>(null);
  const panStart = useRef({ x: 0, y: 0 });
  const { toast } = useToast();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fabricCanvas, historyStep]);

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

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: '#ffffff',
    });

    FabricImage.fromURL(drawingUrl, {
      crossOrigin: 'anonymous',
    }).then((img) => {
      const scale = Math.min(
        canvas.width! / img.width!,
        canvas.height! / img.height!
      );
      img.scale(scale);
      canvas.backgroundImage = img;
      canvas.renderAll();
    });

    setFabricCanvas(canvas);

    canvas.on('selection:created', (e) => {
      const obj: any = e.selected?.[0];
      setSelectedObject(obj);
      if (obj?.componentId) {
        const component = componentsRef.current.find(c => c.id === obj.componentId);
        if (component) {
          setEditingComponent(component);
          setDialogOpen(true);
        }
      }
    });

    canvas.on('selection:updated', (e) => {
      const obj: any = e.selected?.[0];
      setSelectedObject(obj);
      if (obj?.componentId) {
        const component = componentsRef.current.find(c => c.id === obj.componentId);
        if (component) {
          setEditingComponent(component);
          setDialogOpen(true);
        }
      }
    });

    canvas.on('selection:cleared', () => {
      setSelectedObject(null);
    });

    canvas.on('mouse:move', (e) => {
      if (isPanning && activeTool === 'pan' && e.pointer) {
        const delta = {
          x: e.pointer.x - panStart.current.x,
          y: e.pointer.y - panStart.current.y
        };
        canvas.viewportTransform![4] += delta.x;
        canvas.viewportTransform![5] += delta.y;
        canvas.requestRenderAll();
        panStart.current = { x: e.pointer.x, y: e.pointer.y };
        return;
      }

      // Handle hover effect for components
      const target: any = e.target;
      if (target && target.componentId && e.pointer) {
        target.set({ 
          strokeWidth: 4,
          stroke: '#2563eb',
          fill: 'rgba(37, 99, 235, 0.7)'
        });
        canvas.hoverCursor = 'pointer';
        canvas.renderAll();
        
        // Show tooltip
        const component = componentsRef.current.find(c => c.id === target.componentId);
        if (component) {
          const canvasElement = canvasRef.current;
          if (canvasElement) {
            const rect = canvasElement.getBoundingClientRect();
            setTooltipPosition({
              x: rect.left + e.pointer.x + 15,
              y: rect.top + e.pointer.y - 10
            });
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
        canvas.hoverCursor = activeTool === 'pan' ? 'grab' : 'default';
        canvas.renderAll();
      }
    });

    canvas.on('mouse:down', (e) => {
      if (activeTool === 'pan' && e.pointer) {
        setIsPanning(true);
        panStart.current = { x: e.pointer.x, y: e.pointer.y };
        canvas.selection = false;
      }
    });

    canvas.on('mouse:move', (e) => {
      if (isPanning && activeTool === 'pan' && e.pointer) {
        const delta = {
          x: e.pointer.x - panStart.current.x,
          y: e.pointer.y - panStart.current.y
        };
        canvas.viewportTransform![4] += delta.x;
        canvas.viewportTransform![5] += delta.y;
        canvas.requestRenderAll();
        panStart.current = { x: e.pointer.x, y: e.pointer.y };
      }
    });

    canvas.on('mouse:up', () => {
      setIsPanning(false);
      if (activeTool === 'pan') {
        canvas.selection = true;
      }
    });

    canvas.on('object:modified', () => {
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

    fabricCanvas.getObjects().forEach((obj: any) => {
      if (obj.componentId) {
        fabricCanvas.remove(obj);
      }
    });

    componentsData.forEach((component) => {
      if (component.component_geometry && component.component_geometry.length > 0) {
        const geometry = component.component_geometry[0];
        const circle: any = new Circle({
          left: geometry.x,
          top: geometry.y,
          fill: 'rgba(59, 130, 246, 0.5)',
          stroke: '#3b82f6',
          strokeWidth: 2,
          radius: 15,
          selectable: true,
          evented: true,
          hoverCursor: 'pointer',
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
    const newZoom = Math.min(zoom * 1.2, 5);
    setZoom(newZoom);
    fabricCanvas.setZoom(newZoom);
    fabricCanvas.renderAll();
  };

  const handleZoomOut = () => {
    if (!fabricCanvas) return;
    const newZoom = Math.max(zoom / 1.2, 0.1);
    setZoom(newZoom);
    fabricCanvas.setZoom(newZoom);
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
      toast({
        title: 'Position sparad',
        description: 'Komponentens position har sparats.',
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
        {selectedObject && (selectedObject as any).existingComponentId && (
          <Button onClick={handleSaveComponentPosition} size="lg">
            Spara position
          </Button>
        )}
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
        
        <div className="border-2 border-border rounded-lg overflow-hidden shadow-[var(--shadow-card)] bg-white">
          <canvas ref={canvasRef} />
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
