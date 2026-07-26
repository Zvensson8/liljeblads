import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit, Save, X } from "lucide-react";
import { useUpdateProject } from "@/hooks/useProjects";
import { useLogProjectActivity } from "@/hooks/useProjectActivityLog";

interface ProjectEconomyOverviewProps {
  projectId: string;
  budget: number;
  forecast: number;
  actualCost: number;
  onUpdate: () => void;
}

export function ProjectEconomyOverview({
  projectId,
  budget,
  forecast,
  actualCost,
  onUpdate,
}: ProjectEconomyOverviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBudget, setEditBudget] = useState(budget);
  const [editForecast, setEditForecast] = useState(forecast);
  const [saving, setSaving] = useState(false);
  const updateProject = useUpdateProject();
  const logActivity = useLogProjectActivity();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProject.mutateAsync({
        id: projectId,
        patch: { budget: editBudget, forecast: editForecast },
      });

      const changes = [];
      if (editBudget !== budget) {
        changes.push(`Budget ändrad från ${budget.toLocaleString("sv-SE")} kr till ${editBudget.toLocaleString("sv-SE")} kr`);
      }
      if (editForecast !== forecast) {
        changes.push(`Prognos ändrad från ${forecast.toLocaleString("sv-SE")} kr till ${editForecast.toLocaleString("sv-SE")} kr`);
      }

      if (changes.length > 0) {
        await logActivity.mutateAsync({
          project_id: projectId,
          activity_type: "status_change",
          description: changes.join(", "),
        });
      }

      toast.success("Ekonomi uppdaterad");
      setIsEditing(false);
      onUpdate();
    } catch (error: unknown) {
      toast.error("Kunde inte uppdatera ekonomi");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditBudget(budget);
    setEditForecast(forecast);
    setIsEditing(false);
  };

  const variance = budget > 0 ? ((actualCost - budget) / budget) * 100 : 0;
  const forecastVariance = budget > 0 ? ((forecast - budget) / budget) * 100 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ekonomisk översikt</CardTitle>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Redigera
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={saving}
              >
                <X className="h-4 w-4 mr-2" />
                Avbryt
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Sparar..." : "Spara"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Budget */}
            <div className="space-y-2">
              <Label htmlFor="budget">Budget</Label>
              {isEditing ? (
                <Input
                  id="budget"
                  type="number"
                  value={editBudget}
                  onChange={(e) => setEditBudget(parseFloat(e.target.value) || 0)}
                  className="text-lg"
                />
              ) : (
                <p className="text-2xl font-bold">
                  {budget.toLocaleString("sv-SE")} kr
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Ursprunglig budget för projektet
              </p>
            </div>

            {/* Prognos */}
            <div className="space-y-2">
              <Label htmlFor="forecast">Prognos</Label>
              {isEditing ? (
                <Input
                  id="forecast"
                  type="number"
                  value={editForecast}
                  onChange={(e) => setEditForecast(parseFloat(e.target.value) || 0)}
                  className="text-lg"
                />
              ) : (
                <div className="space-y-1">
                  <p className="text-2xl font-bold">
                    {forecast.toLocaleString("sv-SE")} kr
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      forecastVariance > 10
                        ? "text-red-600"
                        : forecastVariance > 0
                        ? "text-yellow-600"
                        : "text-green-600"
                    }`}
                  >
                    {forecastVariance !== 0
                      ? `${forecastVariance > 0 ? "+" : ""}${forecastVariance.toFixed(1)}% mot budget`
                      : "I linje med budget"}
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Förväntat slutligt utfall
              </p>
            </div>

            {/* Utfall */}
            <div className="space-y-2">
              <Label>Utfall (hittills)</Label>
              <div className="space-y-1">
                <p className="text-2xl font-bold">
                  {actualCost.toLocaleString("sv-SE")} kr
                </p>
                <p
                  className={`text-sm font-medium ${
                    variance > 10
                      ? "text-red-600"
                      : variance > 0
                      ? "text-yellow-600"
                      : "text-green-600"
                  }`}
                >
                  {variance !== 0
                    ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)}% mot budget`
                    : "I linje med budget"}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Beräknas automatiskt från inlagda kostnader
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Kvarstående enligt prognos
                </p>
                <p className="text-lg font-semibold">
                  {(forecast - actualCost).toLocaleString("sv-SE")} kr
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Kvarstående budget
                </p>
                <p className={`text-lg font-semibold ${
                  (budget - actualCost) < 0 ? "text-red-600" : ""
                }`}>
                  {(budget - actualCost).toLocaleString("sv-SE")} kr
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
