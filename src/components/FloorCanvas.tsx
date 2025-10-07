import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas as FabricCanvas, Circle, Rect, FabricImage } from 'fabric';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Circle as CircleIcon, Square, Trash2 } from 'lucide-react';

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
  const [activeTool, setActiveTool] = useState<'select' | 'circle' | 'rectangle'>('select');
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const componentsRef = useRef<Component[]>([]);
  const { toast } = useToast();

  // Form state
  const [componentName, setComponentName] = useState('');
  const [componentType, setComponentType] = useState('hvac');
  const [componentStatus, setComponentStatus] = useState('active');
  const [supplier, setSupplier] = useState('');
  const [affCode, setAffCode] = useState('');
  const [notes, setNotes] = useState('');
  const [roomZone, setRoomZone] = useState('');

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: '#1a1f2e',
    });

    // Load background image
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
      const target: any = e.target;
      if (target?.componentId) {
        const component = componentsRef.current.find(c => c.id === target.componentId);
        if (component) {
          const info = `${component.name}${component.supplier ? ' - ' + component.supplier : ''}${component.aff_code ? ' (' + component.aff_code + ')' : ''}`;
          target.set('strokeWidth', 4);
          canvas.renderAll();
          // Show tooltip via title attribute (browser native)
          if (canvasRef.current) {
            canvasRef.current.title = info;
          }
        }
      }
    });

    canvas.on('mouse:out', (e) => {
      const target: any = e.target;
      if (target?.componentId) {
        target.set('strokeWidth', 2);
        canvas.renderAll();
        if (canvasRef.current) {
          canvasRef.current.title = '';
        }
      }
    });

    return () => {
      canvas.dispose();
    };
  }, [drawingUrl, floorId]);

  const renderComponentsOnCanvas = useCallback((componentsData: any[]) => {
    if (!fabricCanvas) return;

    // Clear existing component objects from canvas
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
          radius: 10,
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
    fabricCanvas.isDrawingMode = false;
  }, [activeTool, fabricCanvas]);

  // Load components when canvas is ready
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

  const handleToolClick = (tool: typeof activeTool) => {
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
        radius: 10,
      });
      fabricCanvas.add(circle);
      fabricCanvas.setActiveObject(circle);
      setSelectedObject(circle);
      setDialogOpen(true);
    } else if (tool === 'rectangle' && fabricCanvas) {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.5)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        width: 20,
        height: 20,
      });
      fabricCanvas.add(rect);
      fabricCanvas.setActiveObject(rect);
      setSelectedObject(rect);
      setDialogOpen(true);
    }
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
      // Update existing component
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

      // Update geometry
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
      // Create new component
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

      // Save geometry
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

      // Update the object with component ID for future interactions
      selectedObject.componentId = componentData.id;

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

  const handleDeleteObject = () => {
    if (!fabricCanvas || !selectedObject) return;
    fabricCanvas.remove(selectedObject);
    setSelectedObject(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeTool === 'select' ? 'default' : 'outline'}
          onClick={() => handleToolClick('select')}
        >
          Markera
        </Button>
        <Button
          variant={activeTool === 'circle' ? 'default' : 'outline'}
          onClick={() => handleToolClick('circle')}
        >
          <CircleIcon className="h-4 w-4 mr-2" />
          Cirkel
        </Button>
        <Button
          variant={activeTool === 'rectangle' ? 'default' : 'outline'}
          onClick={() => handleToolClick('rectangle')}
        >
          <Square className="h-4 w-4 mr-2" />
          Rektangel
        </Button>
        {selectedObject && (
          <>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              Spara som komponent
            </Button>
            <Button variant="destructive" onClick={handleDeleteObject}>
              <Trash2 className="h-4 w-4 mr-2" />
              Ta bort
            </Button>
          </>
        )}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
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
                  <Trash2 className="h-4 w-4 mr-2" />
                  Ta bort
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
