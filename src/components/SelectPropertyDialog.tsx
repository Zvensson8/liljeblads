import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProperties } from '@/hooks/useProperties';

interface SelectPropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (propertyId: string) => void;
}

export function SelectPropertyDialog({
  open,
  onOpenChange,
  onSelect,
}: SelectPropertyDialogProps) {
  const { data: properties = [] } = useProperties();
  const [propertyId, setPropertyId] = useState('');

  const handleConfirm = () => {
    if (!propertyId) return;
    onSelect(propertyId);
    setPropertyId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Välj fastighet</DialogTitle>
          <DialogDescription>
            Välj vilken fastighet den nya komponenten ska knytas till.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Fastighet</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Välj fastighet" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button onClick={handleConfirm} disabled={!propertyId}>
              Fortsätt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
