import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useComponentRiskHistory,
  type ComponentRiskSnapshot,
} from '@/hooks/useComponentRisk';
import type { ComponentRiskResult } from '@/lib/componentRisk';
import { riskLevelLabel, riskLevelColor } from '@/lib/componentRisk';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { History, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface ComponentRiskHistoryCardProps {
  componentId: string;
  /** Live score so chart is useful before any snapshots exist */
  currentRisk?: ComponentRiskResult | null;
}

function triggerLabel(source: string): string {
  switch (source) {
    case 'wo_completed':
      return 'WO slutförd';
    case 'cron':
      return 'Cron';
    case 'suggestion_executed':
      return 'Förslag utfört';
    case 'manual':
      return 'Manuell';
    case 'live':
      return 'Nu';
    default:
      return source;
  }
}

function buildChartData(
  snapshots: ComponentRiskSnapshot[],
  currentRisk?: ComponentRiskResult | null,
) {
  const points = snapshots.map((s) => ({
    id: s.id,
    at: s.created_at,
    label: format(new Date(s.created_at), 'd MMM', { locale: sv }),
    fullDate: format(new Date(s.created_at), 'yyyy-MM-dd HH:mm', { locale: sv }),
    score: s.risk_score,
    level: s.risk_level,
    confidence: s.confidence,
    trigger: triggerLabel(s.trigger_source),
    recommendation: s.recommendation,
  }));

  if (currentRisk) {
    const now = new Date().toISOString();
    points.push({
      id: 'live',
      at: now,
      label: 'Nu',
      fullDate: format(new Date(), 'yyyy-MM-dd HH:mm', { locale: sv }),
      score: currentRisk.riskScore,
      level: currentRisk.riskLevel,
      confidence: currentRisk.confidence,
      trigger: triggerLabel('live'),
      recommendation: currentRisk.recommendation,
    });
  }

  return points;
}

export function ComponentRiskHistoryCard({
  componentId,
  currentRisk,
}: ComponentRiskHistoryCardProps) {
  const { data: history = [], isLoading } = useComponentRiskHistory(componentId);
  const chartData = buildChartData(history, currentRisk);

  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const delta =
    first && last && chartData.length >= 2 ? last.score - first.score : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Riskhistorik</CardTitle>
          </div>
          {delta != null && (
            <Badge variant="outline" className="gap-1 font-normal">
              {delta < -2 ? (
                <TrendingDown className="h-3 w-3 text-emerald-500" />
              ) : delta > 2 ? (
                <TrendingUp className="h-3 w-3 text-orange-500" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )}
              {delta > 0 ? '+' : ''}
              {delta} poäng
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Snapshots sparas när arbetsordrar slutförs. Nuvarande score visas som sista punkt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!isLoading && chartData.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Ingen historik ännu. Slutför en arbetsorder kopplad till komponenten för att spara
            första mätpunkten.
          </p>
        )}

        {!isLoading && chartData.length > 0 && (
          <>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    width={32}
                    className="text-muted-foreground"
                  />
                  <ReferenceLine y={55} stroke="#f97316" strokeDasharray="4 4" />
                  <ReferenceLine y={75} stroke="#dc2626" strokeDasharray="4 4" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const p = payload[0].payload as (typeof chartData)[0];
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
                          <p className="font-medium">{p.fullDate}</p>
                          <p>
                            Score: <strong>{p.score}</strong> · {riskLevelLabel(p.level as any)} ·{' '}
                            {p.trigger}
                          </p>
                          {p.recommendation && (
                            <p className="text-muted-foreground max-w-[220px]">{p.recommendation}</p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="url(#riskFill)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {[...chartData].reverse().map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 text-xs border-b border-border/50 pb-1.5 last:border-0"
                >
                  <div className="min-w-0">
                    <span className="text-muted-foreground">{p.fullDate}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span>{p.trigger}</span>
                  </div>
                  <Badge className={riskLevelColor(p.level as any) + ' border-0 shrink-0'}>
                    {p.score}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Streckade linjer: orange = hög risk (≥55), röd = kritisk (≥75)
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
