import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layers } from 'lucide-react';
import { toast } from 'sonner';

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
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<string>(currentFloorId || 'none');

  useEffect(() => {
    fetchFloors();
  }, [propertyId]);

  useEffect(() => {
    setSelectedFloor(currentFloorId || 'none');
  }, [currentFloorId]);

  const fetchFloors = async () => {
    if (!propertyId) return;

    const { data, error } = await supabase
      .from('floors')
      .select('id, name, level')
      .eq('property_id', propertyId)
      .order('level');

    if (!error && data) {
      setFloors(data);
    }
  };

  const handleFloorChange = async (value: string) => {
    setLoading(true);
    const floorId = value === 'none' ? null : value;

    try {
      const { error } = await supabase
        .from('components')
        .update({ floor_id: floorId })
        .eq('id', componentId);

      if (error) throw error;

      setSelectedFloor(value);
      toast.success('Våningsplan uppdaterat');
      onSuccess?.();
    } catch (error: any) {
      toast.error('Kunde inte uppdatera våningsplan', {
        description: error.message,
      });
    } finally {
      setLoading(false);
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
