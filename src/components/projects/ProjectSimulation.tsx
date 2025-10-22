import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calculator, RotateCcw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ProjectSimulationProps {
  currentBudget: number;
  currentForecast: number;
  currentActualCost: number;
  onApply?: (newForecast: number) => void;
}

export function ProjectSimulation({
  currentBudget,
  currentForecast,
  currentActualCost,
  onApply,
}: ProjectSimulationProps) {
  const [simulatedBudget, setSimulatedBudget] = useState(currentBudget);
  const [simulatedForecast, setSimulatedForecast] = useState(currentForecast);
  const [simulatedActualCost, setSimulatedActualCost] = useState(currentActualCost);
  const [additionalCosts, setAdditionalCosts] = useState(0);

  useEffect(() => {
    // Reset simulation when real values change
    setSimulatedBudget(currentBudget);
    setSimulatedForecast(currentForecast);
    setSimulatedActualCost(currentActualCost);
    setAdditionalCosts(0);
  }, [currentBudget, currentForecast, currentActualCost]);

  const handleReset = () => {
    setSimulatedBudget(currentBudget);
    setSimulatedForecast(currentForecast);
    setSimulatedActualCost(currentActualCost);
    setAdditionalCosts(0);
  };

  const handleApplySimulation = () => {
    if (onApply) {
      onApply(simulatedForecast);
    }
  };

  // Calculate simulated total with additional costs
  const simulatedTotal = simulatedActualCost + additionalCosts;
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
    additionalCosts !== 0;

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

            <div>
              <Label htmlFor="additional-costs">Tillkommande kostnader (kr)</Label>
              <Input
                id="additional-costs"
                type="number"
                value={additionalCosts}
                onChange={(e) => setAdditionalCosts(parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lägg till kostnader som ännu inte är registrerade
              </p>
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
