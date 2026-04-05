import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, FileText, Trash2, Download, Edit2, FolderKanban,
  Eye, FileArchive, Mail, X, ArrowLeft, RefreshCw, Loader2, Send, Info,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DocumentPreviewDialog } from "./documents/DocumentPreviewDialog";
import { exportWorkOrderToZip } from "@/lib/zipExport";

type ViewMode = "detail" | "edit" | "preview";

const workOrderSchema = z.object({
  action: z.string().min(1, "Åtgärd krävs").max(200, "Max 200 tecken"),
  property_id: z.string().min(1, "Fastighet krävs"),
  due_date: z.string().optional(),
  status: z.enum(["not_started", "awaiting_quote", "ordered", "completed", "archived"]),
  priority: z.enum(["low", "medium", "high"]),
  price: z.string().optional(),
  contractor: z.string().max(100, "Max 100 tecken").optional(),
  quarter: z.string().max(10, "Max 10 tecken").optional(),
  comments: z.string().max(1000, "Max 1000 tecken").optional(),
  reminder_enabled: z.boolean().default(false),
  reminder_frequency: z.enum(["weekly", "biweekly", "triweekly", "monthly", "none"]).default("weekly"),
  reminder_recipient_email: z.string().email("Ogiltig e-postadress").optional().or(z.literal("")),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

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
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [uploading, setUploading] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Preview state
  const [previewText, setPreviewText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const form = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      action: "", property_id: "", status: "not_started", priority: "medium",
      price: "", contractor: "", quarter: "", comments: "", due_date: "",
      reminder_enabled: false, reminder_frequency: "weekly", reminder_recipient_email: "",
    },
  });

  const { data: properties } = useQuery({
    queryKey: ["properties-for-work-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

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
        status: workOrder.status || "not_started",
        priority: workOrder.priority || "medium",
        price: workOrder.price?.toString() || "",
        contractor: workOrder.contractor || "",
        quarter: workOrder.quarter || "",
        comments: workOrder.comments || "",
        due_date: workOrder.due_date || "",
        reminder_enabled: workOrder.reminder_enabled || false,
        reminder_frequency: workOrder.reminder_frequency || "weekly",
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
      const { data, error } = await supabase.functions.invoke("generate-order-text", {
        body: { workOrderId: workOrder.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreviewText(data.text || "");
    } catch (err: any) {
      setPreviewText(`[Fel vid generering: ${err.message || "Okänt fel"}]\n\nDu kan skriva texten manuellt nedan.`);
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
      const { error: uploadError } = await supabase.storage.from("property-documents").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("property-documents").getPublicUrl(filePath);
      const { error: dbError } = await supabase.from("work_order_files").insert([{
        work_order_id: workOrder.id, name: file.name, file_url: publicUrl, file_size: file.size, mime_type: file.type,
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
      await supabase.storage.from("property-documents").remove([filePath]);
      await supabase.from("work_order_files").delete().eq("id", fileId);
      toast.success("Fil borttagen");
      refetchFiles();
    } catch {
      toast.error("Kunde inte ta bort fil");
    }
  };

  // ---- Edit submit ----
  const onSubmit = async (data: WorkOrderFormData) => {
    if (!user || !workOrder) return;
    setSubmitting(true);
    try {
      const payload = {
        action: data.action, property_id: data.property_id, status: data.status, priority: data.priority,
        price: data.price ? parseFloat(data.price) : null, contractor: data.contractor || null,
        quarter: data.quarter || null, comments: data.comments || null, due_date: data.due_date || null,
        reminder_enabled: data.reminder_enabled, reminder_frequency: data.reminder_frequency,
        reminder_recipient_email: data.reminder_recipient_email || null,
        project_id: workOrder.project_id || null, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("work_orders").update(payload).eq("id", workOrder.id);
      if (error) throw error;
      toast.success("Arbetsorder uppdaterad");
      onUpdate();
      setViewMode("detail");
    } catch (error: any) {
      toast.error("Uppdatering misslyckades: " + (error.message || "Okänt fel"));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Send preview email ----
  const handleSendPreview = async () => {
    if (!previewText.trim()) { toast.error("Skriv eller generera en text först"); return; }
    setSending(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) throw new Error("Kunde inte hämta din e-post");
      const { data, error } = await supabase.functions.invoke("send-work-order-draft", {
        body: { workOrderId: workOrder.id, userEmail: authUser.email, customText: previewText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Beställningsutkast skickat till din e-post");
      setViewMode("detail");
    } catch (err: any) {
      toast.error(err.message || "Kunde inte skicka utkast");
    } finally {
      setSending(false);
    }
  };

  // ---- Convert to project ----
  const handleConvertToProject = async () => {
    if (!workOrder) return;
    setConverting(true);
    try {
      const { data: newProject, error: projectError } = await supabase
        .from("projects").insert([{
          name: workOrder.action, property_id: workOrder.property_id,
          description: workOrder.comments || `Konverterat från arbetsorder: ${workOrder.action}`,
          status: "planerat", start_date: workOrder.due_date || new Date().toISOString().split('T')[0],
          budget: workOrder.price || null, project_number: `WO-${workOrder.id.substring(0, 8)}`, type: "underhall",
        }]).select().single();
      if (projectError) throw projectError;
      if (!newProject) throw new Error("Projektet kunde inte skapas");
      const conversionNote = `Konverterad till projekt ${newProject.project_number} - ${newProject.name}`;
      const updatedComments = workOrder.comments ? `${workOrder.comments}\n\n${conversionNote}` : conversionNote;
      await supabase.from("work_orders").update({ status: "completed", comments: updatedComments }).eq("id", workOrder.id);
      toast.success("Arbetsorder konverterad till projekt!");
      onUpdate();
      setConvertDialogOpen(false);
      setConverting(false);
      setTimeout(() => { onOpenChange(false); navigate(`/projects/${newProject.id}`); }, 100);
    } catch (error: any) {
      toast.error("Kunde inte konvertera till projekt: " + (error.message || "Okänt fel"));
      setConverting(false);
    }
  };

  const handleExport = async () => {
    if (!workOrder) return;
    setExporting(true);
    try { await exportWorkOrderToZip(workOrder.id); toast.success("Arbetsorder exporterad"); }
    catch (error: any) { toast.error(error.message || "Kunde inte exportera arbetsorder"); }
    finally { setExporting(false); }
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-green-500/10 text-green-500 border-green-500/20",
      medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      high: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    const labels: Record<string, string> = { low: "Låg", medium: "Medel", high: "Hög" };
    return <Badge className={colors[priority]}>{labels[priority]}</Badge>;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      not_started: "Ej påbörjad", awaiting_quote: "Inväntar offert",
      ordered: "Beställt", completed: "Slutförd", archived: "Arkiverad",
    };
    return labels[status] || status;
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
              {/* ========== DETAIL VIEW ========== */}
              {viewMode === "detail" && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader><CardTitle>Information</CardTitle></CardHeader>
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
                          <div className="mt-1"><Badge variant="outline">{getStatusLabel(workOrder.status)}</Badge></div>
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
                            {workOrder.due_date ? format(new Date(workOrder.due_date), "yyyy-MM-dd", { locale: sv }) : "-"}
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
                        <Label htmlFor="file-upload-detail" className="cursor-pointer">
                          <Button size="sm" disabled={uploading} asChild>
                            <span><Upload className="h-4 w-4 mr-2" />{uploading ? "Laddar upp..." : "Ladda upp fil"}</span>
                          </Button>
                        </Label>
                        <Input id="file-upload-detail" type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {files && files.length > 0 ? (
                        <div className="space-y-2">
                          {files.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{file.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : ""}{" · "}
                                    {format(new Date(file.created_at), "yyyy-MM-dd HH:mm", { locale: sv })}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="icon" onClick={() => setPreviewDocument(file)}><Eye className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => window.open(file.file_url, "_blank")}><Download className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteFile(file.id, file.file_url)}><Trash2 className="h-4 w-4" /></Button>
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
              )}

              {/* ========== EDIT VIEW ========== */}
              {viewMode === "edit" && (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField control={form.control} name="action" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Åtgärd *</FormLabel>
                        <FormControl><Input placeholder="t.ex. Byte av cirkulationspump" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="property_id" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fastighet *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Välj fastighet" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {properties?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="due_date" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Datum</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="not_started">Ej påbörjad</SelectItem>
                              <SelectItem value="awaiting_quote">Inväntar offert</SelectItem>
                              <SelectItem value="ordered">Beställt</SelectItem>
                              <SelectItem value="completed">Slutförd</SelectItem>
                              <SelectItem value="archived">Arkiverad</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="priority" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prioritet</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="low">Låg</SelectItem>
                              <SelectItem value="medium">Medel</SelectItem>
                              <SelectItem value="high">Hög</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="price" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pris (kr)</FormLabel>
                          <FormControl><Input type="number" placeholder="t.ex. 15000" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="contractor" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Entreprenör</FormLabel>
                          <FormControl><Input placeholder="t.ex. Rörmokarn AB" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="quarter" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kvartal</FormLabel>
                        <FormControl><Input placeholder="t.ex. Q3 2025" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="comments" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kommentar</FormLabel>
                        <FormControl><Textarea placeholder="Ytterligare information..." className="min-h-[100px]" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="border-t pt-4 space-y-4">
                      <h3 className="text-sm font-semibold">E-postpåminnelser</h3>
                      <FormField control={form.control} name="reminder_enabled" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Aktivera påminnelser när status är "Beställt"</FormLabel>
                            <p className="text-sm text-muted-foreground">Få regelbundna påminnelser om att följa upp</p>
                          </div>
                        </FormItem>
                      )} />
                      {form.watch("reminder_enabled") && (
                        <>
                          <FormField control={form.control} name="reminder_frequency" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Påminnelsefrekvens</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="weekly">Varje vecka</SelectItem>
                                  <SelectItem value="biweekly">Varannan vecka</SelectItem>
                                  <SelectItem value="triweekly">Var tredje vecka</SelectItem>
                                  <SelectItem value="monthly">Varje månad</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name="reminder_recipient_email" render={({ field }) => (
                            <FormItem>
                              <FormLabel>E-postadress för påminnelser</FormLabel>
                              <FormControl><Input type="email" placeholder="din.email@exempel.se" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 justify-end pt-4">
                      <Button type="button" variant="outline" onClick={handleBack}>Avbryt</Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? "Sparar..." : "Spara ändringar"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}

              {/* ========== PREVIEW VIEW ========== */}
              {viewMode === "preview" && (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {workOrder.action && <Badge variant="outline">{workOrder.action}</Badge>}
                    {workOrder.contractor && <Badge variant="secondary">{workOrder.contractor}</Badge>}
                    {workOrder.price && (
                      <Badge variant="secondary">{parseInt(workOrder.price).toLocaleString("sv-SE")} SEK</Badge>
                    )}
                    {workOrder.quarter && <Badge variant="secondary">{workOrder.quarter}</Badge>}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">Beställningstext</label>
                      <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating} className="h-7 text-xs">
                        <RefreshCw className={`mr-1 h-3 w-3 ${generating ? "animate-spin" : ""}`} />Regenerera
                      </Button>
                    </div>
                    {generating && !previewText && (
                      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Genererar text...</span>
                      </div>
                    )}
                    <Textarea
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      placeholder={generating ? "Genererar..." : "Texten visas här..."}
                      rows={18}
                      className="text-sm leading-relaxed resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-foreground">Utkastet skickas till <strong>din e-postadress</strong></span>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={handleBack}>Tillbaka</Button>
                    <Button onClick={handleSendPreview} disabled={sending || generating || !previewText.trim()}>
                      {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                      {sending ? "Skickar..." : "Skicka till min e-post"}
                    </Button>
                  </div>
                </div>
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

      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent aria-describedby="convert-description">
          <AlertDialogHeader>
            <AlertDialogTitle>Konvertera till projekt?</AlertDialogTitle>
            <AlertDialogDescription id="convert-description">
              Detta skapar ett nytt projekt baserat på denna arbetsorder. Arbetsordern arkiveras automatiskt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={converting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvertToProject} disabled={converting}>
              {converting ? "Konverterar..." : "Konvertera till projekt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
