import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarRange } from 'lucide-react';
import { useComponentRiskList } from '@/hooks/useComponentRisk';
import {
  fetchPurchaseCostMap,
  fetchUnitPriceMap,
  useSyncWeibullPlan,
} from '@/hooks/useMaintenancePlans';
import {
  formatPlanPeriod,
  generateMaintenancePlanItems,
  earliestPlanQuarter,
  summarizePlanItems,
  type PlanItemDraft,
  type Quarter,
} from '@/lib/maintenancePlanEngine';
import type { Confidence, RiskLevel } from '@/lib/componentRisk';
import { useToast } from '@/hooks/use-toast';

interface GenerateMaintenancePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName?: string;
  organizationId: string;
  onCreated?: () => void;
}

function formatSek(n: number | null): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

export function GenerateMaintenancePlanDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  organizationId,
  onCreated,
}: GenerateMaintenancePlanDialogProps) {
  const earliest = earliestPlanQuarter();
  const [startYear, setStartYear] = useState(earliest.year);
  const [startQuarter, setStartQuarter] = useState<Quarter>(earliest.quarter);
  const [horizonYears, setHorizonYears] = useState(5);
  const [minRiskLevel, setMinRiskLevel] = useState<RiskLevel>('high');
  const [minConfidence, setMinConfidence] = useState<Confidence>('medium');
  const [preview, setPreview] = useState<PlanItemDraft[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const { toast } = useToast();
  const syncPlan = useSyncWeibullPlan();

  // Fetch all property risks (no min filter — engine applies dialog filters)
  const { data: risks = [], isLoading: risksLoading } = useComponentRiskList({
    propertyId,
    limit: 2000,
  });

  const summary = useMemo(() => {
    if (!preview) return null;
    return summarizePlanItems(preview, {
      startYear,
      startQuarter,
      horizonYears,
    });
  }, [preview, startYear, startQuarter, horizonYears]);

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const ids = risks.map((r) => r.componentId);
      const [purchaseCosts, unitPrices] = await Promise.all([
        fetchPurchaseCostMap(ids),
        fetchUnitPriceMap(organizationId),
      ]);
      const items = generateMaintenancePlanItems(risks, {
        startYear,
        startQuarter,
        horizonYears,
        minRiskLevel,
        minConfidence,
        purchaseCosts,
        unitPricesByType: unitPrices,
      });
      setPreview(items);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Kunde inte generera förhandsvisning',
        description: e instanceof Error ? e.message : 'Okänt fel',
        variant: 'destructive',
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!preview) {
      await runPreview();
      return;
    }
    try {
      const result = await syncPlan.mutateAsync({
        organizationId,
        propertyId,
        propertyName,
        drafts: preview,
      });
      toast({
        title: 'Underhållsplan uppdaterad',
        description: `${result.created} nya · ${result.updated} uppdaterade · ${result.skipped} orörda (redigerade/borttagna). ${formatPlanPeriod(summary!.period)}`,
      });
      setPreview(null);
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Kunde inte spara planen',
        description: e instanceof Error ? e.message : 'Kontrollera att migrationen är körd',
        variant: 'destructive',
      });
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setPreview(null);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Uppdatera Weibull-plan
          </DialogTitle>
          <DialogDescription>
            Fyller på Weibull utan att skriva över redigerat eller borttaget.
            Kundens Excel är orörd — det här är arbetsplanen. Över 75 000 kr
            läggs här, tidigast om 12 månader + ett kvartal eller senare om B10
            säger det. Flera byten på samma fastighet sprids över kvartal
            (högst risk först). Under 75 000 kr blir arbetsorder.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startYear">Startår</Label>
              <Input
                id="startYear"
                type="number"
                min={2020}
                max={2100}
                value={startYear}
                onChange={(e) => {
                  setStartYear(Number(e.target.value) || earliest.year);
                  setPreview(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Startkvartal</Label>
              <Select
                value={String(startQuarter)}
                onValueChange={(v) => {
                  setStartQuarter(Number(v) as Quarter);
                  setPreview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1 (jan–mar)</SelectItem>
                  <SelectItem value="2">Q2 (apr–jun)</SelectItem>
                  <SelectItem value="3">Q3 (jul–sep)</SelectItem>
                  <SelectItem value="4">Q4 (okt–dec)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Horisont</Label>
              <Select
                value={String(horizonYears)}
                onValueChange={(v) => {
                  setHorizonYears(Number(v));
                  setPreview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 år</SelectItem>
                  <SelectItem value="5">5 år</SelectItem>
                  <SelectItem value="10">10 år</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Min. risknivå</Label>
              <Select
                value={minRiskLevel}
                onValueChange={(v) => {
                  setMinRiskLevel(v as RiskLevel);
                  setPreview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Kritisk</SelectItem>
                  <SelectItem value="high">Hög</SelectItem>
                  <SelectItem value="medium">Medel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Min. tillförlitlighet (confidence)</Label>
            <Select
              value={minConfidence}
              onValueChange={(v) => {
                setMinConfidence(v as Confidence);
                setPreview(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">Hög</SelectItem>
                <SelectItem value="medium">Medel</SelectItem>
                <SelectItem value="low">Låg (inkl. osäkra)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {summary && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
              <div className="font-medium">
                Förhandsvisning · {formatPlanPeriod(summary.period)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{summary.itemCount} åtgärder</Badge>
                <Badge variant="outline">
                  Kostnad≈ {formatSek(summary.totalEstimatedCost)}
                  {summary.costKnownCount < summary.itemCount &&
                    summary.itemCount > 0 &&
                    ` (${summary.costKnownCount} med pris)`}
                </Badge>
              </div>
              {summary.itemCount === 0 && (
                <p className="text-muted-foreground">
                  Inga åtgärder inom horisonten med vald risknivå. Prova sänka till
                  Medel eller kontrollera att komponenter har installationsår.
                </p>
              )}
              {summary.itemCount > 0 && (
                <ul className="max-h-40 overflow-y-auto space-y-1 text-muted-foreground">
                  {preview!.slice(0, 12).map((item) => (
                    <li key={item.componentId} className="truncate">
                      Q{item.quarter} {item.year}: {item.componentName || item.componentId}
                      {item.estimatedCost != null &&
                        ` · ${formatSek(item.estimatedCost)}`}
                    </li>
                  ))}
                  {preview!.length > 12 && (
                    <li>…och {preview!.length - 12} till</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Avbryt
          </Button>
          {!preview ? (
            <Button
              onClick={runPreview}
              disabled={previewing || risksLoading || risks.length === 0}
            >
              {(previewing || risksLoading) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Förhandsgranska
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={runPreview} disabled={previewing}>
                Uppdatera
              </Button>
              <Button
                onClick={handleSave}
                disabled={syncPlan.isPending}
              >
                {syncPlan.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Spara plan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
