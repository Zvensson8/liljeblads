import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Activity,
  FileText,
  DollarSign,
  CheckSquare,
  AlertCircle,
  Archive,
  RefreshCw,
  Plus,
} from "lucide-react";

interface ActivityLogEntry {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
  metadata: any;
}

interface ProjectActivityLogProps {
  projectId: string;
}

const activityIcons = {
  status_change: AlertCircle,
  cost_added: DollarSign,
  cost_updated: DollarSign,
  cost_deleted: DollarSign,
  document_added: FileText,
  document_deleted: FileText,
  checklist_updated: CheckSquare,
  archived: Archive,
  reactivated: RefreshCw,
  budget_updated: DollarSign,
  manual_entry: Activity,
};

const activityColors = {
  status_change: "text-blue-600 bg-blue-100",
  cost_added: "text-green-600 bg-green-100",
  cost_updated: "text-yellow-600 bg-yellow-100",
  cost_deleted: "text-red-600 bg-red-100",
  document_added: "text-purple-600 bg-purple-100",
  document_deleted: "text-red-600 bg-red-100",
  checklist_updated: "text-blue-600 bg-blue-100",
  archived: "text-gray-600 bg-gray-100",
  reactivated: "text-green-600 bg-green-100",
  budget_updated: "text-orange-600 bg-orange-100",
  manual_entry: "text-indigo-600 bg-indigo-100",
};

export function ProjectActivityLog({ projectId }: ProjectActivityLogProps) {
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newActivityType, setNewActivityType] = useState("manual_entry");
  const [newActivityDescription, setNewActivityDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, [projectId]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_activity_log")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setActivities(data || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta aktivitetslogg");
    } finally {
      setLoading(false);
    }
  };

  const handleAddActivity = async () => {
    if (!newActivityDescription.trim()) {
      toast.error("Beskrivning krävs");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("project_activity_log").insert({
        project_id: projectId,
        activity_type: newActivityType,
        description: newActivityDescription,
      });

      if (error) throw error;

      toast.success("Aktivitet tillagd");
      setAddDialogOpen(false);
      setNewActivityDescription("");
      setNewActivityType("manual_entry");
      fetchActivities();
    } catch (error: any) {
      toast.error("Kunde inte lägga till aktivitet");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Senaste aktiviteter</h3>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Lägg till aktivitet
        </Button>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-lg mb-2 text-muted-foreground">
            Ingen aktivitet ännu
          </p>
          <p className="text-sm text-muted-foreground">
            Alla ändringar i projektet kommer att loggas här
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

          {/* Activity items */}
          <div className="space-y-6">
            {activities.map((activity) => {
              const Icon =
                activityIcons[
                  activity.activity_type as keyof typeof activityIcons
                ] || Activity;
              const colorClass =
                activityColors[
                  activity.activity_type as keyof typeof activityColors
                ] || "text-gray-600 bg-gray-100";

              return (
                <div key={activity.id} className="relative flex gap-4">
                  {/* Icon */}
                  <div
                    className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full ${colorClass}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium">{activity.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(
                            new Date(activity.created_at),
                            "PPP 'kl.' HH:mm",
                            { locale: sv }
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Metadata display if available */}
                    {activity.metadata && (
                      <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm">
                        <pre className="text-xs overflow-auto">
                          {JSON.stringify(activity.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Activity Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till aktivitet</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="activity-type">Typ av aktivitet</Label>
              <Select value={newActivityType} onValueChange={setNewActivityType}>
                <SelectTrigger id="activity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_entry">Allmän anteckning</SelectItem>
                  <SelectItem value="status_change">Statusändring</SelectItem>
                  <SelectItem value="budget_updated">Budgetändring</SelectItem>
                  <SelectItem value="document_added">Dokument tillagt</SelectItem>
                  <SelectItem value="checklist_updated">Checklista uppdaterad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="activity-description">Beskrivning</Label>
              <Textarea
                id="activity-description"
                value={newActivityDescription}
                onChange={(e) => setNewActivityDescription(e.target.value)}
                placeholder="Beskriv vad som hände..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={submitting}
            >
              Avbryt
            </Button>
            <Button onClick={handleAddActivity} disabled={submitting}>
              Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
