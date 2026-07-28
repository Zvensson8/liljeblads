import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  Loader2,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useComponentRiskList } from "@/hooks/useComponentRisk";
import {
  fetchPurchaseCostMap,
  fetchUnitPriceMap,
  useCreateMaintenancePlan,
} from "@/hooks/useMaintenancePlans";
import {
  formatPlanPeriod,
  generateMaintenancePlanItems,
  nextCalendarQuarter,
  summarizePlanItems,
  type PlanItemDraft,
  type Quarter,
} from "@/lib/maintenancePlanEngine";
import type { Confidence, RiskLevel } from "@/lib/componentRisk";
import {
  exportMaintenancePlanToExcel,
  exportMaintenancePlanToPDF,
  type MaintenancePlanExportRow,
} from "@/lib/maintenancePlanExport";
import { getErrorMessage } from "@/lib/utils";

interface Property {
  id: string;
  name: string;
}

interface MultiPropertyMaintenancePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatSek(n: number): string {
  return `${Math.round(n).toLocaleString("sv-SE")} kr`;
}

export function MultiPropertyMaintenancePlanDialog({
  open,
  onOpenChange,
}: MultiPropertyMaintenancePlanDialogProps) {
  const { organization } = useOrganization();
  const next = nextCalendarQuarter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [startYear, setStartYear] = useState(next.year);
  const [startQuarter, setStartQuarter] = useState<Quarter>(next.quarter);
  const [horizonYears, setHorizonYears] = useState(5);
  const [minRiskLevel, setMinRiskLevel] = useState<RiskLevel>("high");
  const [minConfidence, setMinConfidence] = useState<Confidence>("medium");
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewByProperty, setPreviewByProperty] = useState<
    Map<string, PlanItemDraft[]>
  >(new Map());

  const createPlan = useCreateMaintenancePlan();

  // Org-wide risks when dialog open (engine filters per property)
  const { data: allRisks = [], isLoading: risksLoading } = useComponentRiskList({
    limit: 5000,
  });

  useEffect(() => {
    if (open) {
      fetchProperties();
      setPreviewByProperty(new Map());
    }
  }, [open]);

  const fetchProperties = async () => {
    setLoadingProperties(true);
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .order("name");
      if (error) throw error;
      setProperties(data || []);
    } catch {
      toast.error("Kunde inte hämta fastigheter");
    } finally {
      setLoadingProperties(false);
    }
  };

  const selectedProperties = useMemo(
    () => properties.filter((p) => selectedPropertyIds.includes(p.id)),
    [properties, selectedPropertyIds],
  );

  const flatRows: MaintenancePlanExportRow[] = useMemo(() => {
    const rows: MaintenancePlanExportRow[] = [];
    for (const prop of selectedProperties) {
      const items = previewByProperty.get(prop.id) ?? [];
      for (const item of items) {
        rows.push({
          propertyName: prop.name,
          componentName: item.componentName ?? "Komponent",
          componentType: item.componentType ?? null,
          year: item.year,
          quarter: item.quarter,
          actionType: item.actionType,
          title: item.title,
          riskLevel: item.riskLevel,
          riskScore: item.riskScore,
          estimatedCost: item.estimatedCost,
          remainingB10Years: item.remainingB10Years,
        });
      }
    }
    return rows.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.quarter !== b.quarter) return a.quarter - b.quarter;
      return a.propertyName.localeCompare(b.propertyName, "sv");
    });
  }, [previewByProperty, selectedProperties]);

  const portfolioSummary = useMemo(() => {
    const totalCost = flatRows.reduce((s, r) => s + (r.estimatedCost ?? 0), 0);
    const byProperty = selectedProperties.map((p) => {
      const items = previewByProperty.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.name,
        count: items.length,
        cost: items.reduce((s, i) => s + (i.estimatedCost ?? 0), 0),
      };
    });
    return {
      itemCount: flatRows.length,
      totalCost,
      byProperty,
      period: summarizePlanItems(
        flatRows.map((r) => ({
          componentId: "",
          componentName: r.componentName,
          year: r.year,
          quarter: r.quarter as Quarter,
          actionType: r.actionType as PlanItemDraft["actionType"],
          title: r.title,
          riskLevel: r.riskLevel as PlanItemDraft["riskLevel"],
          riskScore: r.riskScore,
          remainingB10Years: r.remainingB10Years,
          confidence: "medium" as const,
          estimatedCost: r.estimatedCost,
          costSource: null,
          sortOrder: 0,
        })),
        { startYear, startQuarter, horizonYears },
      ).period,
    };
  }, [flatRows, selectedProperties, previewByProperty, startYear, startQuarter, horizonYears]);

  const handlePropertyToggle = (propertyId: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(propertyId)
        ? prev.filter((id) => id !== propertyId)
        : [...prev, propertyId],
    );
    setPreviewByProperty(new Map());
  };

  const handleSelectAll = () => {
    if (selectedPropertyIds.length === properties.length) {
      setSelectedPropertyIds([]);
    } else {
      setSelectedPropertyIds(properties.map((p) => p.id));
    }
    setPreviewByProperty(new Map());
  };

  const runPreview = async () => {
    if (!organization?.id) {
      toast.error("Ingen organisation");
      return;
    }
    if (selectedPropertyIds.length === 0) {
      toast.error("Välj minst en fastighet");
      return;
    }

    setPreviewing(true);
    try {
      const ids = allRisks.map((r) => r.componentId);
      const [purchaseCosts, unitPrices] = await Promise.all([
        fetchPurchaseCostMap(ids),
        fetchUnitPriceMap(organization.id),
      ]);

      const nextMap = new Map<string, PlanItemDraft[]>();
      for (const prop of selectedProperties) {
        const risks = allRisks.filter((r) => r.propertyId === prop.id);
        const items = generateMaintenancePlanItems(risks, {
          startYear,
          startQuarter,
          horizonYears,
          minRiskLevel,
          minConfidence,
          purchaseCosts,
          unitPricesByType: unitPrices,
        });
        nextMap.set(prop.id, items);
      }
      setPreviewByProperty(nextMap);

      const total = Array.from(nextMap.values()).reduce((s, a) => s + a.length, 0);
      toast.success(`Förhandsvisning: ${total} åtgärder över ${selectedProperties.length} fastigheter`);
    } catch (e) {
      toast.error(getErrorMessage(e) || "Kunde inte generera förhandsvisning");
    } finally {
      setPreviewing(false);
    }
  };

  const exportMeta = () => ({
    title: "Underhållsplan — flera fastigheter",
    startYear,
    startQuarter,
    horizonYears,
    propertyCount: selectedProperties.length,
    totalCost: portfolioSummary.totalCost,
    itemCount: portfolioSummary.itemCount,
  });

  const handleExport = async (format: "excel" | "pdf") => {
    if (flatRows.length === 0) {
      toast.error("Kör förhandsvisning först");
      return;
    }
    setExporting(true);
    try {
      if (format === "excel") {
        await exportMaintenancePlanToExcel(flatRows, exportMeta());
      } else {
        exportMaintenancePlanToPDF(flatRows, exportMeta());
      }
      toast.success(format === "excel" ? "Excel exporterad" : "PDF exporterad");
    } catch (e) {
      toast.error(getErrorMessage(e) || "Export misslyckades");
    } finally {
      setExporting(false);
    }
  };

  const handleSaveAll = async () => {
    if (!organization?.id) {
      toast.error("Ingen organisation");
      return;
    }
    if (previewByProperty.size === 0) {
      toast.error("Kör förhandsvisning först");
      return;
    }

    setSaving(true);
    try {
      let saved = 0;
      for (const prop of selectedProperties) {
        const items = previewByProperty.get(prop.id) ?? [];
        await createPlan.mutateAsync({
          organizationId: organization.id,
          propertyId: prop.id,
          propertyName: prop.name,
          startYear,
          startQuarter,
          horizonYears,
          minRiskLevel,
          minConfidence,
          items,
        });
        saved += 1;
      }
      toast.success(
        `Sparade underhållsplaner för ${saved} fastighet${saved === 1 ? "" : "er"}`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e) || "Kunde inte spara planer");
    } finally {
      setSaving(false);
    }
  };

  const busy = previewing || saving || exporting || risksLoading || loadingProperties;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Underhållsplan — flera fastigheter
          </DialogTitle>
          <DialogDescription>
            Generera prediktiv underhållsplan för valda fastigheter, spara per
            fastighet och exportera samlad PDF/Excel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Välj fastigheter</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-7 text-xs"
                disabled={loadingProperties}
              >
                {selectedPropertyIds.length === properties.length
                  ? "Avmarkera alla"
                  : "Markera alla"}
              </Button>
            </div>
            <ScrollArea className="h-40 rounded-md border p-3">
              {loadingProperties ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Laddar…
                </div>
              ) : (
                <div className="space-y-2">
                  {properties.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedPropertyIds.includes(p.id)}
                        onCheckedChange={() => handlePropertyToggle(p.id)}
                      />
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedPropertyIds.length} valda
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Startkvartal</Label>
              <Select
                value={String(startQuarter)}
                onValueChange={(v) => {
                  setStartQuarter(Number(v) as Quarter);
                  setPreviewByProperty(new Map());
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1</SelectItem>
                  <SelectItem value="2">Q2</SelectItem>
                  <SelectItem value="3">Q3</SelectItem>
                  <SelectItem value="4">Q4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Startår</Label>
              <Select
                value={String(startYear)}
                onValueChange={(v) => {
                  setStartYear(Number(v));
                  setPreviewByProperty(new Map());
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 8 }, (_, i) => next.year - 1 + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Horisont (år)</Label>
              <Select
                value={String(horizonYears)}
                onValueChange={(v) => {
                  setHorizonYears(Number(v));
                  setPreviewByProperty(new Map());
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10].map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h} år
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Min risk</Label>
              <Select
                value={minRiskLevel}
                onValueChange={(v) => {
                  setMinRiskLevel(v as RiskLevel);
                  setPreviewByProperty(new Map());
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medium">Medel+</SelectItem>
                  <SelectItem value="high">Hög+</SelectItem>
                  <SelectItem value="critical">Kritisk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Min konfidens</Label>
            <Select
              value={minConfidence}
              onValueChange={(v) => {
                setMinConfidence(v as Confidence);
                setPreviewByProperty(new Map());
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Låg+</SelectItem>
                <SelectItem value="medium">Medel+</SelectItem>
                <SelectItem value="high">Hög</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {previewByProperty.size > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="secondary">
                  {portfolioSummary.itemCount} åtgärder
                </Badge>
                <Badge variant="outline">
                  {formatSek(portfolioSummary.totalCost)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatPlanPeriod(portfolioSummary.period)}
                </span>
              </div>
              <ul className="text-sm space-y-1 max-h-28 overflow-y-auto">
                {portfolioSummary.byProperty.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {p.count} · {formatSek(p.cost)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={runPreview}
            disabled={busy || selectedPropertyIds.length === 0}
          >
            {previewing || risksLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CalendarRange className="h-4 w-4 mr-2" />
            )}
            Förhandsvisa
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport("excel")}
            disabled={busy || flatRows.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport("pdf")}
            disabled={busy || flatRows.length === 0}
          >
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={busy || previewByProperty.size === 0}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Spara alla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
