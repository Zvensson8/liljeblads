import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { useProperty } from "@/hooks/useProperties";
import {
  useRecurringCosts,
  useCreateRecurringCost,
  useDeleteRecurringCost,
} from "@/hooks/useRecurringCosts";
import type { Tables } from "@/integrations/supabase/types";

type AccountCode = Tables<"account_codes">;
type RecurringCost = Tables<"property_recurring_costs">;
type RecurringCostWithAccountCode = RecurringCost & {
  account_code: { code: string; description: string | null } | null;
};

interface PropertyRecurringCostsProps {
  propertyId: string;
}

export function PropertyRecurringCosts({ propertyId }: PropertyRecurringCostsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    base_interval_months: 12,
    interval_variation_months: 0,
    account_code_id: '',
    contractor_name: '',
    contact_person: '',
    last_payment_date: '',
  });

  const { data: property } = useProperty(propertyId);
  const orgId = (property as any)?.organization_id as string | undefined;
  const { data: rawCosts, isLoading } = useRecurringCosts({ propertyId });

  // Account codes — no domain service yet; fetched here scoped to the org.
  const { data: accountCodes = [] } = useQuery({
    queryKey: ["account-codes", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_codes')
        .select('*')
        .eq('organization_id', orgId!)
        .order('code');
      if (error) throw error;
      return data ?? [];
    },
  });

  const accountCodeMap = useMemo(() => {
    const m: Record<string, { code: string; description: string }> = {};
    (accountCodes as AccountCode[]).forEach((c) => (m[c.id] = { code: c.code, description: c.description }));
    return m;
  }, [accountCodes]);

  const costs = useMemo(() => {
    return (rawCosts ?? [])
      .slice()
      .sort((a, b) => (b.last_payment_date ?? "").localeCompare(a.last_payment_date ?? ""))
      .map((c) => ({
        ...c,
        account_code: c.account_code_id ? accountCodeMap[c.account_code_id] ?? null : null,
      }));
  }, [rawCosts, accountCodeMap]);

  const createCost = useCreateRecurringCost();
  const deleteCost = useDeleteRecurringCost();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCost.mutateAsync({
        property_id: propertyId,
        ...formData,
        amount: Number(formData.amount),
      });
      setDialogOpen(false);
      setFormData({
        description: '',
        amount: 0,
        base_interval_months: 12,
        interval_variation_months: 0,
        account_code_id: '',
        contractor_name: '',
        contact_person: '',
        last_payment_date: '',
      });
    } catch {
      // toast handled by hook
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna kostnad?')) return;
    try {
      await deleteCost.mutateAsync(id);
    } catch {
      // toast handled by hook
    }
  };

  const getIntervalLabel = (months: number, variation?: number) => {
    if (months === 1) return "Månatlig";
    if (months === 3) return "Kvartalsvis";
    if (months === 12) return "Årlig";
    return `Var ${months} månad${variation ? ` (±${variation} mån)` : ""}`;
  };

  const totalMonthly = costs.reduce((sum: number, cost: RecurringCostWithAccountCode) => {
    const multiplier = 1 / (cost.base_interval_months || 12);
    return sum + (cost.amount * multiplier);
  }, 0);

  const totalYearly = totalMonthly * 12;

  if (isLoading) {
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
                  <TableHead>Konto</TableHead>
                  <TableHead>Belopp</TableHead>
                  <TableHead>Intervall</TableHead>
                  <TableHead>Senaste betalning</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell className="font-medium">{cost.description}</TableCell>
                    <TableCell>
                      {cost.account_code ? (
                        <div className="text-sm">
                          <div className="font-medium">{cost.account_code.code}</div>
                          <div className="text-muted-foreground text-xs">{cost.account_code.description}</div>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{cost.amount.toLocaleString('sv-SE')} kr</TableCell>
                    <TableCell>
                      {getIntervalLabel(cost.base_interval_months, cost.interval_variation_months)}
                    </TableCell>
                    <TableCell>
                      {cost.last_payment_date 
                        ? new Date(cost.last_payment_date).toLocaleDateString('sv-SE')
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
        <DialogContent className="max-w-2xl">
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
              <Label htmlFor="account_code_id">Konto</Label>
              <Select
                value={formData.account_code_id}
                onValueChange={(value) => setFormData({ ...formData, account_code_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj kontokod" />
                </SelectTrigger>
                <SelectContent>
                  {(accountCodes as AccountCode[]).map((code) => (
                    <SelectItem key={code.id} value={code.id}>
                      {code.code} - {code.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contractor_name">Avtalspart</Label>
                <Input
                  id="contractor_name"
                  value={formData.contractor_name}
                  onChange={(e) => setFormData({ ...formData, contractor_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contact_person">Kontaktperson</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                />
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="base_interval_months">Basintervall (månader)</Label>
                <Input
                  id="base_interval_months"
                  type="number"
                  min="1"
                  max="120"
                  value={formData.base_interval_months}
                  onChange={(e) => setFormData({ ...formData, base_interval_months: Number(e.target.value) })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="interval_variation_months">Variation (±månader)</Label>
                <Input
                  id="interval_variation_months"
                  type="number"
                  min="0"
                  max="12"
                  value={formData.interval_variation_months}
                  onChange={(e) => setFormData({ ...formData, interval_variation_months: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="last_payment_date">Senaste betalning</Label>
              <Input
                id="last_payment_date"
                type="date"
                value={formData.last_payment_date}
                onChange={(e) => setFormData({ ...formData, last_payment_date: e.target.value })}
                required
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
