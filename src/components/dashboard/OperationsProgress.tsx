import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface QuarterStats {
  quarter: string;
  totalTasks: number;
  completedTasks: number;
  totalPlanned: number;
  totalReported: number;
}

export function OperationsProgress() {
  const [stats, setStats] = useState<QuarterStats[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const { data: tasks } = await supabase
        .from('drift_tasks')
        .select('quarter, planned_count, reported_count')
        .eq('year', currentYear);

      if (!tasks) return;

      // Group by quarter
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      const quarterStats: QuarterStats[] = quarters.map(quarter => {
        const quarterTasks = tasks.filter(t => t.quarter === quarter);
        const totalTasks = quarterTasks.length;
        const completedTasks = quarterTasks.filter(
          t => t.reported_count >= t.planned_count && t.planned_count > 0
        ).length;
        const totalPlanned = quarterTasks.reduce((sum, t) => sum + (t.planned_count || 0), 0);
        const totalReported = quarterTasks.reduce((sum, t) => sum + (t.reported_count || 0), 0);

        return {
          quarter,
          totalTasks,
          completedTasks,
          totalPlanned,
          totalReported,
        };
      });

      setStats(quarterStats);
    } catch (error) {
      console.error('Error fetching operations stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentQuarter = () => {
    const month = new Date().getMonth();
    return `Q${Math.floor(month / 3) + 1}`;
  };

  const currentQuarter = getCurrentQuarter();
  const currentStats = stats.find(s => s.quarter === currentQuarter);

  if (loading) {
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

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Driftuppgifter - {currentQuarter} {new Date().getFullYear()}
        </CardTitle>
        <CardDescription>Översikt över kvartalets framsteg</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Task completion */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Uppgifter slutförda</span>
            </div>
            <span className="text-2xl font-bold">{taskCompletionRate}%</span>
          </div>
          <Progress value={taskCompletionRate} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {currentStats?.completedTasks || 0} av {currentStats?.totalTasks || 0} uppgifter
          </p>
        </div>

        {/* Object reporting */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Objekt rapporterade</span>
            </div>
            <span className="text-2xl font-bold">{objectReportingRate}%</span>
          </div>
          <Progress value={objectReportingRate} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {currentStats?.totalReported || 0} av {currentStats?.totalPlanned || 0} objekt
          </p>
        </div>

        {/* Warning for low completion */}
        {taskCompletionRate < 50 && currentStats && currentStats.totalTasks > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-500">
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
        </Button>
      </CardContent>
    </Card>
  );
}
