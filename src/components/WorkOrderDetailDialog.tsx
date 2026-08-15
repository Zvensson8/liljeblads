import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
import { useGenerateOrderText, useSendWorkOrderDraft } from "@/hooks/useEdgeFunctions";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useProperties } from "@/hooks/useProperties";
import { useComponents } from "@/hooks/useComponents";
import { useUpdateWorkOrder } from "@/hooks/useWorkOrders";
import { useCreateProject } from "@/hooks/useProjects";
import { useCreateWorkOrderFile, useDeleteWorkOrderFile } from "@/hooks/useWorkOrderFiles";
import {
  Sheet,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Edit2, FolderKanban, FileArchive, Mail, X, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentPreviewDialog } from "./documents/DocumentPreviewDialog";
import { exportWorkOrderToZip } from "@/lib/zipExport";
import {
  workOrderFormSchema,
  type WorkOrderFormData,
} from "@/lib/workOrderFormSchema";
import { WorkOrderDetailInfoCard } from "@/components/work-order/WorkOrderDetailInfoCard";
import { WorkOrderEditForm } from "@/components/work-order/WorkOrderEditForm";
import { WorkOrderPreviewPanel } from "@/components/work-order/WorkOrderPreviewPanel";
import { WorkOrderFilesCard } from "@/components/work-order/WorkOrderFilesCard";

type ViewMode = "detail" | "edit" | "preview";

import type {
  WorkOrderWithRelations,
  UpdateWorkOrderInput,
  CreateProjectInput,
} from "@/types/domain";
import type { WorkOrderFile, WorkOrderFileInsert } from "@/services/supabase";

interface WorkOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: WorkOrderWithRelations | null;
  onUpdate: () => void;
}

export function WorkOrderDetailDialog({
  open,
  onOpenChange,
  workOrder,
  onUpdate,
}: WorkOrderDetailDialogProps) {
  const { session, user } = useAuth();
  const generateOrderText = useGenerateOrderText();
  const sendWorkOrderDraft = useSendWorkOrderDraft();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [uploading, setUploading] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertNumber, setConvertNumber] = useState("");
  const [previewDocument, setPreviewDocument] = useState<WorkOrderFile | null>(null);
  const [exporting, setExporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionCost, setCompletionCost] = useState("");
  const [pendingSubmitData, setPendingSubmitData] = useState<WorkOrderFormData | null>(null);

  // Preview state
  const [previewText, setPreviewText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const form = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderFormSchema),
    defaultValues: {
      action: "", property_id: "", component_id: "", status: "not_started", priority: "medium",
      price: "", contractor: "", quarter: "", comments: "", due_date: "",
      reminder_enabled: false, reminder_frequency: "weekly", reminder_recipient_email: "",
    },
  });

  const watchedPropertyId = form.watch("property_id");

  const updateWorkOrder = useUpdateWorkOrder();
  const createProject = useCreateProject();
  const createWorkOrderFile = useCreateWorkOrderFile();
  const deleteWorkOrderFile = useDeleteWorkOrderFile();

  const { data: allComponents } = useComponents(
    watchedPropertyId ? { propertyId: watchedPropertyId } : {},
  );
  const componentsForProperty = useMemo(
    () =>
      (allComponents ?? [])
        .filter((c) => c.property_id === watchedPropertyId)
        .map((c) => ({ id: c.id, name: c.name, type: c.type })),
    [allComponents, watchedPropertyId],
  );

  const { data: propertiesData } = useProperties();
  const properties = useMemo(
    () => (propertiesData ?? []).map((p) => ({ id: p.id, name: p.name })),
    [propertiesData],
  );

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

  // Reset view mode when sheet opens
  useEffect(() => {
    if (open) setViewMode("detail");
  }, [open]);

  // Populate edit form when switching to edit mode
  useEffect(() => {
    if (viewMode === "edit" && workOrder) {
      form.reset({
        action: workOrder.action || "",
        property_id: workOrder.property_id || "",
        component_id: workOrder.component_id || "",
        status: workOrder.status || "not_started",
        priority: workOrder.priority || "medium",
        price: workOrder.price?.toString() || "",
        contractor: workOrder.contractor || "",
        quarter: workOrder.quarter || "",
        comments: workOrder.comments || "",
        due_date: workOrder.due_date || "",
        reminder_enabled: workOrder.reminder_enabled || false,
        reminder_frequency: (workOrder.reminder_frequency as WorkOrderFormData["reminder_frequency"]) || "weekly",
        reminder_recipient_email: workOrder.reminder_recipient_email || user?.email || "",
      });
    }
  }, [viewMode, workOrder, form, user?.email]);

  // Auto-generate preview text
  const handleGenerate = useCallback(async () => {
    if (!workOrder?.id) return;
    setGenerating(true);
    setPreviewText("");
    try {
      const data = await generateOrderText.mutateAsync({ workOrderId: workOrder.id }) as { text?: string; error?: string };
      if (data?.error) throw new Error(data.error);
      setPreviewText(data?.text || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Okänt fel";
      setPreviewText(`[Fel vid generering: ${msg}]\n\nDu kan skriva texten manuellt nedan.`);
    } finally {
      setGenerating(false);
    }
  }, [workOrder?.id]);

  useEffect(() => {
    if (viewMode === "preview" && workOrder?.id) {
      setPreviewText("");
      handleGenerate();
    }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setViewMode("detail");
    onOpenChange(false);
  };

  const handleBack = () => setViewMode("detail");

  // ---- File handling ----
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user || !workOrder?.id) return;
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${session.user.id}/${workOrder.id}/${Date.now()}.${fileExt}`;
      await storageService.upload("property-documents", filePath, file);
      const publicUrl = storageService.getPublicUrl("property-documents", filePath);
      const fileInsert: WorkOrderFileInsert = {
        work_order_id: workOrder.id,
        name: file.name,
        file_url: publicUrl,
        file_size: file.size,
        mime_type: file.type,
      };
      await createWorkOrderFile.mutateAsync(fileInsert);
      refetchFiles();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Okänt fel";
      toast.error("Kunde inte ladda upp fil: " + msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string, fileUrl: string) => {
    try {
      const filePath = fileUrl.split("/").slice(-3).join("/");
      await storageService.remove("property-documents", [filePath]);
      await deleteWorkOrderFile.mutateAsync(fileId);
      refetchFiles();
    } catch {
      toast.error("Kunde inte ta bort fil");
    }
  };

  // ---- Edit submit ----
  const onSubmit = async (data: WorkOrderFormData) => {
    if (!user || !workOrder) return;

    // If changing to completed and a component is linked, show cost dialog
    const isCompletingNow = data.status === "completed" && workOrder.status !== "completed";
    const componentId = data.component_id || workOrder.component_id;
    if (isCompletingNow && componentId) {
      setPendingSubmitData(data);
      setCompletionCost(data.price || workOrder.price?.toString() || "");
      setCompletionDialogOpen(true);
      return;
    }

    await saveWorkOrder(data);
  };

  const saveWorkOrder = async (data: WorkOrderFormData, maintenanceCost?: number | null) => {
    if (!user || !workOrder) return;
    setSubmitting(true);
    try {
      const isCompleting = data.status === "completed" && workOrder.status !== "completed";

      // Always persist non-status fields first (component, price proposal, etc.)
      const patch: UpdateWorkOrderInput = {
        action: data.action,
        property_id: data.property_id,
        component_id: data.component_id || null,
        priority: data.priority,
        price: data.price ? parseFloat(data.price) : workOrder.price != null ? Number(workOrder.price) : null,
        contractor: data.contractor || null,
        quarter: data.quarter || null,
        comments: data.comments || null,
        due_date: data.due_date || null,
        reminder_enabled: data.reminder_enabled,
        reminder_frequency: data.reminder_frequency,
        reminder_recipient_email: data.reminder_recipient_email || null,
        project_id: workOrder.project_id || null,
        updated_at: new Date().toISOString(),
        // Status handled by completeWorkOrderWithCost when completing
        status: isCompleting ? workOrder.status : data.status,
      };
      await updateWorkOrder.mutateAsync({ id: workOrder.id, patch });

      if (isCompleting) {
        const { completeWorkOrderWithCost } = await import("@/lib/completeWorkOrder");
        const proposed = data.price
          ? parseFloat(data.price)
          : workOrder.price != null
            ? Number(workOrder.price)
            : null;
        // Prefer explicit dialog cost; if "skip" with null, still use proposed price
        const costToRegister =
          maintenanceCost !== undefined && maintenanceCost !== null
            ? maintenanceCost
            : proposed;

        const result = await completeWorkOrderWithCost({
          workOrderId: workOrder.id,
          finalCost: costToRegister,
        });
        const riskNote =
          result.riskAfter != null
            ? ` Risk efteråt: ${result.riskAfter.riskLevel} (${result.riskAfter.riskScore}).`
            : "";
        const closed =
          result.riskFeedback?.closedSuggestions
            ? ` ${result.riskFeedback.closedSuggestions} riskförslag stängda.`
            : "";
        toast.success(
          result.costRegistered != null
            ? `Slutförd. ${result.costRegistered.toLocaleString("sv-SE")} kr registrerad på komponenten.${riskNote}${closed}`
            : result.maintenanceHistoryId
              ? `Slutförd och kopplad till servicehistorik.${riskNote}${closed}`
              : "Slutförd. Koppla en komponent på ordern för att spara kostnad på komponent.",
        );
      }

      onUpdate();
      setViewMode("detail");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Okänt fel";
      toast.error("Uppdatering misslyckades: " + msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletionConfirm = async () => {
    if (!pendingSubmitData) return;
    const cost = completionCost.trim() !== "" ? parseFloat(completionCost) : null;
    setCompletionDialogOpen(false);
    await saveWorkOrder(pendingSubmitData, Number.isFinite(cost as number) ? cost : null);
    setPendingSubmitData(null);
  };

  const handleCompletionSkip = async () => {
    if (!pendingSubmitData) return;
    setCompletionDialogOpen(false);
    // Still register proposed price on component when skipping the dialog input
    await saveWorkOrder(pendingSubmitData, undefined);
    setPendingSubmitData(null);
  };

  // ---- Send preview email ----
  const handleSendPreview = async () => {
    if (!previewText.trim()) { toast.error("Skriv eller generera en text först"); return; }
    setSending(true);
    try {
      if (!user?.email) throw new Error("Kunde inte hämta din e-post");
      const data = await sendWorkOrderDraft.mutateAsync({
        workOrderId: workOrder.id,
        userEmail: user.email,
        customText: previewText,
      }) as { error?: string };
      if (data?.error) throw new Error(data.error);
      toast.success("Beställningsutkast skickat till din e-post");
      setViewMode("detail");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kunde inte skicka utkast";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // ---- Convert to project ----
  const handleConvertToProject = async () => {
    if (!workOrder) return;
    const property = (propertiesData ?? []).find((p) => p.id === workOrder.property_id);
    const { normalizeProjectNumber } = await import("@/lib/projectNumber");
    const parsed = normalizeProjectNumber(convertNumber, property?.property_number);
    if (parsed.ok === false) {
      toast.error(parsed.message);
      return;
    }
    setConverting(true);
    try {
      const { data: existing } = await supabase
        .from("projects")
        .select("id, property_id, project_number")
        .eq("project_number", parsed.value)
        .maybeSingle();

      let projectId: string;
      if (existing) {
        if (existing.property_id !== workOrder.property_id) {
          throw new Error("Projektnumret används redan på en annan fastighet");
        }
        projectId = existing.id;
      } else {
        const projectInsert: CreateProjectInput = {
          name: workOrder.action,
          property_id: workOrder.property_id,
          description: workOrder.comments || `Från arbetsorder: ${workOrder.action}`,
          status: "planerat",
          start_date: workOrder.due_date || new Date().toISOString().split("T")[0],
          budget: workOrder.price || null,
          project_number: parsed.value,
          type: "underhall",
        };
        const newProject = await createProject.mutateAsync(projectInsert);
        if (!newProject) throw new Error("Projektet kunde inte skapas");
        projectId = newProject.id;
      }

      const conversionNote = `Kopplad till projekt ${parsed.value}`;
      const updatedComments = workOrder.comments
        ? `${workOrder.comments}\n\n${conversionNote}`
        : conversionNote;
      await updateWorkOrder.mutateAsync({
        id: workOrder.id,
        patch: { project_id: projectId, comments: updatedComments },
      });
      toast.success("Arbetsorder kopplad till projekt");
      onUpdate();
      setConvertDialogOpen(false);
      setConverting(false);
      setTimeout(() => {
        onOpenChange(false);
        navigate(`/projects/${projectId}`);
      }, 100);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Okänt fel";
      toast.error("Kunde inte koppla till projekt: " + msg);
      setConverting(false);
    }
  };

  const handleExport = async () => {
    if (!workOrder) return;
    setExporting(true);
    try { await exportWorkOrderToZip(workOrder.id); toast.success("Arbetsorder exporterad"); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Kunde inte exportera arbetsorder"); }
    finally { setExporting(false); }
  };

  if (!workOrder) return null;

  const sheetTitle = viewMode === "edit" ? "Redigera Arbetsorder"
    : viewMode === "preview" ? "Beställningsutkast"
    : "Arbetsorder Detaljer";

  return (
    <>
      <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
        <SheetPrimitive.Portal>
          <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <SheetPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-0 border-l bg-background p-0 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-2xl">
            {/* Header */}
            <div className="flex-none border-b px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {viewMode !== "detail" && (
                    <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <SheetTitle className="text-xl font-semibold text-foreground">
                    {sheetTitle}
                  </SheetTitle>
                </div>
                <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Stäng</span>
                </Button>
              </div>
              <SheetDescription className="sr-only">Arbetsorder information</SheetDescription>

              {/* Action buttons - only in detail mode */}
              {viewMode === "detail" && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => setViewMode("preview")}>
                    <Mail className="h-4 w-4 mr-2" />Beställningsutkast
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                    <FileArchive className="h-4 w-4 mr-2" />{exporting ? "Exporterar..." : "Exportera"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConvertDialogOpen(true)}>
                    <FolderKanban className="h-4 w-4 mr-2" />Konvertera till projekt
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setViewMode("edit")}>
                    <Edit2 className="h-4 w-4 mr-2" />Redigera
                  </Button>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {viewMode === "detail" && (
                <div className="space-y-6">
                  <WorkOrderDetailInfoCard workOrder={workOrder} />
                  <WorkOrderFilesCard
                    files={files}
                    uploading={uploading}
                    onUpload={handleFileUpload}
                    onPreview={setPreviewDocument}
                    onDelete={handleDeleteFile}
                  />
                </div>
              )}

              {viewMode === "edit" && (
                <WorkOrderEditForm
                  form={form}
                  properties={properties}
                  componentsForProperty={componentsForProperty}
                  watchedPropertyId={watchedPropertyId}
                  submitting={submitting}
                  onSubmit={onSubmit}
                  onCancel={handleBack}
                />
              )}

              {viewMode === "preview" && (
                <WorkOrderPreviewPanel
                  action={workOrder.action}
                  contractor={workOrder.contractor}
                  price={workOrder.price}
                  quarter={workOrder.quarter}
                  previewText={previewText}
                  generating={generating}
                  sending={sending}
                  onPreviewTextChange={setPreviewText}
                  onRegenerate={handleGenerate}
                  onBack={handleBack}
                  onSend={handleSendPreview}
                />
              )}
            </div>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      </Sheet>

      <DocumentPreviewDialog
        open={!!previewDocument}
        onOpenChange={(o) => !o && setPreviewDocument(null)}
        document={previewDocument}
      />

      <AlertDialog open={convertDialogOpen} onOpenChange={(o) => {
        setConvertDialogOpen(o);
        if (o && workOrder) {
          const property = (propertiesData ?? []).find((p) => p.id === workOrder.property_id);
          setConvertNumber(property?.property_number?.trim() ?? "");
        }
      }}>
        <AlertDialogContent aria-describedby="convert-description">
          <AlertDialogHeader>
            <AlertDialogTitle>Koppla till projekt</AlertDialogTitle>
            <AlertDialogDescription id="convert-description">
              Ange projektnummer (fastighetsnummer +xx eller -xx). Arbetsordern
              lämnas öppen under projektet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="wo-project-number">Projektnummer</Label>
            <Input
              id="wo-project-number"
              value={convertNumber}
              onChange={(e) => setConvertNumber(e.target.value)}
              placeholder="Fastighetsnr+xx"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={converting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvertToProject} disabled={converting}>
              {converting ? "Sparar..." : "Skapa / koppla projekt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slutför arbetsorder</AlertDialogTitle>
            <AlertDialogDescription>
              Arbetsorderdern kommer att markeras som slutförd och en underhållspost skapas automatiskt för den kopplade komponenten. Vill du registrera en kostnad?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="completion-cost">Kostnad (valfritt)</Label>
            <Input
              id="completion-cost"
              type="number"
              placeholder="Ange kostnad i kr"
              value={completionCost}
              onChange={(e) => setCompletionCost(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCompletionSkip}>Hoppa över</AlertDialogCancel>
            <AlertDialogAction onClick={handleCompletionConfirm}>
              Spara &amp; slutför
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
