import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface ComponentCostsProps {
  componentId: string;
}

export function ComponentCosts({ componentId }: ComponentCostsProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [costDate, setCostDate] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");

  const { data: costs, refetch } = useQuery({
    queryKey: ["component-costs", componentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("component_costs")
        .select("*")
        .eq("component_id", componentId)
        .order("cost_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from("component_costs")
      .insert([{
        component_id: componentId,
        description,
        amount: parseFloat(amount),
        cost_date: costDate,
        category: category || null,
        supplier: supplier || null,
      }]);

    if (error) {
      toast.error("Kunde inte lägga till kostnad");
    } else {
      toast.success("Kostnad tillagd");
      setDescription("");
      setAmount("");
      setCostDate("");
      setCategory("");
      setSupplier("");
      refetch();
    }
  };

  const handleDeleteCost = async (id: string) => {
    const { error } = await supabase
      .from("component_costs")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Kunde inte ta bort kostnad");
    } else {
      toast.success("Kostnad borttagen");
      refetch();
    }
  };

  const totalCosts = costs?.reduce((sum, cost) => sum + Number(cost.amount), 0) || 0;

  return (
    <div className="space-y-6">
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Lägg till kostnad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddCost} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="description">Beskrivning <span className="text-destructive">*</span></Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="T.ex. Reservdel, Energikostnad"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Belopp (kr) <span className="text-destructive">*</span></Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="T.ex. 5000"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costDate">Datum <span className="text-destructive">*</span></Label>
                <Input
                  id="costDate"
                  type="date"
                  value={costDate}
                  onChange={(e) => setCostDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Kategori</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="T.ex. Material, Energi"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier">Leverantör</Label>
              <Input
                id="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="T.ex. Leverantörsnamn"
              />
            </div>
            <Button type="submit" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Lägg till kostnad
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Registrerade kostnader</CardTitle>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <DollarSign className="h-5 w-5" />
              Totalt: {totalCosts.toLocaleString("sv-SE")} kr
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {costs && costs.length > 0 ? (
            <div className="space-y-3">
              {costs.map((cost) => (
                <div
                  key={cost.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold">{cost.description}</h4>
                        {cost.category && (
                          <span className="text-xs px-2 py-1 bg-muted rounded">
                            {cost.category}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                        <div>
                          Datum: {format(new Date(cost.cost_date), "PPP", { locale: sv })}
                        </div>
                        {cost.supplier && <div>Leverantör: {cost.supplier}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold">
                        {Number(cost.amount).toLocaleString("sv-SE")} kr
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteCost(cost.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Inga kostnader registrerade än
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
