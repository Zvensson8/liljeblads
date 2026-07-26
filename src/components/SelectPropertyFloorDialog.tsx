import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useProperties } from '@/hooks/useProperties';
import { useFloors } from '@/hooks/useFloors';

interface SelectPropertyFloorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (propertyId: string, floorId: string) => void;
}

export const SelectPropertyFloorDialog = ({
  open,
  onOpenChange,
  onSelect,
}: SelectPropertyFloorDialogProps) => {
  const [selectedProperty, setSelectedProperty] = useState<string | undefined>(undefined);
  const [selectedFloor, setSelectedFloor] = useState<string | undefined>(undefined);

  const { data: properties = [] } = useProperties();
  const { data: floors = [] } = useFloors(
    selectedProperty ? { propertyId: selectedProperty } : undefined,
  );

  const sortedFloors = [...floors].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));


  const handleContinue = () => {
    if (selectedProperty) {
      // If "no-floor" is selected, treat it as empty string (no floor)
      const floorId = selectedFloor === 'no-floor' ? '' : (selectedFloor || '');
      onSelect(selectedProperty, floorId);
      resetForm();
    }
  };

  const resetForm = () => {
    setSelectedProperty(undefined);
    setSelectedFloor(undefined);
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
                  {sortedFloors.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Inga våningar tillgängliga - komponenten knyts direkt till fastigheten
                    </div>
                  ) : (
                    <>
                      <SelectItem value="no-floor">Ingen våning</SelectItem>
                      {sortedFloors.map((floor) => (
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