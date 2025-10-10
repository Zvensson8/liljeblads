import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, XCircle, TrendingUp, Package } from "lucide-react";

interface StatisticsCardProps {
  stats: {
    totalTasks: number;
    completed: number;
    remaining: number;
    missing: number;
    totalPlanned: number;
    totalReported: number;
  };
  quarter: string;
}

export function StatisticsCard({ stats, quarter }: StatisticsCardProps) {
  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completed / stats.totalTasks) * 100)
    : 0;

  const reportedRate = stats.totalPlanned > 0
    ? Math.round((stats.totalReported / stats.totalPlanned) * 100)
    : 0;

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Statistik för {quarter}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Task completion overview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Uppgifter slutförda</span>
            <span className="text-2xl font-bold text-primary">{completionRate}%</span>
          </div>
          <Progress value={completionRate} className="h-3" />
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xl font-bold">{stats.completed}</span>
              </div>
              <p className="text-xs text-muted-foreground">Klara</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-yellow-600">
                <Clock className="h-4 w-4" />
                <span className="text-xl font-bold">{stats.remaining}</span>
              </div>
              <p className="text-xs text-muted-foreground">Pågående</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-red-600">
                <XCircle className="h-4 w-4" />
                <span className="text-xl font-bold">{stats.missing}</span>
              </div>
              <p className="text-xs text-muted-foreground">Ej påbörjade</p>
            </div>
          </div>
        </div>

        {/* Object reporting overview */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Objekt redovisade</span>
            <span className="text-2xl font-bold text-primary">{reportedRate}%</span>
          </div>
          <Progress value={reportedRate} className="h-3" />
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Totalt:</span>
            </div>
            <span className="font-semibold">
              {stats.totalReported} / {stats.totalPlanned}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
