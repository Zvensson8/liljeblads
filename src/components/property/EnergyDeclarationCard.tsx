import { Card, CardContent } from "@/components/ui/card";
import { getEnergyGradeColor, formatEnergyValue, calculateEnergyImprovement } from "@/lib/energyUtils";
import { useEnergyDeclaration } from "@/hooks/useEnergyDeclaration";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useState } from "react";
import { EnergyDeclarationDialog } from "./EnergyDeclarationDialog";

interface EnergyDeclarationCardProps {
  propertyId: string;
  organizationId: string | null;
}

export function EnergyDeclarationCard({ propertyId, organizationId }: EnergyDeclarationCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { currentValues, previousHistory, isLoading } = useEnergyDeclaration(propertyId, organizationId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = currentValues.energyGrade || currentValues.primaryEnergyNumber || currentValues.specificEnergyUse;
  const gradeColor = getEnergyGradeColor(currentValues.energyGrade);

  // Calculate improvements
  const primaryImprovement = previousHistory && currentValues.primaryEnergyNumber
    ? calculateEnergyImprovement(currentValues.primaryEnergyNumber, previousHistory.primary_energy_number || 0)
    : null;

  const specificImprovement = previousHistory && currentValues.specificEnergyUse
    ? calculateEnergyImprovement(currentValues.specificEnergyUse, previousHistory.specific_energy_use || 0)
    : null;

  return (
    <>
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setDialogOpen(true)}
      >
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Energideklaration</h3>
          
          {!hasData ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground text-sm mb-2">
                Ingen energideklaration registrerad
              </p>
              <p className="text-xs text-muted-foreground">
                Klicka för att lägga till
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              {/* Energy Grade Badge */}
              <div className={`flex items-center justify-center w-16 h-16 rounded-lg border-2 ${gradeColor.bg} ${gradeColor.text} ${gradeColor.border}`}>
                <span className="text-3xl font-bold">
                  {currentValues.energyGrade || '-'}
                </span>
              </div>

              {/* Energy Values */}
              <div className="flex-1 space-y-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Primärenergital</p>
                    {primaryImprovement && primaryImprovement.percentage > 0 && (
                      <span className={`text-xs flex items-center gap-1 ${primaryImprovement.isImprovement ? 'text-green-600' : 'text-red-600'}`}>
                        {primaryImprovement.isImprovement ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : (
                          <TrendingUp className="h-3 w-3" />
                        )}
                        {primaryImprovement.percentage}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatEnergyValue(currentValues.primaryEnergyNumber, 'kWh/m²')}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Specifik energianvändning</p>
                    {specificImprovement && specificImprovement.percentage > 0 && (
                      <span className={`text-xs flex items-center gap-1 ${specificImprovement.isImprovement ? 'text-green-600' : 'text-red-600'}`}>
                        {specificImprovement.isImprovement ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : (
                          <TrendingUp className="h-3 w-3" />
                        )}
                        {specificImprovement.percentage}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatEnergyValue(currentValues.specificEnergyUse, 'kWh/m²/år')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EnergyDeclarationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        propertyId={propertyId}
        organizationId={organizationId}
      />
    </>
  );
}
