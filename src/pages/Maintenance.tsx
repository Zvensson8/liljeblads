import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RiskMaintenancePlan } from '@/components/property/RiskMaintenancePlan';
import { useOrganization } from '@/hooks/useOrganization';
import { useProperties } from '@/hooks/useProperties';
import { useOrgActiveMaintenancePlans } from '@/hooks/useMaintenancePlans';
import { propertyPath } from '@/lib/entityPaths';

function formatSek(n: number): string {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

export default function Maintenance() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const propertyId = params.get('property') || '';
  const { organization } = useOrganization();
  const { data: properties = [] } = useProperties();
  const { data: orgPlans = [], isLoading } = useOrgActiveMaintenancePlans(
    organization?.id,
  );

  const selected = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />
            <CalendarRange className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Underhåll</h1>
          </header>
          <main className="p-4 md:p-6 space-y-6">
            <div className="max-w-3xl space-y-2">
              <p className="text-sm text-muted-foreground">
                Arbetsplan per fastighet. Kundens Excel är orörd. Weibull och
                EnergyPulse fylls på automatiskt; övrigt lägger ni in manuellt.
                Fyll i projektnummer (fastighetsnr +xx eller -xx) så skapas
                projektet. Borttaget kommer inte tillbaka vid nästa
                Weibull-uppdatering.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Fastighet</span>
                <Select
                  value={propertyId || 'all'}
                  onValueChange={(v) => {
                    const next = new URLSearchParams(params);
                    if (!v || v === 'all') next.delete('property');
                    else next.set('property', v);
                    setParams(next, { replace: true });
                  }}
                >
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Välj fastighet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla med aktiv plan</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {propertyId && selected ? (
              <RiskMaintenancePlan
                propertyId={selected.id}
                propertyName={selected.name}
              />
            ) : (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">Aktiva planer</h2>
                {isLoading && (
                  <p className="text-sm text-muted-foreground">Laddar…</p>
                )}
                {!isLoading && orgPlans.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ingen aktiv plan. Välj en fastighet och skapa en.
                  </p>
                )}
                <ul className="grid gap-2 md:grid-cols-2">
                  {orgPlans.map((plan) => {
                    const items = (plan.maintenance_plan_items ?? []).filter(
                      (i) => i.status !== 'skipped',
                    );
                    const cost = items.reduce(
                      (s, i) =>
                        s + (i.estimated_cost != null ? Number(i.estimated_cost) : 0),
                      0,
                    );
                    const name = plan.properties?.name ?? plan.name;
                    return (
                      <li key={plan.id}>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/maintenance?property=${plan.property_id}`)
                          }
                          className="w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {plan.name}
                              </div>
                            </div>
                            <Badge variant="secondary">{items.length} st</Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>Q{plan.start_quarter} {plan.start_year}</span>
                            {cost > 0 && <span>{formatSek(cost)}</span>}
                            <Link
                              to={propertyPath(plan.property_id, {
                                tab: 'maintenance-plan',
                              })}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Öppna fastighet
                            </Link>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
