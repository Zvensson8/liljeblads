import { useState, useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Settings, FileDown } from "lucide-react";
import { toast } from "sonner";
import { RecurringCostForm } from "@/components/recurring-costs/RecurringCostForm";
import { RecurringCostCard } from "@/components/recurring-costs/RecurringCostCard";
import { AccountCodeManager } from "@/components/recurring-costs/AccountCodeManager";
import { RecurringCostReport } from "@/components/recurring-costs/RecurringCostReport";
import { Skeleton } from "@/components/ui/skeleton";

interface RecurringCost {
  id: string;
  property_id: string;
  description: string;
  account_code_id: string;
  amount: number;
  base_interval_months: number;
  interval_variation_months: number;
  contractor_name?: string;
  contact_person?: string;
  last_payment_date?: string;
  calculated_quarter_start?: string;
  calculated_quarter_end?: string;
  user_selected_date?: string;
  property: {
    name: string;
  };
  account_code: {
    code: string;
    description: string;
  };
}

export default function RecurringCosts() {
  const { organization } = useOrganization();
  const [costs, setCosts] = useState<RecurringCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedCost, setSelectedCost] = useState<RecurringCost | null>(null);

  useEffect(() => {
    if (organization) {
      fetchCosts();
    }
  }, [organization]);

  const fetchCosts = async () => {
    if (!organization) return;

    try {
      const { data, error } = await supabase
        .from("property_recurring_costs")
        .select(`
          *,
          property:properties(name),
          account_code:account_codes(code, description)
        `)
        .eq("properties.organization_id", organization.id)
        .order("last_payment_date", { ascending: false });

      if (error) throw error;
      setCosts((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching recurring costs:", error);
      toast.error("Kunde inte hämta återkommande kostnader");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (cost: RecurringCost) => {
    setSelectedCost(cost);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Är du säker på att du vill ta bort denna återkommande kostnad?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("property_recurring_costs")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Återkommande kostnad borttagen");
      fetchCosts();
    } catch (error) {
      console.error("Error deleting cost:", error);
      toast.error("Kunde inte ta bort återkommande kostnad");
    }
  };

  const totalMonthly = costs.reduce((sum, cost) => {
    const monthlyAmount = cost.amount / (cost.base_interval_months || 12);
    return sum + monthlyAmount;
  }, 0);

  const totalYearly = totalMonthly * 12;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Återkommande Kostnader</h1>
          <p className="text-muted-foreground mt-1">
            Hantera fasta och regelbundna kostnader för dina fastigheter
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsAccountManagerOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Kontoplan
          </Button>
          <Button variant="outline" onClick={() => setIsReportOpen(true)}>
            <FileDown className="h-4 w-4 mr-2" />
            Rapport
          </Button>
          <Button onClick={() => {
            setSelectedCost(null);
            setIsFormOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Ny Kostnad
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Totalt antal</CardTitle>
            <CardDescription>Återkommande kostnader</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{costs.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Månadskostnad</CardTitle>
            <CardDescription>Genomsnitt per månad</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {totalMonthly.toLocaleString("sv-SE")} kr
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Årskostnad</CardTitle>
            <CardDescription>Prognos för helår</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {totalYearly.toLocaleString("sv-SE")} kr
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {costs.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Inga återkommande kostnader registrerade ännu
            </CardContent>
          </Card>
        ) : (
          costs.map((cost) => (
            <RecurringCostCard
              key={cost.id}
              cost={cost}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <RecurringCostForm
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setSelectedCost(null);
          }
        }}
        cost={selectedCost}
        onSuccess={() => {
          fetchCosts();
          setIsFormOpen(false);
          setSelectedCost(null);
        }}
      />

      <AccountCodeManager
        open={isAccountManagerOpen}
        onOpenChange={setIsAccountManagerOpen}
      />

      <RecurringCostReport
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
      />
    </div>
  );
}
