import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface QuarterStats {
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  completed: number;
  total: number;
  missing: number;
  completionRate: number;
}

interface YearOverviewProps {
  propertyId: string;
  propertyName: string;
  year: number;
  onQuarterClick: (quarter: "Q1" | "Q2" | "Q3" | "Q4") => void;
}

export function YearOverview({
  propertyId,
  propertyName,
  year,
  onQuarterClick,
}: YearOverviewProps) {
  const [stats, setStats] = useState<QuarterStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastYearStats, setLastYearStats] = useState<QuarterStats[]>([]);

  useEffect(() => {
    fetchStats();
    fetchLastYearStats();
  }, [propertyId, year]);

  const fetchStats = async () => {
    setLoading(true);
    const { data: tasks } = await supabase
      .from("drift_tasks")
      .select("quarter, planned_count, reported_count")
      .eq("property_id", propertyId)
      .eq("year", year);

    if (!tasks) {
      setLoading(false);
      return;
    }

    const quarters: ("Q1" | "Q2" | "Q3" | "Q4")[] = ["Q1", "Q2", "Q3", "Q4"];
    const quarterStats: QuarterStats[] = quarters.map((quarter) => {
      const quarterTasks = tasks.filter((t) => t.quarter === quarter);
      const total = quarterTasks.length;
      const completed = quarterTasks.filter(
        (t) => t.reported_count >= t.planned_count && t.planned_count > 0
      ).length;
      const missing = quarterTasks.filter((t) => t.reported_count === 0).length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { quarter, completed, total, missing, completionRate };
    });

    setStats(quarterStats);
    setLoading(false);
  };

  const fetchLastYearStats = async () => {
    const { data: tasks } = await supabase
      .from("drift_tasks")
      .select("quarter, planned_count, reported_count")
      .eq("property_id", propertyId)
      .eq("year", year - 1);

    if (!tasks) return;

    const quarters: ("Q1" | "Q2" | "Q3" | "Q4")[] = ["Q1", "Q2", "Q3", "Q4"];
    const quarterStats: QuarterStats[] = quarters.map((quarter) => {
      const quarterTasks = tasks.filter((t) => t.quarter === quarter);
      const total = quarterTasks.length;
      const completed = quarterTasks.filter(
        (t) => t.reported_count >= t.planned_count && t.planned_count > 0
      ).length;
      const missing = quarterTasks.filter((t) => t.reported_count === 0).length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return { quarter, completed, total, missing, completionRate };
    });

    setLastYearStats(quarterStats);
  };

  const getGradientClass = (rate: number) => {
    if (rate >= 80) return "bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/50";
    if (rate >= 40) return "bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/50";
    return "bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/50";
  };

  const getQuarterColor = (rate: number) => {
    if (rate >= 80) return "text-green-600";
    if (rate >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  const getTrendIndicator = (quarter: "Q1" | "Q2" | "Q3" | "Q4") => {
    const currentStat = stats.find((s) => s.quarter === quarter);
    const lastYearStat = lastYearStats.find((s) => s.quarter === quarter);

    if (!currentStat || !lastYearStat) return null;

    const diff = currentStat.completionRate - lastYearStat.completionRate;
    if (diff > 5) {
      return (
        <div className="flex items-center gap-1 text-xs text-green-600">
          <TrendingUp className="h-3 w-3" />
          <span>+{diff}%</span>
        </div>
      );
    } else if (diff < -5) {
      return (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <TrendingDown className="h-3 w-3" />
          <span>{diff}%</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>±0%</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 animate-pulse bg-muted/50">
            <div className="h-32"></div>
          </Card>
        ))}
      </div>
    );
  }

  const totalTasks = stats.reduce((sum, s) => sum + s.total, 0);
  const totalCompleted = stats.reduce((sum, s) => sum + s.completed, 0);
  const overallRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary header */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
        <div>
          <h2 className="text-xl font-bold">Årsöversikt {year}</h2>
          <p className="text-muted-foreground text-sm">{propertyName}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">{overallRate}%</div>
          <p className="text-sm text-muted-foreground">
            {totalCompleted} av {totalTasks} uppgifter
          </p>
        </div>
      </div>

      {/* Quarter cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.quarter}
            className={`p-6 cursor-pointer hover:shadow-lg transition-all border-2 ${getGradientClass(
              stat.completionRate
            )}`}
            onClick={() => onQuarterClick(stat.quarter)}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{stat.quarter}</h3>
                <div className="flex items-center gap-2">
                  {getTrendIndicator(stat.quarter)}
                  <Badge
                    variant={
                      stat.completionRate >= 80
                        ? "default"
                        : stat.completionRate >= 40
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {stat.completionRate}%
                  </Badge>
                </div>
              </div>

              <div className="relative">
                <svg className="w-28 h-28 mx-auto" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted opacity-20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${stat.completionRate * 2.51} 251.2`}
                    strokeDashoffset="0"
                    transform="rotate(-90 50 50)"
                    className={`${getQuarterColor(
                      stat.completionRate
                    )} transition-all duration-1000`}
                    strokeLinecap="round"
                  />
                  <text
                    x="50"
                    y="50"
                    textAnchor="middle"
                    dy="0.3em"
                    className="text-xl font-bold fill-current"
                  >
                    {stat.completionRate}%
                  </text>
                </svg>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    Klara
                  </span>
                  <span className="font-medium">{stat.completed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Totalt
                  </span>
                  <span className="font-medium">{stat.total}</span>
                </div>
                {stat.missing > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      Saknas
                    </span>
                    <span className="font-medium text-red-600">{stat.missing}</span>
                  </div>
                )}
              </div>

              <Progress value={stat.completionRate} className="h-1.5" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
