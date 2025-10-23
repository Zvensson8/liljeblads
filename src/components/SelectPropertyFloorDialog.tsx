import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SelectPropertyFloorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (propertyId: string, floorId: string) => void;
}

export const SelectPropertyFloorDialog = ({ 
  open, 
  onOpenChange,
  onSelect 
}: SelectPropertyFloorDialogProps) => {
  const { toast } = useToast();
  const [properties, setProperties] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProperties();
    }
  }, [open]);

  useEffect(() => {
    if (selectedProperty) {
      fetchFloors(selectedProperty);
    } else {
      setFloors([]);
      setSelectedFloor('');
    }
  }, [selectedProperty]);

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('id, name, address')
      .order('name');
    
    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setProperties(data || []);
    }
  };

  const fetchFloors = async (propertyId: string) => {
    const { data, error } = await supabase
      .from('floors')
      .select('id, name, level')
      .eq('property_id', propertyId)
      .order('level', { ascending: true });
    
    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setFloors(data || []);
    }
  };

  const handleContinue = () => {
    if (selectedProperty) {
      onSelect(selectedProperty, selectedFloor || '');
      resetForm();
    }
  };

  const resetForm = () => {
    setSelectedProperty('');
    setSelectedFloor('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby="select-floor-description">
        <DialogHeader>
          <DialogTitle>Välj fastighet och våning</DialogTitle>
          <DialogDescription id="select-floor-description">
            Välj vilken fastighet komponenten ska knytas till. Våning är valfritt och kan läggas till senare.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="property">
              Fastighet <span className="text-destructive">*</span>
            </Label>
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger id="property">
                <SelectValue placeholder="Välj fastighet" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                    {property.address && ` - ${property.address}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProperty && (
            <div className="space-y-2">
              <Label htmlFor="floor">
                Våning (valfritt)
              </Label>
              <Select value={selectedFloor} onValueChange={setSelectedFloor}>
                <SelectTrigger id="floor">
                  <SelectValue placeholder="Välj våning eller lämna tomt" />
                </SelectTrigger>
                <SelectContent>
                  {floors.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Inga våningar tillgängliga - komponenten knyts direkt till fastigheten
                    </div>
                  ) : (
                    <>
                      <SelectItem value="">Ingen våning</SelectItem>
                      {floors.map((floor) => (
                        <SelectItem key={floor.id} value={floor.id}>
                          {floor.name}
                          {floor.level !== null && ` (Våning ${floor.level})`}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }}
            >
              Avbryt
            </Button>
            <Button 
              onClick={handleContinue}
              disabled={!selectedProperty}
            >
              Fortsätt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};