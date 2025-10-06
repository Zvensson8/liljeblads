import { useEffect, useRef, useState } from 'react';
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
  const [components, setComponents] = useState<Component[]>([]);
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
    loadComponents();

    canvas.on('selection:created', (e) => {
      setSelectedObject(e.selected?.[0]);
    });

    canvas.on('selection:updated', (e) => {
      setSelectedObject(e.selected?.[0]);
    });

    canvas.on('selection:cleared', () => {
      setSelectedObject(null);
    });

    return () => {
      canvas.dispose();
    };
  }, [drawingUrl, floorId]);

  useEffect(() => {
    if (!fabricCanvas) return;
    fabricCanvas.isDrawingMode = false;
  }, [activeTool, fabricCanvas]);

  const loadComponents = async () => {
    const { data, error } = await supabase
      .from('components')
      .select('*')
      .eq('floor_id', floorId);

    if (error) {
      console.error('Error loading components:', error);
    } else {
      setComponents(data || []);
    }
  };

  const handleToolClick = (tool: typeof activeTool) => {
    setActiveTool(tool);

    if (tool === 'circle' && fabricCanvas) {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.5)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        radius: 30,
      });
      fabricCanvas.add(circle);
      fabricCanvas.setActiveObject(circle);
    } else if (tool === 'rectangle' && fabricCanvas) {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: 'rgba(59, 130, 246, 0.5)',
        stroke: '#3b82f6',
        strokeWidth: 2,
        width: 80,
        height: 80,
      });
      fabricCanvas.add(rect);
      fabricCanvas.setActiveObject(rect);
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

    toast({
      title: 'Komponent sparad!',
      description: `${componentName} har lagts till på ritningen.`,
    });

    setDialogOpen(false);
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
            <DialogTitle>Spara komponent</DialogTitle>
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
            <Button onClick={handleSaveComponent} className="w-full">
              Spara komponent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
