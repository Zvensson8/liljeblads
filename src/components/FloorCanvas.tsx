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
}

export const FloorCanvas = ({ floorId, drawingUrl, onUpdate }: FloorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [componentName, setComponentName] = useState('');
  const [componentType, setComponentType] = useState('hvac');
  const [componentStatus, setComponentStatus] = useState('active');
  const [supplier, setSupplier] = useState('');
  const [affCode, setAffCode] = useState('');
  const [notes, setNotes] = useState('');
  const [roomZone, setRoomZone] = useState('');
  const [components, setComponents] = useState<Component[]>([]);
  const componentsRef = useRef<Component[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
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
          setEditMode(true);
          populateFormFromComponent(component);
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
          setEditMode(true);
          populateFormFromComponent(component);
          setDialogOpen(true);
        }
      }
    });

    canvas.on('selection:cleared', () => {
      setSelectedObject(null);
    });

    canvas.on('mouse:over', (e) => {
      const obj: any = e.target;
      if (obj && obj.componentId) {
        const component = componentsRef.current.find(c => c.id === obj.componentId);
        if (component) {
          obj.set({ strokeWidth: 4 });
          canvas.renderAll();
        }
      }
    });

    canvas.on('mouse:out', (e) => {
      const obj: any = e.target;
      if (obj && obj.componentId) {
        obj.set({ strokeWidth: 2 });
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

  const populateFormFromComponent = (component: Component) => {
    setComponentName(component.name);
    setComponentType(component.type);
    setComponentStatus(component.status);
    setSupplier(component.supplier || '');
    setAffCode(component.aff_code || '');
    setNotes(component.notes || '');
    setRoomZone(component.room_zone || '');
  };

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
    setEditMode(false);
    setEditingComponent(null);
    resetForm();

    if (tool === 'circle' && fabricCanvas) {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.5)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        radius: 15,
      });
      (circle as any).componentId = null;
      fabricCanvas.add(circle);
      fabricCanvas.setActiveObject(circle);
      setSelectedObject(circle);
      setDialogOpen(true);
      saveHistory();
    } else if (tool === 'rectangle' && fabricCanvas) {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.5)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        width: 60,
        height: 40,
      });
      (rect as any).componentId = null;
      fabricCanvas.add(rect);
      fabricCanvas.setActiveObject(rect);
      setSelectedObject(rect);
      setDialogOpen(true);
      saveHistory();
    } else if (tool === 'line' && fabricCanvas) {
      const line = new Line([50, 50, 200, 50], {
        stroke: '#3b82f6',
        strokeWidth: 3,
      });
      (line as any).componentId = null;
      fabricCanvas.add(line);
      fabricCanvas.setActiveObject(line);
      setSelectedObject(line);
      setDialogOpen(true);
      saveHistory();
    } else if (tool === 'text' && fabricCanvas) {
      const text = new FabricText('Dubbelklicka för att redigera', {
        left: 100,
        top: 100,
        fontSize: 20,
        fill: '#333',
      });
      (text as any).componentId = null;
      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      saveHistory();
    }
  };

  const handleTemplateSelect = (template: any) => {
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
    setComponentType(template.type);
    setComponentName(template.name);
    setDialogOpen(true);
    saveHistory();
  };

  const handleSaveComponent = async () => {
    if (!selectedObject || !componentName) {
      toast({
        title: 'Fel',
        description: 'Välj ett objekt och fyll i namn',
        variant: 'destructive',
      });
      return;
    }

    if (editMode && editingComponent) {
      const { error: componentError } = await supabase
        .from('components')
        .update({
          name: componentName,
          type: componentType as any,
          status: componentStatus as any,
          supplier: supplier || null,
          aff_code: affCode || null,
          notes: notes || null,
          room_zone: roomZone || null,
        })
        .eq('id', editingComponent.id);

      if (componentError) {
        toast({
          title: 'Fel',
          description: componentError.message,
          variant: 'destructive',
        });
        return;
      }

      const { error: geometryError } = await supabase
        .from('component_geometry')
        .update({
          x: selectedObject.left,
          y: selectedObject.top,
        })
        .eq('component_id', editingComponent.id);

      if (geometryError) {
        toast({
          title: 'Fel',
          description: geometryError.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Komponent uppdaterad!',
        description: `${componentName} har uppdaterats.`,
      });
    } else {
      const { data: componentData, error: componentError } = await supabase
        .from('components')
        .insert([{
          floor_id: floorId,
          name: componentName,
          type: componentType as any,
          status: componentStatus as any,
          supplier: supplier || null,
          aff_code: affCode || null,
          notes: notes || null,
          room_zone: roomZone || null,
        }])
        .select()
        .single();

      if (componentError) {
        toast({
          title: 'Fel',
          description: componentError.message,
          variant: 'destructive',
        });
        return;
      }

      const { error: geometryError } = await supabase
        .from('component_geometry')
        .insert([{
          component_id: componentData.id,
          x: selectedObject.left,
          y: selectedObject.top,
        }]);

      if (geometryError) {
        toast({
          title: 'Fel',
          description: geometryError.message,
          variant: 'destructive',
        });
        return;
      }

      (selectedObject as any).componentId = componentData.id;

      toast({
        title: 'Komponent sparad!',
        description: `${componentName} har lagts till på ritningen.`,
      });
    }

    setDialogOpen(false);
    setEditMode(false);
    setEditingComponent(null);
    resetForm();
    loadComponents();
    onUpdate();
  };

  const handleDeleteComponent = async () => {
    if (!editingComponent) return;

    const { error } = await supabase
      .from('components')
      .delete()
      .eq('id', editingComponent.id);

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    if (fabricCanvas && selectedObject) {
      fabricCanvas.remove(selectedObject);
    }

    toast({
      title: 'Komponent borttagen!',
      description: `${editingComponent.name} har tagits bort.`,
    });

    setDialogOpen(false);
    setEditMode(false);
    setEditingComponent(null);
    setSelectedObject(null);
    resetForm();
    loadComponents();
    onUpdate();
  };

  const resetForm = () => {
    setComponentName('');
    setComponentType('hvac');
    setComponentStatus('active');
    setSupplier('');
    setAffCode('');
    setNotes('');
    setRoomZone('');
  };

  return (
    <div className="flex gap-4">
      <ComponentLibraryPanel onSelectTemplate={handleTemplateSelect} />
      
      <div className="flex-1 flex flex-col gap-4">
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

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editMode ? 'Redigera komponent' : 'Spara komponent'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="componentName">Namn *</Label>
                <Input
                  id="componentName"
                  value={componentName}
                  onChange={(e) => setComponentName(e.target.value)}
                  placeholder="T.ex. Värmepump VP-101"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="componentType">Typ *</Label>
                  <Select value={componentType} onValueChange={setComponentType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hvac">HVAC</SelectItem>
                      <SelectItem value="heat_pump">Värmepump</SelectItem>
                      <SelectItem value="ventilation">Ventilation</SelectItem>
                      <SelectItem value="radiator">Radiator</SelectItem>
                      <SelectItem value="fan">Fläkt</SelectItem>
                      <SelectItem value="water_heater">Varmvattenberedare</SelectItem>
                      <SelectItem value="electrical">El</SelectItem>
                      <SelectItem value="plumbing">VVS</SelectItem>
                      <SelectItem value="fire_safety">Brandskydd</SelectItem>
                      <SelectItem value="security">Säkerhet</SelectItem>
                      <SelectItem value="other">Övrigt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="componentStatus">Status *</Label>
                  <Select value={componentStatus} onValueChange={setComponentStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="inactive">Inaktiv</SelectItem>
                      <SelectItem value="maintenance">Underhåll</SelectItem>
                      <SelectItem value="decommissioned">Utfasad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier">Leverantör</Label>
                  <Input
                    id="supplier"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="T.ex. Företag AB"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="affCode">AFF-kod</Label>
                  <Input
                    id="affCode"
                    value={affCode}
                    onChange={(e) => setAffCode(e.target.value)}
                    placeholder="T.ex. AFF-123"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="roomZone">Rum/Zon</Label>
                <Input
                  id="roomZone"
                  value={roomZone}
                  onChange={(e) => setRoomZone(e.target.value)}
                  placeholder="T.ex. Källare, Zon A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Anteckningar</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ytterligare information..."
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveComponent} className="flex-1">
                  {editMode ? 'Uppdatera' : 'Spara'} komponent
                </Button>
                {editMode && (
                  <Button onClick={handleDeleteComponent} variant="destructive">
                    Ta bort
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
