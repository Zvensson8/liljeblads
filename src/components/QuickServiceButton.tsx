import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wrench, Check } from 'lucide-react';
import { toast } from 'sonner';

interface QuickServiceButtonProps {
  componentId: string;
  componentName: string;
  onSuccess?: () => void;
}

export const QuickServiceButton = ({
  componentId,
  componentName,
  onSuccess,
}: QuickServiceButtonProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState('Service');
  const [performedDate, setPerformedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('maintenance_history').insert({
        component_id: componentId,
        action_type: actionType,
        performed_date: performedDate,
        category: 'Drift',
      });

      if (error) throw error;

      toast.success('Service registrerad', {
        description: `${actionType} registrerad för ${componentName}`,
      });
      
      setOpen(false);
      setActionType('Service');
      onSuccess?.();
    } catch (error: any) {
      toast.error('Kunde inte registrera service', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Registrera service</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="font-medium text-sm">Snabbregistrering</div>
          <div className="space-y-2">
            <Label htmlFor="quickAction" className="text-xs">Åtgärd</Label>
            <Input
              id="quickAction"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              placeholder="Service, Byte, Inspektion..."
              className="h-8"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quickDate" className="text-xs">Datum</Label>
            <Input
              id="quickDate"
              type="date"
              value={performedDate}
              onChange={(e) => setPerformedDate(e.target.value)}
              className="h-8"
              required
            />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={loading}>
            <Check className="h-4 w-4 mr-1" />
            {loading ? 'Sparar...' : 'Registrera'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
};
