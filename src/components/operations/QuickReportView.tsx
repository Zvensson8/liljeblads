import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Zap, CheckCircle2, AlertCircle, Search } from "lucide-react";
import { toast } from "sonner";

interface Task {
  id: string;
  name: string;
  description: string | null;
  planned_count: number;
  reported_count: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
}

interface QuickReportViewProps {
  propertyId: string;
  year: number;
  onTaskUpdated?: () => void;
}

export function QuickReportView({ propertyId, year, onTaskUpdated }: QuickReportViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [quarterFilter, setQuarterFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchIncompleteTasks();
  }, [propertyId, year]);

  const fetchIncompleteTasks = async () => {
    setLoading(true);
    
    // Fetch all tasks for the year, we'll filter incomplete ones client-side
    const { data, error } = await supabase
      .from("drift_tasks")
      .select("id, name, description, planned_count, reported_count, quarter")
      .eq("property_id", propertyId)
      .eq("year", year)
      .order("quarter")
      .order("name");

    if (error) {
      toast.error("Kunde inte hämta uppgifter");
      setLoading(false);
      return;
    }

    // Only keep tasks where reported_count < planned_count
    const incompleteTasks = (data || []).filter(
      (t) => t.reported_count < t.planned_count
    ) as Task[];
    
    setTasks(incompleteTasks);
    setLoading(false);
  };

  const handleMarkComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Optimistic update
    setTasks(tasks.filter((t) => t.id !== taskId));

    const { error } = await supabase
      .from("drift_tasks")
      .update({ reported_count: task.planned_count })
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte uppdatera");
      fetchIncompleteTasks();
      return;
    }

    toast.success("Uppgift markerad som klar");
    onTaskUpdated?.();
  };

  const handleIncrementReported = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const newReportedCount = task.reported_count + 1;

    // Optimistic update
    if (newReportedCount >= task.planned_count) {
      setTasks(tasks.filter((t) => t.id !== taskId));
    } else {
      setTasks(
        tasks.map((t) =>
          t.id === taskId ? { ...t, reported_count: newReportedCount } : t
        )
      );
    }

    const { error } = await supabase
      .from("drift_tasks")
      .update({ reported_count: newReportedCount })
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte uppdatera");
      fetchIncompleteTasks();
      return;
    }

    if (newReportedCount >= task.planned_count) {
      toast.success("Uppgift klar!");
    }
    onTaskUpdated?.();
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesQuarter = quarterFilter === "all" || task.quarter === quarterFilter;
    const matchesSearch =
      searchQuery === "" ||
      task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesQuarter && matchesSearch;
  });

  const quarters = ["Q1", "Q2", "Q3", "Q4"] as const;
  const quarterCounts = quarters.reduce(
    (acc, q) => {
      acc[q] = tasks.filter((t) => t.quarter === q).length;
      return acc;
    },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Snabbrapportera
          {tasks.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {tasks.length} kvar
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 pb-2 border-b">
          <Button
            variant={quarterFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setQuarterFilter("all")}
          >
            Alla ({tasks.length})
          </Button>
          {quarters.map((q) => (
            <Button
              key={q}
              variant={quarterFilter === q ? "default" : "outline"}
              size="sm"
              onClick={() => setQuarterFilter(q)}
              disabled={quarterCounts[q] === 0}
            >
              {q} ({quarterCounts[q]})
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök uppgifter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Task list */}
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <p className="text-lg font-medium text-green-600">Alla uppgifter klara!</p>
            <p className="text-sm text-muted-foreground mt-1">
              {quarterFilter === "all"
                ? "Alla driftuppgifter för året är slutförda"
                : `Alla driftuppgifter för ${quarterFilter} är slutförda`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => {
              const progress = (task.reported_count / task.planned_count) * 100;
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => handleMarkComplete(task.id)}
                    className="h-5 w-5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{task.name}</span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {task.quarter}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={progress} className="h-1.5 flex-1 max-w-[120px]" />
                      <span className="text-xs text-muted-foreground">
                        {task.reported_count} / {task.planned_count}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleIncrementReported(task.id)}
                      className="h-8 px-2"
                    >
                      +1
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleMarkComplete(task.id)}
                      className="h-8"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Klar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <span>
              Klicka på checkboxen eller "Klar" för att markera hela uppgiften som slutförd
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

