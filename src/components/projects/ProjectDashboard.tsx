import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "@/integrations/supabase/types";
import {
  TrendingUp,
  Briefcase,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

type ProjectStatus = Database["public"]["Enums"]["project_status"];
type ProjectType = Database["public"]["Enums"]["project_type"];

interface Project {
  id: string;
  status: ProjectStatus;
  type: ProjectType;
  budget: number;
  forecast: number;
  actual_cost: number;
}

interface ProjectDashboardProps {
  projects: Project[];
}

export function ProjectDashboard({ projects }: ProjectDashboardProps) {
  const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
  const totalForecast = projects.reduce((sum, p) => sum + p.forecast, 0);
  const totalActualCost = projects.reduce((sum, p) => sum + p.actual_cost, 0);
  const totalVariance = totalBudget > 0
    ? ((totalActualCost - totalBudget) / totalBudget) * 100
    : 0;

  const projectsByStatus = {
    planerat: projects.filter((p) => p.status === "planerat").length,
    invantar_offert: projects.filter((p) => p.status === "invantar_offert").length,
    offert_finns: projects.filter((p) => p.status === "offert_finns").length,
    pagaende: projects.filter((p) => p.status === "pagaende").length,
    pausat: projects.filter((p) => p.status === "pausat").length,
    avslutat: projects.filter((p) => p.status === "avslutat").length,
  };

  const projectsByType = {
    investering: projects.filter((p) => p.type === "investering").length,
    underhall: projects.filter((p) => p.type === "underhall").length,
    energi: projects.filter((p) => p.type === "energi").length,
    annat: projects.filter((p) => p.type === "annat").length,
  };

  const projectsOverBudget = projects.filter((p) => p.actual_cost > p.budget).length;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Totalt antal projekt</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {projectsByStatus.pagaende} pågående
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalBudget.toLocaleString("sv-SE")} kr
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Prognos: {totalForecast.toLocaleString("sv-SE")} kr
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Totalt utfall</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalActualCost.toLocaleString("sv-SE")} kr
            </div>
            <p className={`text-xs mt-1 ${
              totalVariance > 0 ? "text-red-600" : "text-green-600"
            }`}>
              {totalVariance > 0 ? "+" : ""}{totalVariance.toFixed(1)}% från budget
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Budgetvarningar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectsOverBudget}</div>
            <p className="text-xs text-muted-foreground mt-1">
              projekt över budget
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Projekt per status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(projectsByStatus).map(([status, count]) => {
              const statusLabels: Record<string, string> = {
                planerat: "Planerat",
                invantar_offert: "Inväntar offert",
                offert_finns: "Offert finns",
                pagaende: "Pågående",
                pausat: "Pausat",
                avslutat: "Avslutat",
              };
              const percentage = projects.length > 0 ? (count / projects.length) * 100 : 0;
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{statusLabels[status]}</span>
                    <span className="text-sm text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projekt per typ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(projectsByType).map(([type, count]) => {
              const typeLabels: Record<string, string> = {
                investering: "Investering",
                underhall: "Underhåll",
                energi: "Energi",
                annat: "Annat",
              };
              const percentage = projects.length > 0 ? (count / projects.length) * 100 : 0;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{typeLabels[type]}</span>
                    <span className="text-sm text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Budget Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Budgetöversikt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Budget</p>
                <p className="text-2xl font-bold">{totalBudget.toLocaleString("sv-SE")} kr</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-blue-500" />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Prognos</p>
                <p className="text-2xl font-bold">{totalForecast.toLocaleString("sv-SE")} kr</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-500" />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Utfall</p>
                <p className="text-2xl font-bold">{totalActualCost.toLocaleString("sv-SE")} kr</p>
              </div>
              <DollarSign className={`h-8 w-8 ${totalVariance > 0 ? "text-red-500" : "text-green-500"}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
