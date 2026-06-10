import { useState } from "react";
import {
  useProjectActivityLog,
  useLogProjectActivity,
  useUpdateProjectActivity,
  useDeleteProjectActivity,
} from "@/hooks/useProjectActivityLog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Plus,
  FileText,
  DollarSign,
  CheckSquare,
  AlertCircle,
  Archive,
  RefreshCw,
  Activity,
  Edit,
  Trash2,
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
  document_upload: FileText,
  document_deleted: FileText,
  checklist_updated: CheckSquare,
  checklist_update: CheckSquare,
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
  document_upload: "text-purple-600 bg-purple-100",
  document_deleted: "text-red-600 bg-red-100",
  checklist_updated: "text-blue-600 bg-blue-100",
  checklist_update: "text-blue-600 bg-blue-100",
  archived: "text-gray-600 bg-gray-100",
  reactivated: "text-green-600 bg-green-100",
  budget_updated: "text-orange-600 bg-orange-100",
  manual_entry: "text-indigo-600 bg-indigo-100",
};

export function ProjectActivityLog({ projectId }: ProjectActivityLogProps) {
  const { data: activities = [], isLoading: loading } = useProjectActivityLog(projectId);
  const logActivity = useLogProjectActivity();
  const updateActivity = useUpdateProjectActivity();
  const deleteActivity = useDeleteProjectActivity();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newActivityType, setNewActivityType] = useState("manual_entry");
  const [newActivityDescription, setNewActivityDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityLogEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<string | null>(null);

  const handleAddActivity = async () => {
    if (!newActivityDescription.trim()) {
      toast.error("Beskrivning krävs");
      return;
    }

    setSubmitting(true);
    try {
      await logActivity.mutateAsync({
        project_id: projectId,
        activity_type: newActivityType,
        description: newActivityDescription,
      });

      toast.success("Aktivitet tillagd");
      setAddDialogOpen(false);
      setNewActivityDescription("");
      setNewActivityType("manual_entry");
    } catch (error: unknown) {
      toast.error("Kunde inte lägga till aktivitet");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditActivity = async () => {
    if (!editingActivity || !editingActivity.description.trim()) {
      toast.error("Beskrivning krävs");
      return;
    }

    setSubmitting(true);
    try {
      await updateActivity.mutateAsync({
        id: editingActivity.id,
        activity_type: editingActivity.activity_type,
        description: editingActivity.description,
      });

      toast.success("Aktivitet uppdaterad");
      setEditDialogOpen(false);
      setEditingActivity(null);
    } catch (error: unknown) {
      toast.error("Kunde inte uppdatera aktivitet");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteActivity = async () => {
    if (!activityToDelete) return;

    try {
      await deleteActivity.mutateAsync(activityToDelete);
      toast.success("Aktivitet raderad");
      setDeleteDialogOpen(false);
      setActivityToDelete(null);
    } catch (error: unknown) {
      toast.error("Kunde inte radera aktivitet");
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
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">{activity.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(
                            new Date(activity.created_at),
                            "PPP 'kl.' HH:mm",
                            { locale: sv }
                          )}
                        </p>
                      </div>
                      {activity.activity_type === "manual_entry" && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingActivity(activity);
                              setEditDialogOpen(true);
                            }}
                            title="Redigera"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivityToDelete(activity.id);
                              setDeleteDialogOpen(true);
                            }}
                            title="Radera"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
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

      {/* Edit Activity Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera aktivitet</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Typ</Label>
              <Select
                value={editingActivity?.activity_type}
                onValueChange={(value) =>
                  setEditingActivity(
                    editingActivity
                      ? { ...editingActivity, activity_type: value }
                      : null
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_entry">Allmän anteckning</SelectItem>
                  <SelectItem value="status_change">Statusändring</SelectItem>
                  <SelectItem value="budget_updated">Budgetändring</SelectItem>
                  <SelectItem value="document_added">Dokument tillagt</SelectItem>
                  <SelectItem value="document_upload">Dokument uppladdad</SelectItem>
                  <SelectItem value="checklist_updated">Checklista uppdaterad</SelectItem>
                  <SelectItem value="checklist_update">Checklista uppdaterad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Beskrivning</Label>
              <Textarea
                value={editingActivity?.description || ""}
                onChange={(e) =>
                  setEditingActivity(
                    editingActivity
                      ? { ...editingActivity, description: e.target.value }
                      : null
                  )
                }
                placeholder="Beskriv aktiviteten..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditingActivity(null);
              }}
              disabled={submitting}
            >
              Avbryt
            </Button>
            <Button onClick={handleEditActivity} disabled={submitting}>
              {submitting ? "Sparar..." : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera aktivitet?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill radera denna aktivitet? Detta går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setActivityToDelete(null)}>
              Avbryt
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteActivity}>
              Radera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
