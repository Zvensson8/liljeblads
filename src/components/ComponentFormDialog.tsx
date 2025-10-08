import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ComponentTemplate } from '@/hooks/useComponentLibrary';

interface ComponentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorId: string;
  propertyId?: string;
  selectedTemplate?: ComponentTemplate | null;
  editingComponent?: any;
  onSuccess: () => void;
}

export const ComponentFormDialog = ({ 
  open, 
  onOpenChange, 
  floorId,
  propertyId,
  selectedTemplate,
  editingComponent,
  onSuccess 
}: ComponentFormDialogProps) => {
  const { toast } = useToast();
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [designation, setDesignation] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [componentType, setComponentType] = useState('');
  const [installationYear, setInstallationYear] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [placement, setPlacement] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      fetchProperties();
      
      if (editingComponent) {
        // Populate form with existing data
        setDesignation(editingComponent.name || '');
        setRegistrationNumber(editingComponent.registration_number || '');
        setComponentType(editingComponent.type || '');
        setInstallationYear(editingComponent.installation_year?.toString() || '');
        setManufacturer(editingComponent.manufacturer || '');
        setModel(editingComponent.model || '');
        setSerialNumber(editingComponent.serial_number || '');
        setPlacement(editingComponent.room_zone || '');
        setNotes(editingComponent.notes || '');
      } else if (selectedTemplate) {
        // Pre-fill type from template
        setComponentType(selectedTemplate.type);
      }
    }
  }, [open, editingComponent, selectedTemplate]);

  useEffect(() => {
    if (propertyId) {
      setSelectedProperty(propertyId);
    }
  }, [propertyId]);

  const fetchProperties = async () => {
    const { data } = await supabase
      .from('properties')
      .select('id, name')
      .order('name');
    
    if (data) {
      setProperties(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const componentData = {
      name: designation,
      registration_number: registrationNumber || null,
      type: componentType as any,
      installation_year: installationYear ? parseInt(installationYear) : null,
      manufacturer: manufacturer || null,
      model: model || null,
      serial_number: serialNumber || null,
      room_zone: placement || null,
      notes: notes || null,
      status: 'active' as const,
      floor_id: floorId,
    };

    try {
      if (editingComponent) {
        // Update existing component
        const { error } = await supabase
          .from('components')
          .update(componentData)
          .eq('id', editingComponent.id);

        if (error) throw error;

        toast({
          title: 'Komponent uppdaterad!',
          description: `${designation} har uppdaterats.`,
        });
      } else {
        // Create new component
        const { error } = await supabase
          .from('components')
          .insert([componentData]);

        if (error) throw error;

        toast({
          title: 'Komponent skapad!',
          description: `${designation} har lagts till.`,
        });
      }

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDesignation('');
    setRegistrationNumber('');
    setComponentType('');
    setInstallationYear('');
    setManufacturer('');
    setModel('');
    setSerialNumber('');
    setPlacement('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingComponent ? 'Redigera komponent' : 'Ny komponent'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="designation">
                Beteckning <span className="text-destructive">*</span>
              </Label>
              <Input
                id="designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="t.ex. VP-01-Källare"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="registrationNumber">Reg.nr</Label>
              <Input
                id="registrationNumber"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="t.ex. REG-123456"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="property">
                Fastighet <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedProperty} onValueChange={setSelectedProperty} disabled>
                <SelectTrigger id="property">
                  <SelectValue placeholder="Välj fastighet" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="componentType">
                Komponenttyp <span className="text-destructive">*</span>
              </Label>
              <Select value={componentType} onValueChange={setComponentType} required>
                <SelectTrigger id="componentType">
                  <SelectValue placeholder="Välj komponenttyp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="heat_pump">Värmepump</SelectItem>
                  <SelectItem value="ventilation">Ventilationsaggregat</SelectItem>
                  <SelectItem value="electrical">Elcentral</SelectItem>
                  <SelectItem value="district_heating">Fjärrvärmecentral</SelectItem>
                  <SelectItem value="entrance">Entréparti</SelectItem>
                  <SelectItem value="motorized_gate">Maskindriven Port</SelectItem>
                  <SelectItem value="loading_dock">Lastbrygga</SelectItem>
                  <SelectItem value="cooling">Kylaggregat</SelectItem>
                  <SelectItem value="other">Övrigt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="installationYear">Installationsår</Label>
              <Input
                id="installationYear"
                type="number"
                value={installationYear}
                onChange={(e) => setInstallationYear(e.target.value)}
                placeholder="t.ex. 2025"
                min="1900"
                max="2100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manufacturer">Tillverkare</Label>
              <Input
                id="manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="t.ex. NIBE"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Modell</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="t.ex. F2120"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="serialNumber">Serie-ID</Label>
              <Input
                id="serialNumber"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="t.ex. SN-54982156"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="placement">Placering</Label>
              <Input
                id="placement"
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                placeholder="t.ex. Pannrum källare"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="notes">Anteckningar</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ytterligare information om komponenten..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Sparar...' : (editingComponent ? 'Uppdatera' : 'Skapa')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
