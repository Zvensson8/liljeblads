import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEnergyDeclaration } from "@/hooks/useEnergyDeclaration";
import { usePropertyInfoValues } from "@/hooks/usePropertyInfoValues";
import { useState, useEffect } from "react";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { calculateEnergyImprovement } from "@/lib/energyUtils";
import { supabase } from "@/integrations/supabase/client";

interface EnergyDeclarationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  organizationId: string | null;
}

export function EnergyDeclarationDialog({ 
  open, 
  onOpenChange, 
  propertyId,
  organizationId 
}: EnergyDeclarationDialogProps) {
  const { currentValues, previousHistory, updateEnergy } = useEnergyDeclaration(propertyId, organizationId);
  const { values: propertyInfoValues } = usePropertyInfoValues(propertyId);
  
  const [energyGrade, setEnergyGrade] = useState<string>('');
  const [primaryEnergy, setPrimaryEnergy] = useState<string>('');
  const [specificEnergy, setSpecificEnergy] = useState<string>('');
  const [loaValue, setLoaValue] = useState<string>('');

  // Fetch property data to get LOA directly from properties table
  useEffect(() => {
    const fetchPropertyLOA = async () => {
      const { data } = await supabase
        .from('properties')
        .select('loa')
        .eq('id', propertyId)
        .single();
      
      if (data?.loa) {
        setLoaValue(data.loa);
      }
    };
    
    if (open) {
      fetchPropertyLOA();
    }
  }, [open, propertyId]);

  useEffect(() => {
    if (open) {
      setEnergyGrade(currentValues.energyGrade || '');
      setPrimaryEnergy(currentValues.primaryEnergyNumber?.toString() || '');
      setSpecificEnergy(currentValues.specificEnergyUse?.toString() || '');
    }
  }, [open, currentValues]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      energyGrade: energyGrade || null,
      primaryEnergyNumber: primaryEnergy ? parseFloat(primaryEnergy) : null,
      specificEnergyUse: specificEnergy ? parseFloat(specificEnergy) : null,
      fieldIds: currentValues.fieldIds,
    };

    updateEnergy.mutate(data, {
      onSuccess: () => {
        onOpenChange(false);
      }
    });
  };

  // Calculate improvements for preview
  const primaryImprovement = previousHistory && primaryEnergy
    ? calculateEnergyImprovement(parseFloat(primaryEnergy), previousHistory.primary_energy_number || 0)
    : null;

  const specificImprovement = previousHistory && specificEnergy
    ? calculateEnergyImprovement(parseFloat(specificEnergy), previousHistory.specific_energy_use || 0)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Uppdatera energideklaration</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* LOA Display */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm font-medium">Lokalarea (LOA)</p>
            <p className="text-lg">{loaValue || 'Ej angiven'}</p>
          </div>

          {/* Energy Grade */}
          <div className="space-y-2">
            <Label htmlFor="energyGrade">Energiklass</Label>
            <Select value={energyGrade} onValueChange={setEnergyGrade}>
              <SelectTrigger>
                <SelectValue placeholder="Välj energiklass" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
                <SelectItem value="D">D</SelectItem>
                <SelectItem value="E">E</SelectItem>
                <SelectItem value="F">F</SelectItem>
                <SelectItem value="G">G</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Primary Energy */}
          <div className="space-y-2">
            <Label htmlFor="primaryEnergy">
              Primärenergital (kWh/m²)
            </Label>
            <div className="relative">
              <Input
                id="primaryEnergy"
                type="number"
                step="0.1"
                value={primaryEnergy}
                onChange={(e) => setPrimaryEnergy(e.target.value)}
                placeholder="t.ex. 120.5"
              />
              {primaryImprovement && primaryImprovement.percentage > 0 && (
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs ${primaryImprovement.isImprovement ? 'text-green-600' : 'text-red-600'}`}>
                  {primaryImprovement.isImprovement ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  {primaryImprovement.percentage}%
                </div>
              )}
            </div>
            {previousHistory && (
              <p className="text-xs text-muted-foreground">
                Föregående: {previousHistory.primary_energy_number || '-'} kWh/m²
              </p>
            )}
          </div>

          {/* Specific Energy Use */}
          <div className="space-y-2">
            <Label htmlFor="specificEnergy">
              Specifik energianvändning (kWh/m²/år)
            </Label>
            <div className="relative">
              <Input
                id="specificEnergy"
                type="number"
                step="0.1"
                value={specificEnergy}
                onChange={(e) => setSpecificEnergy(e.target.value)}
                placeholder="t.ex. 95.0"
              />
              {specificImprovement && specificImprovement.percentage > 0 && (
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs ${specificImprovement.isImprovement ? 'text-green-600' : 'text-red-600'}`}>
                  {specificImprovement.isImprovement ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  {specificImprovement.percentage}%
                </div>
              )}
            </div>
            {previousHistory && (
              <p className="text-xs text-muted-foreground">
                Föregående: {previousHistory.specific_energy_use || '-'} kWh/m²/år
              </p>
            )}
          </div>

          {/* Previous Update Info */}
          {previousHistory && (
            <div className="bg-muted p-3 rounded-lg text-xs text-muted-foreground">
              <p>Senast uppdaterad: {new Date(previousHistory.recorded_at).toLocaleDateString('sv-SE')}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateEnergy.isPending}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={updateEnergy.isPending}>
              {updateEnergy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spara
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
