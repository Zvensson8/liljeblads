import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

interface CostBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  componentId?: string;
  onSuccess?: () => void;
}

export function CostBudgetDialog({ 
  open, 
  onOpenChange, 
  propertyId, 
  componentId,
  onSuccess 
}: CostBudgetDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [quarter, setQuarter] = useState<string>("YEAR");
  const [budgetedAmount, setBudgetedAmount] = useState("");
  const [alert75, setAlert75] = useState(true);
  const [alert90, setAlert90] = useState(true);
  const [alert100, setAlert100] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!budgetedAmount || parseFloat(budgetedAmount) <= 0) {
      toast({
        title: "Ogiltigt belopp",
        description: "Budgeten måste vara ett positivt nummer",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('cost_budgets')
        .insert({
          property_id: propertyId || null,
          component_id: componentId || null,
          year: parseInt(year),
          quarter: quarter,
          budgeted_amount: parseFloat(budgetedAmount),
          alert_threshold_75: alert75,
          alert_threshold_90: alert90,
          alert_threshold_100: alert100,
        });

      if (error) throw error;

      toast({
        title: "Budget skapad",
        description: "Kostnadsbudgeten har sparats",
      });

      onSuccess?.();
      onOpenChange(false);
      
      // Reset form
      setBudgetedAmount("");
      setQuarter("YEAR");
      setYear(new Date().getFullYear().toString());
    } catch (error: any) {
      console.error('Error creating budget:', error);
      toast({
        title: "Fel",
        description: error.message || "Kunde inte skapa budget",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skapa kostnadsbudget</DialogTitle>
          <DialogDescription>
            Sätt en budget för underhållskostnader och få varningar när gränser överskrids
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="year">År</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger id="year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => {
                  const y = new Date().getFullYear() + i;
                  return (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="quarter">Period</Label>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger id="quarter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YEAR">Helår</SelectItem>
                <SelectItem value="Q1">Kvartal 1</SelectItem>
                <SelectItem value="Q2">Kvartal 2</SelectItem>
                <SelectItem value="Q3">Kvartal 3</SelectItem>
                <SelectItem value="Q4">Kvartal 4</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Budget (SEK)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="50000"
              value={budgetedAmount}
              onChange={(e) => setBudgetedAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label>Varningar när budget är förbrukad till:</Label>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="alert75" className="text-sm font-normal">75%</Label>
              <Switch
                id="alert75"
                checked={alert75}
                onCheckedChange={setAlert75}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="alert90" className="text-sm font-normal">90%</Label>
              <Switch
                id="alert90"
                checked={alert90}
                onCheckedChange={setAlert90}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="alert100" className="text-sm font-normal">100%</Label>
              <Switch
                id="alert100"
                checked={alert100}
                onCheckedChange={setAlert100}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spara budget
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
