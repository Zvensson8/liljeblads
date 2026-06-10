import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useProperties } from '@/hooks/useProperties';
import { useCreateComponent, useUpdateComponent } from '@/hooks/useComponents';
import { ComponentTemplate } from '@/hooks/useComponentLibrary';
import { z } from 'zod';
import { MaintenanceHistoryDialog } from './MaintenanceHistoryDialog';
import { ComponentServicePlanSection } from './ComponentServicePlanSection';
import { getErrorMessage } from '@/lib/utils';
import type { Tables, TablesInsert, TablesUpdate, Database } from '@/integrations/supabase/types';

type ComponentRow = Tables<'components'>;
type ComponentType = Database['public']['Enums']['component_type'];

const componentSchema = z.object({
  name: z.string().trim().min(1, 'Beteckning är obligatorisk').max(200, 'Beteckning får vara max 200 tecken'),
  registration_number: z.string().max(100, 'Reg.nr får vara max 100 tecken').optional().or(z.literal('')),
  type: z.string().min(1, 'Komponenttyp är obligatorisk'),
  installation_year: z.number().int().min(1900, 'Installationsår måste vara minst 1900').max(2100, 'Installationsår får vara max 2100').optional().nullable(),
  manufacturer: z.string().max(100, 'Tillverkare får vara max 100 tecken').optional().or(z.literal('')),
  model: z.string().max(100, 'Modell får vara max 100 tecken').optional().or(z.literal('')),
  serial_number: z.string().max(100, 'Serie-ID får vara max 100 tecken').optional().or(z.literal('')),
  room_zone: z.string().max(200, 'Placering får vara max 200 tecken').optional().or(z.literal('')),
  notes: z.string().max(5000, 'Anteckningar får vara max 5000 tecken').optional().or(z.literal('')),
  refrigerant_code: z.string().max(50, 'Kod får vara max 50 tecken').optional().or(z.literal('')),
  refrigerant_amount_kg: z.number().positive('Fyllnadsmängd måste vara positiv').optional().nullable(),
  refrigerant_type: z.string().max(100, 'Köldmedietyp får vara max 100 tecken').optional().or(z.literal('')),
});

interface ComponentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorId: string;
  propertyId?: string;
  selectedTemplate?: ComponentTemplate | null;
  editingComponent?: Partial<Omit<ComponentRow, 'status'>> & { id: string; status?: string | null };
  canvasPosition?: { x: number; y: number } | null;
  onSuccess: (componentId?: string) => void;
}

export const ComponentFormDialog = ({ 
  open, 
  onOpenChange, 
  floorId,
  propertyId,
  selectedTemplate,
  editingComponent,
  canvasPosition,
  onSuccess 
}: ComponentFormDialogProps) => {
  const { toast } = useToast();
  const { data: properties = [] } = useProperties();
  const createComponent = useCreateComponent();
  const updateComponent = useUpdateComponent();
  const [loading, setLoading] = useState(false);
  const [newComponentId, setNewComponentId] = useState<string | null>(null);
  const [showServicePlan, setShowServicePlan] = useState(false);
  
  // Form fields
  const [designation, setDesignation] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<string | undefined>(undefined);
  const [componentType, setComponentType] = useState<string | undefined>(undefined);
  const [installationYear, setInstallationYear] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [placement, setPlacement] = useState('');
  const [notes, setNotes] = useState('');
  const [refrigerantCode, setRefrigerantCode] = useState('');
  const [refrigerantAmount, setRefrigerantAmount] = useState('');
  const [refrigerantType, setRefrigerantType] = useState('');

  useEffect(() => {
    if (open) {
      // properties fetched via useProperties hook
      setNewComponentId(null);
      setShowServicePlan(false);
      
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
        setRefrigerantCode(editingComponent.refrigerant_code || '');
        setRefrigerantAmount(editingComponent.refrigerant_amount_kg?.toString() || '');
        setRefrigerantType(editingComponent.refrigerant_type || '');
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


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate input data
    const validationData = {
      name: designation,
      registration_number: registrationNumber || '',
      type: componentType,
      installation_year: installationYear ? parseInt(installationYear) : null,
      manufacturer: manufacturer || '',
      model: model || '',
      serial_number: serialNumber || '',
      room_zone: placement || '',
      notes: notes || '',
      refrigerant_code: refrigerantCode || '',
      refrigerant_amount_kg: refrigerantAmount ? parseFloat(refrigerantAmount) : null,
      refrigerant_type: refrigerantType || '',
    };

    try {
      // Validate with Zod
      componentSchema.parse(validationData);

      const componentData: TablesInsert<'components'> = {
        name: designation.trim(),
        registration_number: registrationNumber.trim() || null,
        type: componentType as ComponentType,
        installation_year: installationYear ? parseInt(installationYear) : null,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial_number: serialNumber.trim() || null,
        room_zone: placement.trim() || null,
        notes: notes.trim() || null,
        refrigerant_code: refrigerantCode.trim() || null,
        refrigerant_amount_kg: refrigerantAmount ? parseFloat(refrigerantAmount) : null,
        refrigerant_type: refrigerantType.trim() || null,
        status: 'active',
        floor_id: floorId || null,
        property_id: selectedProperty || propertyId || null,
      };

      if (editingComponent) {
        // Update existing component
        await updateComponent.mutateAsync({
          id: editingComponent.id,
          patch: componentData as TablesUpdate<'components'>,
        });

        toast({
          title: 'Komponent uppdaterad!',
          description: `${designation} har uppdaterats.`,
        });
      } else {
        // Create new component
        const newComponent = await createComponent.mutateAsync(componentData);

        // Save canvas position if provided (no domain service yet for geometry)
        if (newComponent && canvasPosition) {
          const { error: geometryError } = await supabase
            .from('component_geometry')
            .insert({
              component_id: newComponent.id,
              x: canvasPosition.x,
              y: canvasPosition.y,
            });

          if (geometryError) {
            console.error('Error saving geometry:', geometryError);
          }
        }

        toast({
          title: 'Komponent skapad!',
          description: `${designation} har lagts till. Koppla till driftuppgifter nedan.`,
        });

        // Show service plan section for linking to drift tasks
        setNewComponentId(newComponent?.id || null);
        setShowServicePlan(true);
        setLoading(false);
        return;
      }

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        toast({
          title: 'Valideringsfel',
          description: firstError.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Fel',
          description: getErrorMessage(error),
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDesignation('');
    setRegistrationNumber('');
    setComponentType(undefined);
    setInstallationYear('');
    setManufacturer('');
    setModel('');
    setSerialNumber('');
    setPlacement('');
    setNotes('');
    setRefrigerantCode('');
    setRefrigerantAmount('');
    setRefrigerantType('');
    setNewComponentId(null);
    setShowServicePlan(false);
  };

  const handleCloseDialog = () => {
    if (newComponentId) {
      onSuccess(newComponentId);
    }
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleCloseDialog}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" aria-describedby="component-form-description">
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
                  <SelectValue />
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
              <Select value={componentType} onValueChange={setComponentType}>
                <SelectTrigger id="componentType">
                  <SelectValue placeholder="Välj komponenttyp" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="SC1">Styr och övervakningssystem</SelectItem>
                  <SelectItem value="SC2.1.1">Takbeläggningar och Tätskikt</SelectItem>
                  <SelectItem value="SC2.3">Entréer Portar mm</SelectItem>
                  <SelectItem value="SC2.3.1">Entrépartier Karuselldörrar</SelectItem>
                  <SelectItem value="SC2.3.3">Manuella Portar</SelectItem>
                  <SelectItem value="SC2.3.4">Maskindrivna Portar</SelectItem>
                  <SelectItem value="SC2.3.7">Lastbryggor</SelectItem>
                  <SelectItem value="SC2.6.2">Skyddsrum</SelectItem>
                  <SelectItem value="SC4.1.2.5.1">Fettavskiljare</SelectItem>
                  <SelectItem value="SC4.1.2.5.3">Oljeavskiljare</SelectItem>
                  <SelectItem value="SC4.1.6.9">Fjärrvärmeväxlare</SelectItem>
                  <SelectItem value="SC4.2.4.6">Port Vertikal</SelectItem>
                  <SelectItem value="SC4.2.4.7">Port Horisontell</SelectItem>
                  <SelectItem value="SC4.5.1">Kylanläggning</SelectItem>
                  <SelectItem value="SC4.6.2.6">Värmepump</SelectItem>
                  <SelectItem value="SC4.6.2.6.1">Värmeväxlare</SelectItem>
                  <SelectItem value="SC4.7">Ventsystem</SelectItem>
                  <SelectItem value="SC5.5">Reserv eller nödkraftsystem</SelectItem>
                  <SelectItem value="SC7.1">Hiss</SelectItem>
                  <SelectItem value="SC7.2">Rulltrappor och Rullramper</SelectItem>
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

            {componentType === 'SC4.5.1' && (
              <>
                <div className="space-y-2 col-span-2 pt-4 border-t">
                  <h3 className="text-sm font-semibold">Kylaggregat - Specifika fält</h3>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="refrigerantCode">Kod</Label>
                  <Input
                    id="refrigerantCode"
                    value={refrigerantCode}
                    onChange={(e) => setRefrigerantCode(e.target.value)}
                    placeholder="Ange kod"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refrigerantAmount">Fyllnadsmängd (kg)</Label>
                  <Input
                    id="refrigerantAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={refrigerantAmount}
                    onChange={(e) => setRefrigerantAmount(e.target.value)}
                    placeholder="Ange fyllnadsmängd"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="refrigerantType">Köldmedietyp</Label>
                  <Input
                    id="refrigerantType"
                    value={refrigerantType}
                    onChange={(e) => setRefrigerantType(e.target.value)}
                    placeholder="Ange köldmedietyp"
                  />
                </div>
              </>
            )}
          </div>

          {/* Show service plan section after creating new component OR when editing */}
          {showServicePlan && newComponentId && propertyId && (
            <div className="pt-4 border-t space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-green-700 font-medium">
                  ✓ Komponenten har skapats! Du kan nu koppla den till driftuppgifter nedan.
                </p>
              </div>
              <ComponentServicePlanSection
                componentId={newComponentId}
                propertyId={propertyId}
              />
            </div>
          )}

          {editingComponent && propertyId && (
            <div className="pt-4 border-t space-y-4">
              <ComponentServicePlanSection
                componentId={editingComponent.id}
                propertyId={propertyId}
              />
              <MaintenanceHistoryDialog
                componentId={editingComponent.id}
                componentName={editingComponent.name}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleCloseDialog}
              disabled={loading}
            >
              {showServicePlan ? 'Klar' : 'Avbryt'}
            </Button>
            {!showServicePlan && (
              <Button type="submit" disabled={loading}>
                {loading ? 'Sparar...' : (editingComponent ? 'Uppdatera' : 'Skapa')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
