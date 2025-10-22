import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
};

export function ProjectActivityLog({ projectId }: ProjectActivityLogProps) {
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-lg mb-2 text-muted-foreground">
          Ingen aktivitet ännu
        </p>
        <p className="text-sm text-muted-foreground">
          Alla ändringar i projektet kommer att loggas här
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Senaste aktiviteter</h3>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

        {/* Activity items */}
        <div className="space-y-6">
          {activities.map((activity, index) => {
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
    </div>
  );
}
