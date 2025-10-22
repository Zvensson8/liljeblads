import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RecurringCost {
  id: string;
  property_id: string;
  description: string;
  amount: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  category: string;
  next_due_date: string | null;
  created_at: string;
}

interface PropertyRecurringCostsProps {
  propertyId: string;
}

export function PropertyRecurringCosts({ propertyId }: PropertyRecurringCostsProps) {
  const [costs, setCosts] = useState<RecurringCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    frequency: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
    category: 'drift',
    next_due_date: '',
  });

  useEffect(() => {
    fetchCosts();
  }, [propertyId]);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('property_recurring_costs')
        .select('*')
        .eq('property_id', propertyId)
        .order('next_due_date', { ascending: true });

      if (error) throw error;
      setCosts((data || []) as RecurringCost[]);
    } catch (error: any) {
      toast.error('Kunde inte hämta återkommande kostnader');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from('property_recurring_costs')
        .insert([{
          property_id: propertyId,
          ...formData,
          amount: Number(formData.amount),
        }]);

      if (error) throw error;

      toast.success('Återkommande kostnad tillagd');
      setDialogOpen(false);
      setFormData({
        description: '',
        amount: 0,
        frequency: 'monthly',
        category: 'drift',
        next_due_date: '',
      });
      fetchCosts();
    } catch (error: any) {
      toast.error('Kunde inte lägga till kostnad');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna kostnad?')) return;

    try {
      const { error } = await supabase
        .from('property_recurring_costs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Kostnad borttagen');
      fetchCosts();
    } catch (error: any) {
      toast.error('Kunde inte ta bort kostnad');
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'monthly': return 'Månadsvis';
      case 'quarterly': return 'Kvartalsvis';
      case 'yearly': return 'Årsvis';
      default: return frequency;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'drift': return 'bg-blue-500';
      case 'underhall': return 'bg-green-500';
      case 'energi': return 'bg-yellow-500';
      case 'forsakring': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const totalMonthly = costs.reduce((sum, cost) => {
    const multiplier = cost.frequency === 'monthly' ? 1 : cost.frequency === 'quarterly' ? 1/3 : 1/12;
    return sum + (cost.amount * multiplier);
  }, 0);

  const totalYearly = totalMonthly * 12;

  if (loading) {
    return <div>Laddar...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Månadskostnad (genomsnitt)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalMonthly.toLocaleString('sv-SE')} kr
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Årskostnad (prognos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalYearly.toLocaleString('sv-SE')} kr
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Återkommande kostnader</CardTitle>
              <CardDescription>
                Hantera regelbundna utgifter för fastigheten
              </CardDescription>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till kostnad
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {costs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Inga återkommande kostnader registrerade</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beskrivning</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Belopp</TableHead>
                  <TableHead>Frekvens</TableHead>
                  <TableHead>Nästa förfallodatum</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell className="font-medium">{cost.description}</TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(cost.category)}>
                        {cost.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{cost.amount.toLocaleString('sv-SE')} kr</TableCell>
                    <TableCell>{getFrequencyLabel(cost.frequency)}</TableCell>
                    <TableCell>
                      {cost.next_due_date 
                        ? new Date(cost.next_due_date).toLocaleDateString('sv-SE')
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(cost.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till återkommande kostnad</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="description">Beskrivning</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="category">Kategori</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drift">Drift</SelectItem>
                  <SelectItem value="underhall">Underhåll</SelectItem>
                  <SelectItem value="energi">Energi</SelectItem>
                  <SelectItem value="forsakring">Försäkring</SelectItem>
                  <SelectItem value="annat">Annat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amount">Belopp (kr)</Label>
              <Input
                id="amount"
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                required
                min={0}
              />
            </div>

            <div>
              <Label htmlFor="frequency">Frekvens</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value: any) => setFormData({ ...formData, frequency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Månadsvis</SelectItem>
                  <SelectItem value="quarterly">Kvartalsvis</SelectItem>
                  <SelectItem value="yearly">Årsvis</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="next_due_date">Nästa förfallodatum</Label>
              <Input
                id="next_due_date"
                type="date"
                value={formData.next_due_date}
                onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit">
                Lägg till
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
