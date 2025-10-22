import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { History, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface MaintenanceRecord {
  id: string;
  action_type: string;
  performed_date: string;
  supplier: string | null;
  cost: number | null;
  notes: string | null;
}

interface MaintenanceHistoryDialogProps {
  componentId: string;
  componentName: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export const MaintenanceHistoryDialog = ({ 
  componentId, 
  componentName, 
  open: externalOpen, 
  onOpenChange: externalOnOpenChange,
  onSuccess 
}: MaintenanceHistoryDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState('');
  const [performedDate, setPerformedDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchRecords();
    }
  }, [open, componentId]);

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('maintenance_history')
      .select('*')
      .eq('component_id', componentId)
      .order('performed_date', { ascending: false });

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from('maintenance_history')
      .insert([{
        component_id: componentId,
        action_type: actionType,
        performed_date: performedDate,
        supplier: supplier || null,
        cost: cost ? parseFloat(cost) : null,
        notes: notes || null,
      }]);

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Underhåll registrerat',
        description: 'Åtgärden har lagts till i historiken.',
      });
      setActionType('');
      setPerformedDate('');
      setSupplier('');
      setCost('');
      setNotes('');
      fetchRecords();
      onSuccess?.();
    }
  };

  const handleDeleteRecord = async (id: string) => {
    const { error } = await supabase
      .from('maintenance_history')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Borttagen',
        description: 'Underhållsposten har tagits bort.',
      });
      fetchRecords();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-2" />
          Underhållshistorik
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Underhållshistorik - {componentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new record form */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <form onSubmit={handleAddRecord} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="actionType">Åtgärd <span className="text-destructive">*</span></Label>
                    <Input
                      id="actionType"
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value)}
                      placeholder="T.ex. Service, Byte fläktmotor"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="performedDate">Datum <span className="text-destructive">*</span></Label>
                    <Input
                      id="performedDate"
                      type="date"
                      value={performedDate}
                      onChange={(e) => setPerformedDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Leverantör/Utförare</Label>
                    <Input
                      id="supplier"
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      placeholder="T.ex. Öhman Gruppen"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cost">Kostnad (kr)</Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="T.ex. 33000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Anteckningar</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Övrig information..."
                    rows={2}
                  />
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Lägg till
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Records list */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">Historik</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Laddar...</p>
            ) : records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingen underhållshistorik registrerad än.</p>
            ) : (
              records.map((record) => (
                <Card key={record.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h4 className="font-semibold">{record.action_type}</h4>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(record.performed_date), 'PPP', { locale: sv })}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {record.supplier && (
                            <div>
                              <span className="text-muted-foreground">Utförare: </span>
                              <span>{record.supplier}</span>
                            </div>
                          )}
                          {record.cost && (
                            <div>
                              <span className="text-muted-foreground">Kostnad: </span>
                              <span>{record.cost.toLocaleString('sv-SE')} kr</span>
                            </div>
                          )}
                        </div>
                        {record.notes && (
                          <p className="text-sm text-muted-foreground">{record.notes}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRecord(record.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
