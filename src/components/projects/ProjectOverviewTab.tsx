import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Activity,
  TrendingUp,
  FileText,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ProjectOverviewTabProps {
  project: {
    id: string;
    budget: number;
    forecast: number;
    actual_cost: number;
    property_id: string;
  };
  onNavigate: (tab: string) => void;
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

export function ProjectOverviewTab({ project, onNavigate }: ProjectOverviewTabProps) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [project.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [checklistRes, activityRes] = await Promise.all([
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
      ]);

      setChecklistItems(checklistRes.data || []);
      setActivityLogs(activityRes.data || []);
    } catch (error) {
      console.error("Error fetching overview data:", error);
    } finally {
      setLoading(false);
    }
  };

  const completedCount = checklistItems.filter((i) => i.completed).length;
  const totalCount = checklistItems.length;
  const checklistProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const budgetProgress = project.budget > 0 
    ? Math.min((project.actual_cost / project.budget) * 100, 100)
    : 0;
  
  const variance = project.budget > 0
    ? ((project.actual_cost - project.budget) / project.budget) * 100
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
                  {(project.budget / 1000).toFixed(0)}k
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Utfall</p>
                <p className="text-lg font-bold">
                  {(project.actual_cost / 1000).toFixed(0)}k
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Prognos</p>
                <p className="text-lg font-bold">
                  {(project.forecast / 1000).toFixed(0)}k
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
            onClick={() => onNavigate("activity")}
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
          onClick={() => onNavigate("simulation")}
        >
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Simulering</p>
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
