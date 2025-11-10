import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Calculator, RotateCcw, Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProjectSimulationProps {
  projectId: string;
  currentBudget: number;
  currentForecast: number;
  currentActualCost: number;
  onApply?: (newForecast: number) => void;
}

export function ProjectSimulation({
  projectId,
  currentBudget,
  currentForecast,
  currentActualCost,
  onApply,
}: ProjectSimulationProps) {
  const [simulatedBudget, setSimulatedBudget] = useState(currentBudget);
  const [simulatedForecast, setSimulatedForecast] = useState(currentForecast);
  const [simulatedActualCost, setSimulatedActualCost] = useState(currentActualCost);
  const [additionalCosts, setAdditionalCosts] = useState<{id: string; description: string; amount: number; isNew?: boolean}[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSimulatedBudget(currentBudget);
    setSimulatedForecast(currentForecast);
    setSimulatedActualCost(currentActualCost);
  }, [currentBudget, currentForecast, currentActualCost]);

  useEffect(() => {
    if (projectId) {
      fetchAdditionalCosts();
    }
  }, [projectId]);

  const fetchAdditionalCosts = async () => {
    try {
      const { data, error } = await supabase
        .from("project_additional_costs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setAdditionalCosts(data || []);
    } catch (error) {
      console.error("Error fetching additional costs:", error);
      toast.error("Kunde inte hämta tillkommande kostnader");
    }
  };

  const handleReset = () => {
    setSimulatedBudget(currentBudget);
    setSimulatedForecast(currentForecast);
    setSimulatedActualCost(currentActualCost);
    fetchAdditionalCosts();
  };

  const handleAddCost = () => {
    setAdditionalCosts([...additionalCosts, { id: crypto.randomUUID(), description: '', amount: 0, isNew: true }]);
  };

  const handleRemoveCost = async (id: string, isNew?: boolean) => {
    if (!isNew) {
      try {
        const { error } = await supabase
          .from("project_additional_costs")
          .delete()
          .eq("id", id);

        if (error) throw error;
        toast.success("Kostnad borttagen");
      } catch (error) {
        console.error("Error deleting cost:", error);
        toast.error("Kunde inte ta bort kostnad");
        return;
      }
    }
    setAdditionalCosts(additionalCosts.filter(cost => cost.id !== id));
  };

  const handleUpdateCost = (id: string, field: 'description' | 'amount', value: string | number) => {
    setAdditionalCosts(additionalCosts.map(cost => 
      cost.id === id ? { ...cost, [field]: value } : cost
    ));
  };

  const handleSaveCost = async (cost: {id: string; description: string; amount: number; isNew?: boolean}) => {
    if (!cost.description || cost.amount <= 0) {
      toast.error("Fyll i beskrivning och belopp");
      return;
    }

    setIsLoading(true);
    try {
      if (cost.isNew) {
        const { error } = await supabase
          .from("project_additional_costs")
          .insert([{
            project_id: projectId,
            description: cost.description,
            amount: cost.amount,
          }]);

        if (error) throw error;
        toast.success("Kostnad sparad");
        await fetchAdditionalCosts();
      } else {
        const { error } = await supabase
          .from("project_additional_costs")
          .update({
            description: cost.description,
            amount: cost.amount,
          })
          .eq("id", cost.id);

        if (error) throw error;
        toast.success("Kostnad uppdaterad");
        await fetchAdditionalCosts();
      }
    } catch (error) {
      console.error("Error saving cost:", error);
      toast.error("Kunde inte spara kostnad");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySimulation = () => {
    if (onApply) {
      onApply(simulatedForecast);
    }
  };

  const totalAdditionalCosts = additionalCosts.reduce((sum, cost) => sum + cost.amount, 0);
  const simulatedTotal = simulatedActualCost + totalAdditionalCosts;
  const variance = simulatedBudget > 0
    ? ((simulatedTotal - simulatedBudget) / simulatedBudget) * 100
    : 0;
  const forecastVariance = simulatedBudget > 0
    ? ((simulatedForecast - simulatedBudget) / simulatedBudget) * 100
    : 0;

  const getVarianceColor = (variance: number) => {
    if (variance > 10) return "text-red-600";
    if (variance > 0) return "text-yellow-600";
    return "text-green-600";
  };

  const hasChanges = 
    simulatedBudget !== currentBudget ||
    simulatedForecast !== currentForecast ||
    simulatedActualCost !== currentActualCost ||
    additionalCosts.length > 0;

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Här kan du simulera hur ekonomin påverkas av olika scenarier. Dina ändringar sparas inte förrän du klickar på "Applicera simulering".
        </AlertDescription>
      </Alert>

      {/* Current values */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nuvarande värden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Budget</p>
              <p className="text-xl font-bold">{currentBudget.toLocaleString("sv-SE")} kr</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Prognos</p>
              <p className="text-xl font-bold">{currentForecast.toLocaleString("sv-SE")} kr</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Utfall</p>
              <p className="text-xl font-bold">{currentActualCost.toLocaleString("sv-SE")} kr</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Simulation inputs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Simulering
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sim-budget">Simulerad budget (kr)</Label>
              <Input
                id="sim-budget"
                type="number"
                value={simulatedBudget}
                onChange={(e) => setSimulatedBudget(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label htmlFor="sim-forecast">Simulerad prognos (kr)</Label>
              <Input
                id="sim-forecast"
                type="number"
                value={simulatedForecast}
                onChange={(e) => setSimulatedForecast(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <Label htmlFor="sim-actual">Simulerat utfall (kr)</Label>
              <Input
                id="sim-actual"
                type="number"
                value={simulatedActualCost}
                onChange={(e) => setSimulatedActualCost(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Tillkommande kostnader</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddCost}>
                  <Plus className="h-4 w-4 mr-2" />
                  Lägg till
                </Button>
              </div>
              {additionalCosts.map((cost) => (
                <div key={cost.id} className="flex gap-2">
                  <Input
                    placeholder="Beskrivning"
                    value={cost.description}
                    onChange={(e) => handleUpdateCost(cost.id, 'description', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Belopp"
                    value={cost.amount || ''}
                    onChange={(e) => handleUpdateCost(cost.id, 'amount', Number(e.target.value))}
                    className="w-32"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleSaveCost(cost)}
                    disabled={isLoading}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleRemoveCost(cost.id, cost.isNew)}
                    disabled={isLoading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Återställ
            </Button>
            {onApply && hasChanges && (
              <Button onClick={handleApplySimulation}>
                Applicera simulering
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Simulation results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Simulerat resultat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Totalt utfall (inkl. tillkommande)</p>
              <p className="text-2xl font-bold">
                {simulatedTotal.toLocaleString("sv-SE")} kr
              </p>
            </div>

            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Avvikelse från budget</p>
              <p className={`text-2xl font-bold ${getVarianceColor(variance)}`}>
                {variance > 0 ? "+" : ""}{variance.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {(simulatedTotal - simulatedBudget).toLocaleString("sv-SE")} kr
              </p>
            </div>

            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Prognos vs budget</p>
              <p className={`text-2xl font-bold ${getVarianceColor(forecastVariance)}`}>
                {forecastVariance > 0 ? "+" : ""}{forecastVariance.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {(simulatedForecast - simulatedBudget).toLocaleString("sv-SE")} kr
              </p>
            </div>
          </div>

          {/* Visual budget bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Budget</span>
              <span>{simulatedBudget.toLocaleString("sv-SE")} kr</span>
            </div>
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, (simulatedTotal / simulatedBudget) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Utfall: {simulatedTotal.toLocaleString("sv-SE")} kr</span>
              <span>{Math.min(100, (simulatedTotal / simulatedBudget) * 100).toFixed(1)}%</span>
            </div>
          </div>

          {variance > 10 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Varning: Projektet är över 10% över budget i denna simulering
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
