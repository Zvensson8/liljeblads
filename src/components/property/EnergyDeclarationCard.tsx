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
  compact?: boolean;
}

export function EnergyDeclarationCard({ propertyId, organizationId, compact = false }: EnergyDeclarationCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { currentValues, previousHistory, isLoading } = useEnergyDeclaration(propertyId, organizationId);

  if (isLoading) {
    return compact ? (
      <div className="pt-3 mt-3 border-t">
        <Skeleton className="h-16 w-full" />
      </div>
    ) : (
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

  if (compact) {
    return (
      <>
        <div 
          className="pt-3 mt-3 border-t cursor-pointer hover:bg-accent/50 rounded-lg p-2 -mx-2 transition-colors"
          onClick={() => setDialogOpen(true)}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground">Energideklaration</span>
          </div>
          
          {!hasData ? (
            <p className="text-xs text-muted-foreground">
              Klicka för att lägga till
            </p>
          ) : (
            <div className="flex items-center gap-3">
              {/* Compact Energy Grade Badge */}
              <div className={`flex items-center justify-center w-10 h-10 rounded border ${gradeColor.bg} ${gradeColor.text} ${gradeColor.border}`}>
                <span className="text-xl font-bold">
                  {currentValues.energyGrade || '-'}
                </span>
              </div>

              {/* Compact Energy Values */}
              <div className="flex-1 space-y-0.5 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Primär:</span>
                  <span className="font-medium">{formatEnergyValue(currentValues.primaryEnergyNumber, 'kWh/m²')}</span>
                  {primaryImprovement && primaryImprovement.percentage > 0 && (
                    <span className={`flex items-center gap-0.5 ${primaryImprovement.isImprovement ? 'text-green-600' : 'text-red-600'}`}>
                      {primaryImprovement.isImprovement ? (
                        <TrendingDown className="h-2.5 w-2.5" />
                      ) : (
                        <TrendingUp className="h-2.5 w-2.5" />
                      )}
                      {primaryImprovement.percentage}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Specifik:</span>
                  <span className="font-medium">{formatEnergyValue(currentValues.specificEnergyUse, 'kWh/m²/år')}</span>
                  {specificImprovement && specificImprovement.percentage > 0 && (
                    <span className={`flex items-center gap-0.5 ${specificImprovement.isImprovement ? 'text-green-600' : 'text-red-600'}`}>
                      {specificImprovement.isImprovement ? (
                        <TrendingDown className="h-2.5 w-2.5" />
                      ) : (
                        <TrendingUp className="h-2.5 w-2.5" />
                      )}
                      {specificImprovement.percentage}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <EnergyDeclarationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          propertyId={propertyId}
          organizationId={organizationId}
        />
      </>
    );
  }

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
