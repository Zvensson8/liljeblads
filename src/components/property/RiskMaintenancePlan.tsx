import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  CalendarRange,
  Archive,
  Plus,
  Wrench,
  AlertTriangle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  useActiveMaintenancePlan,
  useArchiveMaintenancePlan,
  useMaintenancePlanItems,
  useMaintenancePlans,
  useUpdateMaintenancePlanItem,
  useDeleteMaintenancePlanItem,
  useCreateManualPlanItem,
  useSyncWeibullPlan,
  usePromotePlanItems,
  fetchPurchaseCostMap,
  fetchUnitPriceMap,
  type MaintenancePlanItem,
} from '@/hooks/useMaintenancePlans';
import { useProperty } from '@/hooks/useProperties';
import { normalizeProjectNumber, projectNumberStem } from '@/lib/projectNumber';
import { useComponentRiskList } from '@/hooks/useComponentRisk';
import {
  earliestPlanQuarter,
  generateMaintenancePlanItems,
} from '@/lib/maintenancePlanEngine';
import { useOrganization } from '@/hooks/useOrganization';
import { GenerateMaintenancePlanDialog } from '@/components/property/GenerateMaintenancePlanDialog';
import {
  actionTypeLabel,
  computePlanPeriod,
  formatPlanPeriod,
  formatYearQuarter,
  type PlanActionType,
  type Quarter,
} from '@/lib/maintenancePlanEngine';
import { riskLevelColor, riskLevelLabel, type RiskLevel } from '@/lib/componentRisk';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pencil } from 'lucide-react';

interface RiskMaintenancePlanProps {
  propertyId: string;
  propertyName?: string;
}

function formatSek(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

function RiskMiniBadge({ level, score }: { level: string; score: number }) {
  const color = riskLevelColor(level as RiskLevel);
  return (
    <Badge className={cn('text-xs border-0', color)}>
      {riskLevelLabel(level as RiskLevel)} {Math.round(score)}
    </Badge>
  );
}

function PlanItemRow({
  item,
  onEdit,
  onDelete,
  propertyNumber,
  onPromote,
  promoting,
}: {
  item: MaintenancePlanItem;
  onEdit: (item: MaintenancePlanItem) => void;
  onDelete: (item: MaintenancePlanItem) => void;
  propertyNumber: string;
  onPromote: (items: MaintenancePlanItem[], rawNumber: string) => void;
  promoting: boolean;
}) {
  const name = item.components?.name ?? (item.source === 'energypulse' ? item.title : 'Komponent');
  const type = item.components?.type;
  const fromEnergy = item.source === 'energypulse';
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {item.component_id ? (
            <Link
              to={`/components/${item.component_id}`}
              className="font-medium hover:underline truncate"
            >
              {name}
            </Link>
          ) : (
            <span className="font-medium truncate">{name}</span>
          )}
          <Badge variant="outline" className="text-xs">
            {actionTypeLabel(item.action_type as PlanActionType)}
          </Badge>
          {fromEnergy && (
            <Badge variant="secondary" className="text-xs">
              Energi
            </Badge>
          )}
          {item.source === 'manual' && (
            <Badge variant="outline" className="text-xs">
              Manuell
            </Badge>
          )}
          {item.user_edited && item.source === 'weibull' && !item.project_id && (
            <Badge variant="outline" className="text-xs">
              Ändrad
            </Badge>
          )}
          {item.projects?.project_number && (
            <Link
              to={`/projects/${item.project_id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {item.projects.project_number}
            </Link>
          )}
          <span className="text-xs text-muted-foreground">
            {formatYearQuarter(item.year, item.quarter as Quarter)}
          </span>
        </div>
        {type && (
          <p className="text-xs text-muted-foreground pl-5">{type}</p>
        )}
        <p className="text-sm text-muted-foreground pl-5 line-clamp-2">{item.title}</p>
        {item.notes && (
          <p className="text-xs text-muted-foreground pl-5 line-clamp-2">{item.notes}</p>
        )}
      </div>
      <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 pl-5 sm:pl-0">
        <RiskMiniBadge level={item.risk_level} score={Number(item.risk_score)} />
        <span className="text-sm font-medium tabular-nums">
          {formatSek(item.estimated_cost != null ? Number(item.estimated_cost) : null)}
        </span>
        {item.remaining_b10_years != null && (
          <span className="text-xs text-muted-foreground">
            B10 {Number(item.remaining_b10_years).toFixed(1)} år till 10 %-fel
          </span>
        )}
        {!item.project_id && (
          <PromoteNumberField
            propertyNumber={propertyNumber}
            pending={promoting}
            onSubmit={(raw) => onPromote([item], raw)}
          />
        )}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => onEdit(item)}>
            <Pencil className="h-3.5 w-3.5" />
            Ändra
          </Button>
          {!item.project_id && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-destructive hover:text-destructive"
              onClick={() => onDelete(item)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Ta bort
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuarterBlock({
  quarter,
  items,
  onEdit,
  onDelete,
  propertyNumber,
  onPromote,
  promoting,
}: {
  quarter: Quarter;
  items: MaintenancePlanItem[];
  onEdit: (item: MaintenancePlanItem) => void;
  onDelete: (item: MaintenancePlanItem) => void;
  propertyNumber: string;
  onPromote: (items: MaintenancePlanItem[], rawNumber: string) => void;
  promoting: boolean;
}) {
  const cost = items.reduce(
    (s, i) => s + (i.estimated_cost != null ? Number(i.estimated_cost) : 0),
    0,
  );
  const hasCost = items.some((i) => i.estimated_cost != null);

  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2 bg-background/50">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold">Q{quarter}</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{items.length} st</span>
          {hasCost && <span>{formatSek(cost)}</span>}
        </div>
      </div>
      {items.some((i) => !i.project_id) && (
        <PromoteNumberField
          propertyNumber={propertyNumber}
          pending={promoting}
          compactLabel="Hela kvartalet"
          onSubmit={(raw) => onPromote(items.filter((i) => !i.project_id), raw)}
        />
      )}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Inga åtgärder</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <PlanItemRow
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
              propertyNumber={propertyNumber}
              onPromote={onPromote}
              promoting={promoting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RiskMaintenancePlan({
  propertyId,
  propertyName,
}: RiskMaintenancePlanProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenancePlanItem | null>(null);
  const syncedFor = useRef<string | null>(null);
  const { organization } = useOrganization();
  const { toast } = useToast();
  const updateItem = useUpdateMaintenancePlanItem();
  const deleteItem = useDeleteMaintenancePlanItem();
  const createManual = useCreateManualPlanItem();
  const syncWeibull = useSyncWeibullPlan();
  const promoteItems = usePromotePlanItems();
  const { data: property } = useProperty(propertyId);
  const propertyNumber = projectNumberStem(property?.property_number);
  const { data: risks = [], isLoading: risksLoading } = useComponentRiskList({
    propertyId,
    limit: 2000,
  });

  const {
    data: activePlan,
    isLoading: planLoading,
    refetch: refetchPlan,
  } = useActiveMaintenancePlan(propertyId);
  const { data: allPlans = [] } = useMaintenancePlans(propertyId);
  const { data: items = [], isLoading: itemsLoading } = useMaintenancePlanItems(
    activePlan?.id,
  );
  const archivePlan = useArchiveMaintenancePlan();

  const period = useMemo(() => {
    if (!activePlan) return null;
    return computePlanPeriod(
      activePlan.start_year,
      activePlan.start_quarter as Quarter,
      activePlan.horizon_years,
    );
  }, [activePlan]);

  const years = useMemo(() => {
    if (!period) return [] as number[];
    const set = new Set<number>();
    for (let y = period.startYear; y <= period.endYear; y++) set.add(y);
    // Also include years from items if any outlier
    for (const i of items) set.add(i.year);
    return Array.from(set).sort((a, b) => a - b);
  }, [period, items]);

  const itemsByYearQuarter = useMemo(() => {
    const map = new Map<number, Map<Quarter, MaintenancePlanItem[]>>();
    for (const item of items) {
      const q = item.quarter as Quarter;
      if (!map.has(item.year)) map.set(item.year, new Map());
      const yMap = map.get(item.year)!;
      if (!yMap.has(q)) yMap.set(q, []);
      yMap.get(q)!.push(item);
    }
    return map;
  }, [items]);

  const totalCost = useMemo(() => {
    let sum = 0;
    let known = 0;
    for (const i of items) {
      if (i.estimated_cost != null) {
        sum += Number(i.estimated_cost);
        known += 1;
      }
    }
    return { sum: known > 0 ? sum : null, known, total: items.length };
  }, [items]);

  const costByYear = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of items) {
      if (i.estimated_cost == null) continue;
      m.set(i.year, (m.get(i.year) ?? 0) + Number(i.estimated_cost));
    }
    return m;
  }, [items]);

  const handleArchive = async () => {
    if (!activePlan) return;
    try {
      await archivePlan.mutateAsync(activePlan);
      toast({ title: 'Plan arkiverad' });
      refetchPlan();
    } catch (e) {
      toast({
        title: 'Kunde inte arkivera',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const archivedCount = allPlans.filter((p) => p.status === 'archived').length;

  const runWeibullSync = async () => {
    if (!organization?.id) return null;
    const start = earliestPlanQuarter();
    const [purchaseCosts, unitPrices] = await Promise.all([
      fetchPurchaseCostMap(risks.map((r) => r.componentId)),
      fetchUnitPriceMap(organization.id),
    ]);
    const drafts = generateMaintenancePlanItems(risks, {
      startYear: start.year,
      startQuarter: start.quarter,
      horizonYears: 5,
      purchaseCosts,
      unitPricesByType: unitPrices,
    });
    const result = await syncWeibull.mutateAsync({
      organizationId: organization.id,
      propertyId,
      propertyName,
      drafts,
    });
    await refetchPlan();
    return result;
  };

  useEffect(() => {
    if (planLoading || risksLoading || !organization?.id) return;
    if (syncedFor.current === propertyId) return;
    syncedFor.current = propertyId;
    void runWeibullSync().catch(() => {
      syncedFor.current = null;
    });
    // Intentionally once per property visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planLoading, risksLoading, propertyId, organization?.id]);

  if (planLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
          <Card className="border-border/50">
            <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <CalendarRange className="h-5 w-5" />
                  Underhållsplan
                </CardTitle>
                <CardDescription>
                  Kundens Excel-plan är orörd. Här jobbar vi: Weibull och
                  EnergyPulse fylls på automatiskt, resten lägger ni in manuellt.
                  Fyll i projektnummer ({propertyNumber || 'fastighetsnr'}+xx
                  eller -xx) så skapas projektet. Redigerat och borttaget skrivs
                  inte över.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void runWeibullSync()
                      .then((r) => {
                        if (!r) return;
                        toast({
                          title: 'Weibull uppdaterad',
                          description: `${r.created} nya · ${r.updated} uppdaterade · ${r.skipped} orörda`,
                        });
                      })
                      .catch((e: unknown) => {
                        toast({
                          title: 'Kunde inte uppdatera Weibull',
                          description: e instanceof Error ? e.message : undefined,
                          variant: 'destructive',
                        });
                      })
                  }
                  disabled={syncWeibull.isPending || !organization?.id}
                  className="gap-1"
                >
                  <RefreshCw className={`h-4 w-4 ${syncWeibull.isPending ? 'animate-spin' : ''}`} />
                  Uppdatera Weibull
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManualOpen(true)}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Ny åtgärd
                </Button>
                {activePlan && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleArchive}
                    disabled={archivePlan.isPending}
                    className="gap-1"
                  >
                    <Archive className="h-4 w-4" />
                    Arkivera
                  </Button>
                )}
                <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1">
                  <Plus className="h-4 w-4" />
                  {activePlan ? 'Förhandsgranska' : 'Skapa underhållsplan'}
                </Button>
              </div>
            </CardHeader>

            {!activePlan ? (
              <CardContent>
                <div className="text-center py-10 space-y-3">
                  <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/60" />
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {syncWeibull.isPending
                      ? 'Hämtar Weibull-förslag…'
                      : 'Ingen plan ännu. Weibull fylls på automatiskt. Ni kan också lägga in egna åtgärder (det som idag ligger i Excel).'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setManualOpen(true)} variant="outline" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Ny åtgärd
                    </Button>
                    <Button onClick={() => setDialogOpen(true)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Skapa underhållsplan
                    </Button>
                  </div>
                  {archivedCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {archivedCount} arkiverad(e) plan(er) finns sparade
                    </p>
                  )}
                </div>
              </CardContent>
            ) : (
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="default">{activePlan.name}</Badge>
                  {period && (
                    <Badge variant="secondary">{formatPlanPeriod(period)}</Badge>
                  )}
                  <Badge variant="outline">
                    Min risk: {riskLevelLabel(activePlan.min_risk_level as RiskLevel)}
                  </Badge>
                  <Badge variant="outline">
                    {items.length} åtgärder
                  </Badge>
                  <Badge variant="outline">
                    Kostnad≈ {formatSek(totalCost.sum)}
                    {totalCost.known < totalCost.total && totalCost.total > 0
                      ? ` (${totalCost.known}/${totalCost.total})`
                      : ''}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Genererad{' '}
                  {format(new Date(activePlan.generated_at), "d MMM yyyy HH:mm", {
                    locale: sv,
                  })}
                  {' · '}
                  Start {formatYearQuarter(activePlan.start_year, activePlan.start_quarter)}
                </p>

                {/* Year cost summary */}
                {years.length > 0 && totalCost.known > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {years.map((y) => (
                      <div
                        key={y}
                        className="rounded-md border px-3 py-2 text-center"
                      >
                        <div className="text-xs text-muted-foreground">{y}</div>
                        <div className="text-sm font-semibold tabular-nums">
                          {formatSek(costByYear.get(y) ?? null)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {itemsByYearQuarter.get(y)
                            ? Array.from(itemsByYearQuarter.get(y)!.values()).reduce(
                                (n, arr) => n + arr.length,
                                0,
                              )
                            : 0}{' '}
                          st
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {itemsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Planen är tom — inga komponenter nådde risktröskeln inom horisonten.
                  </p>
                ) : (
                  <Accordion
                    type="multiple"
                    defaultValue={years.slice(0, 2).map(String)}
                    className="space-y-2"
                  >
                    {years.map((year) => {
                      const yMap = itemsByYearQuarter.get(year);
                      const yearCount = yMap
                        ? Array.from(yMap.values()).reduce((n, a) => n + a.length, 0)
                        : 0;
                      return (
                        <AccordionItem
                          key={year}
                          value={String(year)}
                          className="border rounded-lg px-3"
                        >
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-3 text-left">
                              <span className="font-semibold">{year}</span>
                              <Badge variant="secondary" className="font-normal">
                                {yearCount} åtgärder
                              </Badge>
                              {costByYear.has(year) && (
                                <span className="text-sm text-muted-foreground tabular-nums">
                                  {formatSek(costByYear.get(year)!)}
                                </span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="grid gap-3 md:grid-cols-2 pb-2">
                              {([1, 2, 3, 4] as Quarter[]).map((q) => (
                                <QuarterBlock
                                  key={q}
                                  quarter={q}
                                  items={yMap?.get(q) ?? []}
                                  propertyNumber={propertyNumber}
                                  promoting={promoteItems.isPending}
                                  onPromote={(rows, raw) => {
                                    if (!activePlan) return;
                                    const parsed = normalizeProjectNumber(raw, propertyNumber);
                                    if (parsed.ok === false) {
                                      toast({
                                        title: 'Ogiltigt projektnummer',
                                        description: parsed.message,
                                        variant: 'destructive',
                                      });
                                      return;
                                    }
                                    const budget = rows.reduce(
                                      (s, i) =>
                                        s +
                                        (i.estimated_cost != null
                                          ? Number(i.estimated_cost)
                                          : 0),
                                      0,
                                    );
                                    const isEnergy = rows.some((i) => i.source === 'energypulse');
                                    const name =
                                      rows.length === 1
                                        ? rows[0].title
                                        : `Underhåll ${propertyName ?? propertyNumber} Q${q} ${year}`;
                                    void promoteItems
                                      .mutateAsync({
                                        planId: activePlan.id,
                                        propertyId,
                                        propertyName,
                                        propertyNumber,
                                        projectNumber: parsed.value,
                                        itemIds: rows.map((i) => i.id),
                                        year,
                                        quarter: q,
                                        budget: budget > 0 ? budget : null,
                                        name,
                                        type: isEnergy ? 'energi' : 'underhall',
                                      })
                                      .then((r) => {
                                        toast({
                                          title: r.created
                                            ? 'Projekt skapat'
                                            : 'Kopplat till befintligt projekt',
                                          description: r.projectNumber,
                                        });
                                      })
                                      .catch((e: unknown) => {
                                        toast({
                                          title: 'Kunde inte skapa projekt',
                                          description:
                                            e instanceof Error ? e.message : undefined,
                                          variant: 'destructive',
                                        });
                                      });
                                  }}
                                  onEdit={setEditing}
                                  onDelete={(item) => {
                                    const ok = window.confirm(
                                      `Ta bort «${item.title}» från planen?${
                                        item.source === 'energypulse'
                                          ? ' EnergyPulse-åtgärden avvisas.'
                                          : ''
                                      }`,
                                    );
                                    if (!ok || !activePlan) return;
                                    void deleteItem
                                      .mutateAsync({
                                        id: item.id,
                                        planId: activePlan.id,
                                        propertyId,
                                        source: item.source,
                                        external_id: item.external_id,
                                      })
                                      .then(() => {
                                        toast({ title: 'Åtgärd borttagen' });
                                      })
                                      .catch((e: unknown) => {
                                        toast({
                                          title: 'Kunde inte ta bort',
                                          description:
                                            e instanceof Error ? e.message : undefined,
                                          variant: 'destructive',
                                        });
                                      });
                                  }}
                                />
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </CardContent>
            )}
          </Card>

      {organization?.id && (
        <GenerateMaintenancePlanDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          propertyId={propertyId}
          propertyName={propertyName}
          organizationId={organization.id}
          onCreated={() => refetchPlan()}
        />
      )}

      <ManualPlanItemDialog
        open={manualOpen}
        pending={createManual.isPending || syncWeibull.isPending}
        onClose={() => setManualOpen(false)}
        onSave={async (patch) => {
          try {
            let planId = activePlan?.id;
            if (!planId) {
              const created = await runWeibullSync();
              planId = created?.planId;
            }
            if (!planId) {
              toast({
                title: 'Ingen plan att lägga på',
                description: 'Försök igen när planen skapats.',
                variant: 'destructive',
              });
              return;
            }
            await createManual.mutateAsync({
              planId,
              propertyId,
              ...patch,
            });
            toast({ title: 'Manuell åtgärd tillagd' });
            setManualOpen(false);
          } catch (e) {
            toast({
              title: 'Kunde inte lägga till',
              description: e instanceof Error ? e.message : undefined,
              variant: 'destructive',
            });
          }
        }}
      />

      <PlanItemEditDialog
        item={editing}
        planId={activePlan?.id ?? null}
        propertyId={propertyId}
        pending={updateItem.isPending}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing || !activePlan) return;
          try {
            await updateItem.mutateAsync({
              id: editing.id,
              planId: activePlan.id,
              propertyId,
              year: patch.year,
              quarter: patch.quarter,
              title: patch.title,
              notes: patch.notes,
              estimated_cost: patch.estimated_cost,
              source: editing.source,
              external_id: editing.external_id,
            });
            toast({
              title: 'Åtgärd uppdaterad',
              description:
                editing.source === 'energypulse'
                  ? 'Synkad till EnergyPulse.'
                  : undefined,
            });
            setEditing(null);
          } catch (e) {
            toast({
              title: 'Kunde inte spara',
              description: e instanceof Error ? e.message : undefined,
              variant: 'destructive',
            });
          }
        }}
      />
    </div>
  );
}

function PlanItemEditDialog({
  item,
  planId,
  propertyId,
  pending,
  onClose,
  onSave,
}: {
  item: MaintenancePlanItem | null;
  planId: string | null;
  propertyId: string;
  pending: boolean;
  onClose: () => void;
  onSave: (patch: {
    year: number;
    quarter: number;
    title: string;
    notes: string | null;
    estimated_cost: number | null;
  }) => Promise<void>;
}) {
  void planId;
  void propertyId;

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {item && (
        <PlanItemEditForm
          key={item.id}
          item={item}
          pending={pending}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Dialog>
  );
}

function PlanItemEditForm({
  item,
  pending,
  onClose,
  onSave,
}: {
  item: MaintenancePlanItem;
  pending: boolean;
  onClose: () => void;
  onSave: (patch: {
    year: number;
    quarter: number;
    title: string;
    notes: string | null;
    estimated_cost: number | null;
  }) => Promise<void>;
}) {
  const [year, setYear] = useState(item.year);
  const [quarter, setQuarter] = useState<Quarter>(item.quarter as Quarter);
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [cost, setCost] = useState(
    item.estimated_cost != null ? String(item.estimated_cost) : '',
  );

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Ändra underhållsåtgärd</DialogTitle>
        <DialogDescription>
          Tid, pris och text. EnergyPulse-rader skickas tillbaka vid spara.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Åtgärd</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>År</Label>
            <Input
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || item.year)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kvartal</Label>
            <Select
              value={String(quarter)}
              onValueChange={(v) => setQuarter(Number(v) as Quarter)}
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
        </div>
        <div className="space-y-1.5">
          <Label>Uppskattat pris (kr)</Label>
          <Input
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Information</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Avbryt
        </Button>
        <Button
          disabled={pending || !title.trim()}
          onClick={() =>
            void onSave({
              year,
              quarter,
              title: title.trim(),
              notes: notes.trim() || null,
              estimated_cost: cost === '' ? null : Number(cost),
            })
          }
        >
          Spara
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PromoteNumberField({
  propertyNumber,
  pending,
  onSubmit,
  compactLabel,
}: {
  propertyNumber: string;
  pending: boolean;
  onSubmit: (raw: string) => void;
  compactLabel?: string;
}) {
  const stem = propertyNumber || '';
  const [value, setValue] = useState(stem);
  useEffect(() => {
    if (stem && !value) setValue(stem);
  }, [stem, value]);

  return (
    <form
      className="flex items-center gap-1 w-full max-w-[220px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={stem ? `${stem}+xx` : 'Fastighetsnr saknas'}
        className="h-7 text-xs"
        disabled={!stem || pending}
        aria-label={compactLabel ?? 'Projektnummer'}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        className="h-7 px-2 text-xs shrink-0"
        disabled={!stem || pending}
      >
        {compactLabel ?? 'Projekt'}
      </Button>
    </form>
  );
}

function ManualPlanItemDialog({
  open,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (patch: {
    title: string;
    year: number;
    quarter: number;
    estimated_cost: number | null;
    notes: string | null;
  }) => Promise<void>;
}) {
  const earliest = earliestPlanQuarter();
  const [title, setTitle] = useState('');
  const [year, setYear] = useState(earliest.year);
  const [quarter, setQuarter] = useState<Quarter>(earliest.quarter);
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ny manuell åtgärd</DialogTitle>
          <DialogDescription>
            Det som idag ligger i kundens Excel — tak, fönster, målning, övrigt
            underhåll. Skriver inte i kundens fil.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Åtgärd</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="T.ex. Ommålning trapphus"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>År</Label>
              <Input
                type="number"
                min={2020}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || earliest.year)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kvartal</Label>
              <Select
                value={String(quarter)}
                onValueChange={(v) => setQuarter(Number(v) as Quarter)}
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
          </div>
          <div className="space-y-1.5">
            <Label>Uppskattat pris (kr)</Label>
            <Input
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Information</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Valfritt"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            disabled={pending || !title.trim()}
            onClick={() =>
              void onSave({
                title: title.trim(),
                year,
                quarter,
                estimated_cost: cost === '' ? null : Number(cost),
                notes: notes.trim() || null,
              }).then(() => {
                setTitle('');
                setCost('');
                setNotes('');
                setYear(earliest.year);
                setQuarter(earliest.quarter);
              })
            }
          >
            Lägg till
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
