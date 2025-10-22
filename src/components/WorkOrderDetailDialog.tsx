import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Trash2, Download, Edit2, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { WorkOrderDialog } from "./WorkOrderDialog";

interface WorkOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
  onUpdate: () => void;
}

export function WorkOrderDetailDialog({
  open,
  onOpenChange,
  workOrder,
  onUpdate,
}: WorkOrderDetailDialogProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const { data: files, refetch: refetchFiles } = useQuery({
    queryKey: ["work-order-files", workOrder?.id],
    queryFn: async () => {
      if (!workOrder?.id) return [];
      const { data, error } = await supabase
        .from("work_order_files")
        .select("*")
        .eq("work_order_id", workOrder.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!workOrder?.id && open,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user || !workOrder?.id) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${session.user.id}/${workOrder.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("property-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("property-documents")
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from("work_order_files")
        .insert([{
          work_order_id: workOrder.id,
          name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          mime_type: file.type,
        }]);

      if (dbError) throw dbError;

      toast.success("Fil uppladdad");
      refetchFiles();
    } catch (error: any) {
      toast.error("Kunde inte ladda upp fil: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string, fileUrl: string) => {
    try {
      const filePath = fileUrl.split("/").slice(-3).join("/");
      
      const { error: storageError } = await supabase.storage
        .from("property-documents")
        .remove([filePath]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("work_order_files")
        .delete()
        .eq("id", fileId);

      if (dbError) throw dbError;

      toast.success("Fil borttagen");
      refetchFiles();
    } catch (error: any) {
      toast.error("Kunde inte ta bort fil");
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: "bg-green-500/10 text-green-500 border-green-500/20",
      medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      high: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    const labels = { low: "Låg", medium: "Medel", high: "Hög" };
    return (
      <Badge className={colors[priority as keyof typeof colors]}>
        {labels[priority as keyof typeof labels]}
      </Badge>
    );
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      not_started: "Ej påbörjad",
      awaiting_quote: "Inväntar offert",
      ordered: "Beställt",
      completed: "Slutförd",
      archived: "Arkiverad",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const handleConvertToProject = async () => {
    if (!workOrder) return;
    
    setConverting(true);
    try {
      // Skapa nytt projekt baserat på arbetsorderns data
      const { data: newProject, error: projectError } = await supabase
        .from("projects")
        .insert([{
          name: workOrder.action,
          property_id: workOrder.property_id,
          description: workOrder.comments || `Konverterat från arbetsorder: ${workOrder.action}`,
          status: "planerat",
          start_date: workOrder.due_date || new Date().toISOString().split('T')[0],
          budget: workOrder.price || null,
          project_number: `WO-${workOrder.id.substring(0, 8)}`,
          type: "underhall",
        }])
        .select()
        .single();

      if (projectError) throw projectError;

      // Uppdatera arbetsorderns status till arkiverad
      const { error: updateError } = await supabase
        .from("work_orders")
        .update({ status: "archived" })
        .eq("id", workOrder.id);

      if (updateError) throw updateError;

      toast.success("Arbetsorder konverterad till projekt!");
      onUpdate();
      onOpenChange(false);
      setConvertDialogOpen(false);
      
      // Navigera till det nya projektet
      navigate(`/projects/${newProject.id}`);
    } catch (error: any) {
      toast.error("Kunde inte konvertera till projekt: " + error.message);
    } finally {
      setConverting(false);
    }
  };

  if (!workOrder) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">Arbetsorder Detaljer</DialogTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConvertDialogOpen(true)}
                >
                  <FolderKanban className="h-4 w-4 mr-2" />
                  Konvertera till projekt
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Redigera
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Åtgärd</Label>
                    <p className="font-medium">{workOrder.action}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Fastighet</Label>
                    <p className="font-medium">{workOrder.properties?.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div className="mt-1">
                      <Badge variant="outline">{getStatusLabel(workOrder.status)}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Prioritet</Label>
                    <div className="mt-1">{getPriorityBadge(workOrder.priority)}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Entreprenör</Label>
                    <p className="font-medium">{workOrder.contractor || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Pris</Label>
                    <p className="font-medium text-green-500">
                      {workOrder.price ? `${Number(workOrder.price).toLocaleString("sv-SE")} kr` : "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Datum</Label>
                    <p className="font-medium">
                      {workOrder.due_date
                        ? format(new Date(workOrder.due_date), "yyyy-MM-dd", { locale: sv })
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Kvartal</Label>
                    <p className="font-medium">{workOrder.quarter || "-"}</p>
                  </div>
                </div>
                {workOrder.comments && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-muted-foreground">Kommentar</Label>
                      <p className="mt-1 text-sm">{workOrder.comments}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Filer
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <Button size="sm" disabled={uploading} asChild>
                      <span>
                        <Upload className="h-4 w-4 mr-2" />
                        {uploading ? "Laddar upp..." : "Ladda upp fil"}
                      </span>
                    </Button>
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {files && files.length > 0 ? (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{file.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : ""}
                              {" · "}
                              {format(new Date(file.created_at), "yyyy-MM-dd HH:mm", { locale: sv })}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(file.file_url, "_blank")}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteFile(file.id, file.file_url)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    Inga filer uppladdade än
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <WorkOrderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        order={workOrder}
        onSuccess={() => {
          onUpdate();
          setEditDialogOpen(false);
        }}
      />

      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konvertera till projekt?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta kommer att skapa ett nytt projekt baserat på denna arbetsorder. 
              Arbetsordern kommer att arkiveras automatiskt. 
              Du kan redigera projektdetaljer efter konverteringen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={converting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConvertToProject}
              disabled={converting}
            >
              {converting ? "Konverterar..." : "Konvertera till projekt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
