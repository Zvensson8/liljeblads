import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface QuarterStats {
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  completed: number;
  total: number;
  missing: number;
  completionRate: number;
}

interface YearOverviewProps {
  year: number;
  propertyName: string;
  stats: QuarterStats[];
  onQuarterClick: (quarter: "Q1" | "Q2" | "Q3" | "Q4") => void;
}

export function YearOverview({
  year,
  propertyName,
  stats,
  onQuarterClick,
}: YearOverviewProps) {
  const getGradientClass = (rate: number) => {
    if (rate >= 80) return "gradient-success";
    if (rate >= 40) return "gradient-warning";
    return "gradient-danger";
  };

  const getQuarterColor = (rate: number) => {
    if (rate >= 80) return "text-green-600";
    if (rate >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Årsöversikt {year}</h2>
          <p className="text-muted-foreground">{propertyName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.quarter}
            className={`p-6 cursor-pointer hover:shadow-lg transition-all ${getGradientClass(
              stat.completionRate
            )}`}
            onClick={() => onQuarterClick(stat.quarter)}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{stat.quarter}</h3>
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

              <div className="relative">
                <svg className="w-32 h-32 mx-auto" viewBox="0 0 100 100">
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
                    )} progress-circle transition-all duration-1000`}
                    strokeLinecap="round"
                  />
                  <text
                    x="50"
                    y="50"
                    textAnchor="middle"
                    dy="0.3em"
                    className="text-2xl font-bold fill-current"
                  >
                    {stat.completionRate}%
                  </text>
                </svg>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Klara
                  </span>
                  <span className="font-semibold">{stat.completed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-4 h-4 text-blue-600" />
                    Totalt
                  </span>
                  <span className="font-semibold">{stat.total}</span>
                </div>
                {stat.missing > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      Saknas
                    </span>
                    <span className="font-semibold text-red-600">
                      {stat.missing}
                    </span>
                  </div>
                )}
              </div>

              <Progress value={stat.completionRate} className="h-2" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
