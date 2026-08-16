import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Activity,
  FileText,
  AlertTriangle,
  ArrowRight,
  CalendarRange,
} from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { propertyPath } from "@/lib/entityPaths";

interface ProjectOverviewTabProps {
  project: {
    id: string;
    budget: number | null;
    forecast: number | null;
    actual_cost: number | null;
    property_id: string;
    project_number: string;
    project_manager: string | null;
    start_date: string | null;
    end_date: string | null;
    description: string | null;
    actors: string[] | null;
    year?: number | null;
    start_quarter?: number | null;
  };
  propertyName: string;
  typeBadge: ReactNode;
  onNavigate: (tab: string) => void;
}

interface PlanRow {
  id: string;
  title: string;
  year: number;
  quarter: number;
  estimated_cost: number | null;
  source: string;
  status: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  deadline: string | null;
}

interface ActivityLog {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
}

export function ProjectOverviewTab({
  project,
  propertyName,
  typeBadge,
  onNavigate,
}: ProjectOverviewTabProps) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [planItems, setPlanItems] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [project.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [checklistRes, activityRes, planRes] = await Promise.all([
        supabase
          .from("project_checklist_items")
          .select("id, title, completed, deadline")
          .eq("project_id", project.id)
          .order("order_index", { ascending: true }),
        supabase
          .from("project_activity_log")
          .select("id, activity_type, description, created_at")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("maintenance_plan_items")
          .select("id, title, year, quarter, estimated_cost, source, status")
          .eq("project_id", project.id)
          .neq("status", "skipped")
          .order("year", { ascending: true })
          .order("quarter", { ascending: true }),
      ]);

      setChecklistItems(checklistRes.data || []);
      setActivityLogs(activityRes.data || []);
      setPlanItems((planRes.data || []) as PlanRow[]);
    } catch (error) {
      console.error("Error fetching overview data:", error);
    } finally {
      setLoading(false);
    }
  };

  const completedCount = checklistItems.filter((i) => i.completed).length;
  const totalCount = checklistItems.length;
  const checklistProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const budget = Number(project.budget ?? 0);
  const forecast = Number(project.forecast ?? 0);
  const actualCost = Number(project.actual_cost ?? 0);

  const budgetProgress = budget > 0
    ? Math.min((actualCost / budget) * 100, 100)
    : 0;
  
  const variance = budget > 0
    ? ((actualCost - budget) / budget) * 100
    : 0;

  const nextDeadline = checklistItems
    .filter((i) => !i.completed && i.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "cost_added":
        return <DollarSign className="h-4 w-4 text-blue-500" />;
      case "document_uploaded":
        return <FileText className="h-4 w-4 text-purple-500" />;
      case "checklist_update":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "status_change":
        return <Activity className="h-4 w-4 text-orange-500" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Projektinformation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Projektnummer</p>
              <p className="text-base">{project.project_number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Fastighet</p>
              <Link
                to={propertyPath(project.property_id, { tab: "maintenance-plan" })}
                className="text-base text-primary hover:underline"
              >
                {propertyName}
              </Link>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Typ</p>
              <div className="mt-1">{typeBadge}</div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Projektledare</p>
              <p className="text-base">{project.project_manager || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Period</p>
              <p className="text-base">
                {project.year
                  ? `Q${project.start_quarter ?? "–"} ${project.year}`
                  : project.start_date
                    ? format(new Date(project.start_date), "PPP", { locale: sv })
                    : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Slutdatum</p>
              <p className="text-base">
                {project.end_date
                  ? format(new Date(project.end_date), "PPP", { locale: sv })
                  : "-"}
              </p>
            </div>
          </div>
          {project.description && (
            <p className="text-base">{project.description}</p>
          )}
          {project.actors && project.actors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {project.actors.map((actor) => (
                <Badge key={actor} variant="secondary">
                  {actor}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {planItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5" />
              Från underhållsplan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {planItems.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Q{row.quarter} {row.year}
                    {row.source === "energypulse" ? " · Energi" : ""}
                    {row.status === "done" ? " · Klar" : ""}
                  </p>
                </div>
                {row.estimated_cost != null && (
                  <span className="shrink-0 tabular-nums">
                    {Math.round(Number(row.estimated_cost)).toLocaleString("sv-SE")} kr
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Economy Card */}
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("economy")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Ekonomi
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="text-lg font-bold">
                  {(budget / 1000).toFixed(0)}k
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Utfall</p>
                <p className="text-lg font-bold">
                  {(actualCost / 1000).toFixed(0)}k
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Prognos</p>
                <p className="text-lg font-bold">
                  {(forecast / 1000).toFixed(0)}k
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Förbrukat av budget</span>
                <span className={cn(
                  "font-medium",
                  variance > 10 ? "text-red-600" : 
                  variance > 0 ? "text-yellow-600" : "text-green-600"
                )}>
                  {budgetProgress.toFixed(0)}%
                </span>
              </div>
              <Progress 
                value={budgetProgress} 
                className={cn(
                  "h-2",
                  variance > 10 && "[&>div]:bg-red-500",
                  variance > 0 && variance <= 10 && "[&>div]:bg-yellow-500"
                )}
              />
            </div>

            {variance > 10 && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded">
                <AlertTriangle className="h-4 w-4" />
                <span>Projektet ligger {variance.toFixed(1)}% över budget</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Checklist Progress Card */}
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("checklist")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Framsteg
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Checklista</span>
                <span className="text-sm font-medium">
                  {completedCount} av {totalCount} klara
                </span>
              </div>
              <Progress value={checklistProgress} className="h-3" />
              <p className="text-2xl font-bold">{checklistProgress.toFixed(0)}%</p>
            </div>

            {nextDeadline && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Nästa deadline:</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{nextDeadline.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(nextDeadline.deadline!), "d MMM yyyy", { locale: sv })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {totalCount === 0 && (
              <p className="text-sm text-muted-foreground">
                Inga checklistpunkter tillagda ännu
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Senaste aktivitet
          </CardTitle>
          <Badge 
            variant="outline" 
            className="cursor-pointer hover:bg-accent"
            onClick={() => onNavigate("checklist")}
          >
            Visa alla
          </Badge>
        </CardHeader>
        <CardContent>
          {activityLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Ingen aktivitet registrerad ännu
            </p>
          ) : (
            <div className="space-y-3">
              {activityLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  {getActivityIcon(log.activity_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{log.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "d MMM HH:mm", { locale: sv })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("economy")}
        >
          <CardContent className="p-4 text-center">
            <DollarSign className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Ekonomi</p>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("work-orders")}
        >
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Arbetsordrar</p>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("documents")}
        >
          <CardContent className="p-4 text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Dokument</p>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onNavigate("checklist")}
        >
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Checklista</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
