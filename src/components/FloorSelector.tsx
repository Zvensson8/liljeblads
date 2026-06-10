import { useState, useEffect, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layers } from 'lucide-react';
import { toast } from 'sonner';
import { useFloors } from '@/hooks/useFloors';
import { useUpdateComponent } from '@/hooks/useComponents';
import { getErrorMessage } from '@/lib/utils';

interface Floor {
  id: string;
  name: string;
  level: number | null;
}

interface FloorSelectorProps {
  componentId: string;
  propertyId: string;
  currentFloorId: string | null;
  onSuccess?: () => void;
  compact?: boolean;
}

export const FloorSelector = ({
  componentId,
  propertyId,
  currentFloorId,
  onSuccess,
  compact = false,
}: FloorSelectorProps) => {
  const [selectedFloor, setSelectedFloor] = useState<string>(currentFloorId || 'none');
  const { data: floorsData = [] } = useFloors(propertyId ? { propertyId } : undefined);
  const updateComponent = useUpdateComponent();

  const floors = useMemo(
    () => [...(floorsData as Floor[])].sort((a, b) => (a.level ?? 0) - (b.level ?? 0)),
    [floorsData],
  );

  const loading = updateComponent.isPending;

  useEffect(() => {
    setSelectedFloor(currentFloorId || 'none');
  }, [currentFloorId]);

  const handleFloorChange = async (value: string) => {
    const floorId = value === 'none' ? null : value;

    try {
      await updateComponent.mutateAsync({
        id: componentId,
        patch: { floor_id: floorId } as any,
      });
      setSelectedFloor(value);
      toast.success('Våningsplan uppdaterat');
      onSuccess?.();
    } catch (error: any) {
      toast.error('Kunde inte uppdatera våningsplan', {
        description: error.message,
      });
    }
  };


  if (floors.length === 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Layers className="h-3 w-3" />
        Inga våningsplan
      </div>
    );
  }

  return (
    <Select
      value={selectedFloor}
      onValueChange={handleFloorChange}
      disabled={loading}
    >
      <SelectTrigger 
        className={compact ? "h-7 text-xs w-[120px]" : "h-8 text-sm w-[160px]"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3 text-muted-foreground" />
          <SelectValue placeholder="Välj våning" />
        </div>
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        <SelectItem value="none">
          <span className="text-muted-foreground">Ingen våning</span>
        </SelectItem>
        {floors.map((floor) => (
          <SelectItem key={floor.id} value={floor.id}>
            {floor.name}
            {floor.level !== null && ` (Vån ${floor.level})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
