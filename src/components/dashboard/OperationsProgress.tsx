import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Calendar, CheckCircle2, Clock, AlertCircle, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useDriftTasks } from '@/hooks/useDriftTasks';

interface QuarterStats {
  quarter: string;
  totalTasks: number;
  completedTasks: number;
  totalPlanned: number;
  totalReported: number;
  completionRate: number;
}

/**
 * Dashboard widget showing operational drift task progress for the
 * current year, with weekly delta and per-quarter breakdown.
 *
 * Migrated to `useDriftTasks` so it picks up realtime invalidations and
 * optimistic updates from elsewhere in the app — when Operations marks
 * a task done, this widget recalculates immediately without a refetch
 * round-trip.
 */
export function OperationsProgress() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const { data: tasks = [], isLoading } = useDriftTasks({ year: currentYear });

  const { stats, missingCount, weeklyChange } = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterStats: QuarterStats[] = quarters.map((quarter) => {
      const quarterTasks = tasks.filter((t) => t.quarter === quarter);
      const totalTasks = quarterTasks.length;
      const completedTasks = quarterTasks.filter(
        (t) => t.reported_count >= t.planned_count && t.planned_count > 0
      ).length;
      const totalPlanned = quarterTasks.reduce(
        (sum, t) => sum + (t.planned_count || 0),
        0
      );
      const totalReported = quarterTasks.reduce(
        (sum, t) => sum + (t.reported_count || 0),
        0
      );
      const completionRate =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      return {
        quarter,
        totalTasks,
        completedTasks,
        totalPlanned,
        totalReported,
        completionRate,
      };
    });

    const totalMissing = tasks.filter(
      (t) => t.reported_count < t.planned_count
    ).length;

    const recentlyCompleted = tasks.filter((t) => {
      const updatedAt = new Date(t.updated_at);
      return (
        t.reported_count >= t.planned_count &&
        t.planned_count > 0 &&
        updatedAt >= oneWeekAgo
      );
    }).length;

    return {
      stats: quarterStats,
      missingCount: totalMissing,
      weeklyChange: recentlyCompleted,
    };
  }, [tasks]);

  const getCurrentQuarter = () => {
    const month = new Date().getMonth();
    return `Q${Math.floor(month / 3) + 1}`;
  };

  const currentQuarter = getCurrentQuarter();
  const currentStats = stats.find((s) => s.quarter === currentQuarter);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Driftuppgifter
          </CardTitle>
          <CardDescription>Översikt över kvartalets framsteg</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const taskCompletionRate = currentStats
    ? currentStats.totalTasks > 0
      ? Math.round((currentStats.completedTasks / currentStats.totalTasks) * 100)
      : 0
    : 0;

  const objectReportingRate = currentStats
    ? currentStats.totalPlanned > 0
      ? Math.round((currentStats.totalReported / currentStats.totalPlanned) * 100)
      : 0
    : 0;

  const getQuarterColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-500';
    if (rate >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Driftuppgifter - {currentQuarter} {new Date().getFullYear()}
          </CardTitle>
          {weeklyChange > 0 && (
            <Badge variant="secondary" className="text-green-600 bg-green-100">
              <TrendingUp className="h-3 w-3 mr-1" />
              +{weeklyChange} denna vecka
            </Badge>
          )}
        </div>
        <CardDescription>Översikt över årets framsteg</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Task completion */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Uppgifter slutförda</span>
            </div>
            <div className="flex items-center gap-2">
              {weeklyChange > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : weeklyChange < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-2xl font-bold">{taskCompletionRate}%</span>
            </div>
          </div>
          <Progress value={taskCompletionRate} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {currentStats?.completedTasks || 0} av {currentStats?.totalTasks || 0} uppgifter
            {weeklyChange > 0 && ` (+${weeklyChange} denna vecka)`}
          </p>
        </div>

        {/* Mini quarter bars */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground font-medium">Alla kvartal</span>
          <div className="flex gap-2">
            {stats.map((s) => (
              <div key={s.quarter} className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{s.quarter}</span>
                  <span className="text-xs text-muted-foreground">{s.completionRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all ${getQuarterColor(s.completionRate)}`}
                    style={{ width: `${s.completionRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warning for missing tasks */}
        {missingCount > 0 && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors"
            onClick={() => navigate('/operations')}
          >
            <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-600">
                {missingCount} uppgifter saknar rapportering
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-yellow-500" />
          </div>
        )}

        {/* Warning for low completion */}
        {taskCompletionRate < 50 && currentStats && currentStats.totalTasks > 0 && missingCount === 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-600">
                Låg slutförandegrad
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Mindre än 50% av uppgifterna är slutförda detta kvartal
              </p>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate('/operations')}
        >
          Visa alla driftuppgifter
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
