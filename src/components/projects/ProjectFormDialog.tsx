import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useSendProjectOrderDraft } from "@/hooks/useEdgeFunctions";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useProjectTemplates } from "@/hooks/useProjectTemplates";
import { useOrganization } from "@/hooks/useOrganization";
import { useProperties } from "@/hooks/useProperties";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfiles";
import { useCreateProject, useUpdateProject } from "@/hooks/useProjects";
import { useLogProjectActivity } from "@/hooks/useProjectActivityLog";

const projectSchema = z.object({
  property_id: z.string().min(1, "Fastighet krävs"),
  project_number: z.string().min(1, "Projektnummer krävs"),
  name: z.string().min(1, "Projektnamn krävs").max(200),
  description: z.string().optional(),
  type: z.enum(["investering", "underhall", "energi", "annat"]),
  status: z.enum(["planerat", "invantar_offert", "offert_finns", "pagaende", "pausat", "avslutat"]),
  project_manager: z.string().optional(),
  year: z.number().min(2020, "År måste vara minst 2020").max(2050, "År måste vara max 2050"),
  start_quarter: z.number().min(1).max(4),
  budget: z.number().min(0, "Budget måste vara positiv"),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingProject?: any;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  onSuccess,
  editingProject,
}: ProjectFormDialogProps) {
  
  const [loading, setLoading] = useState(false);
  const [showOrderDraftOption, setShowOrderDraftOption] = useState(false);
  const [sendingDraft, setSendingDraft] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { organization } = useOrganization();
  const { templates } = useProjectTemplates(organization?.id);
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const userName = profile?.full_name ?? "";
  const { data: propertiesData = [] } = useProperties();
  const properties = (propertiesData as any[])
    .map((p) => ({ id: p.id, name: p.name, property_number: p.property_number }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "sv"));

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const logActivity = useLogProjectActivity();
  const sendProjectOrderDraft = useSendProjectOrderDraft();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      property_id: "",
      project_number: "",
      name: "",
      description: "",
      type: "investering",
      status: "planerat",
      project_manager: "",
      year: new Date().getFullYear(),
      start_quarter: 1,
      budget: 0,
    },
  });

  useEffect(() => {
    if (open) {
      if (editingProject) {
        form.reset({
          property_id: editingProject.property_id,
          project_number: editingProject.project_number,
          name: editingProject.name,
          description: editingProject.description || '',
          type: editingProject.type,
          status: editingProject.status,
          project_manager: editingProject.project_manager || '',
          year: editingProject.year || new Date().getFullYear(),
          start_quarter: editingProject.start_quarter || 1,
          budget: editingProject.budget,
        });
      } else {
        form.setValue("project_manager", userName);
      }
    }
  }, [open, editingProject, userName]);

  const setPropertyNumber = (propertyId: string) => {
    const property = properties.find((p) => p.id === propertyId);
    if (property?.property_number) {
      form.setValue("project_number", property.property_number);
    }
  };

  const onSubmit = async (values: ProjectFormValues) => {
    setLoading(true);
    try {
      const projectData: any = {
        ...values,
        forecast: values.budget,
      };

      if (editingProject) {
        await updateProject.mutateAsync({ id: editingProject.id, patch: projectData });

        // Log the update with detailed changes
        const changes: string[] = [];
        if (values.name !== editingProject.name) {
          changes.push(`Namn ändrat från "${editingProject.name}" till "${values.name}"`);
        }
        if (values.description !== editingProject.description) {
          if (!editingProject.description && values.description) {
            changes.push(`Beskrivning tillagd: "${values.description.substring(0, 50)}${values.description.length > 50 ? '...' : ''}"`);
          } else if (editingProject.description && !values.description) {
            changes.push(`Beskrivning borttagen`);
          } else {
            changes.push(`Beskrivning uppdaterad`);
          }
        }
        if (values.type !== editingProject.type) {
          const typeLabels: Record<string, string> = {
            investering: "Investering",
            underhall: "Underhåll",
            energi: "Energi",
            annat: "Annat",
          };
          changes.push(`Typ ändrad från ${typeLabels[editingProject.type]} till ${typeLabels[values.type]}`);
        }
        if (values.status !== editingProject.status) {
          const statusLabels: Record<string, string> = {
            planerat: "Planerat",
            invantar_offert: "Inväntar offert",
            offert_finns: "Offert finns",
            pagaende: "Pågående",
            pausat: "Pausat",
            avslutat: "Avslutat",
          };
          changes.push(`Status ändrad från ${statusLabels[editingProject.status]} till ${statusLabels[values.status]}`);
        }
        if (values.project_manager !== editingProject.project_manager) {
          if (values.project_manager && !editingProject.project_manager) {
            changes.push(`Projektledare tillagd: ${values.project_manager}`);
          } else if (!values.project_manager && editingProject.project_manager) {
            changes.push(`Projektledare borttagen (tidigare: ${editingProject.project_manager})`);
          } else {
            changes.push(`Projektledare ändrad från ${editingProject.project_manager} till ${values.project_manager}`);
          }
        }
        if (values.budget !== editingProject.budget) {
          changes.push(`Budget ändrad från ${editingProject.budget.toLocaleString("sv-SE")} kr till ${values.budget.toLocaleString("sv-SE")} kr`);
        }
        if (values.year !== editingProject.year) {
          changes.push(`År ändrat från ${editingProject.year} till ${values.year}`);
        }
        if (values.start_quarter !== editingProject.start_quarter) {
          changes.push(`Startkvartal ändrat från Q${editingProject.start_quarter} till Q${values.start_quarter}`);
        }

        if (changes.length > 0) {
          await logActivity.mutateAsync({
            project_id: editingProject.id,
            activity_type: "status_change",
            description: `Projekt uppdaterat: ${changes.join(", ")}`,
          });
        }

        toast.success("Projekt uppdaterat");
      } else {
        const project = await createProject.mutateAsync(projectData);

        // Om mall användes, kopiera checklist items
        if (selectedTemplateId) {
          const template = templates.find((t) => t.id === selectedTemplateId);
          if (template?.checklist_items && template.checklist_items.length > 0) {
            const checklistItems = template.checklist_items.map((item: any, index: number) => ({
              project_id: project.id,
              title: item.title,
              description: item.description || null,
              completed: false,
              order_index: index,
              deadline: null,
              responsible: null,
            }));

            const { error: checklistError } = await supabase
              .from("project_checklist_items")
              .insert(checklistItems);

            if (checklistError) {
              console.error("Kunde inte kopiera checklista:", checklistError);
              toast.error("Projekt skapat men checklista kunde inte kopieras");
            }
          }
        }

        await logActivity.mutateAsync({
          project_id: project.id,
          activity_type: "status_change",
          description: "Projekt skapat",
        });

        toast.success("Projekt skapat");

        setCreatedProjectId(project.id);
        setShowOrderDraftOption(true);
        return;
      }

      // Vid uppdatering, stäng direkt
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || editingProject ? "Kunde inte uppdatera projekt" : "Kunde inte skapa projekt");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOrderDraft = async () => {
    if (!createdProjectId) return;
    
    setSendingDraft(true);
    try {
      if (!user?.email) {
        throw new Error("Kunde inte hämta användarens e-post");
      }

      await sendProjectOrderDraft.mutateAsync({
        projectId: createdProjectId,
        userEmail: user.email,
      });

      toast.success("Beställningsutkast skickat till din e-post");
      setShowOrderDraftOption(false);
      setCreatedProjectId(null);
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Kunde inte skicka beställningsutkast");
    } finally {
      setSendingDraft(false);
    }
  };

  const handleSkipDraft = () => {
    setShowOrderDraftOption(false);
    setCreatedProjectId(null);
    form.reset();
    onOpenChange(false);
    onSuccess();
  };

  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    
    const template = templates.find(t => t.id === templateId);
    if (template) {
      form.setValue("name", template.name);
      form.setValue("description", template.description || "");
      form.setValue("type", template.type as any);
      toast.success(`Mall "${template.name}" tillagd`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingProject ? 'Redigera projekt' : 'Skapa nytt projekt'}</DialogTitle>
          <DialogDescription>
            Fyll i projektinformation. Projektnumret sätts automatiskt till fastighetsnumret men kan redigeras manuellt.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="property_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fastighet *</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Set project number to property number
                      if (value) {
                        setPropertyNumber(value);
                      }
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Välj fastighet" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {properties.map((prop) => (
                        <SelectItem key={prop.id} value={prop.id}>
                          {prop.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!editingProject && templates.length > 0 && (
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <Label>Använd projektmall (valfritt)</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj en mall för att förifyll fält" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplateId && (
                  <p className="text-xs text-muted-foreground">
                    Mallen har fyllt i projektnamn, beskrivning, typ och budget. Du kan ändra dessa efter behov.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="project_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Projektnummer *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ange projektnummer" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project_manager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Projektledare</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Namn på projektledare" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Projektnamn *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="T.ex. Fasadrenovering..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beskrivning</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Beskriv projektet..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="investering">Investering</SelectItem>
                        <SelectItem value="underhall">Underhåll</SelectItem>
                        <SelectItem value="energi">Energi</SelectItem>
                        <SelectItem value="annat">Annat</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="planerat">Planerat</SelectItem>
                        <SelectItem value="invantar_offert">Inväntar offert</SelectItem>
                        <SelectItem value="offert_finns">Offert finns</SelectItem>
                        <SelectItem value="pagaende">Pågående</SelectItem>
                        <SelectItem value="pausat">Pausat</SelectItem>
                        <SelectItem value="avslutat">Avslutat</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>År *</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Välj år" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => 2020 + i).map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="start_quarter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Startkvartal *</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Q1" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">Q1</SelectItem>
                        <SelectItem value="2">Q2</SelectItem>
                        <SelectItem value="3">Q3</SelectItem>
                        <SelectItem value="4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget (kr) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading || showOrderDraftOption}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={loading || showOrderDraftOption}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingProject ? 'Uppdatera projekt' : 'Skapa projekt'}
              </Button>
            </DialogFooter>
          </form>
        </Form>

        {showOrderDraftOption && (
          <div className="px-6 pb-6">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertTitle>Vill du skicka ett beställningsutkast?</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-sm">Ett e-postutkast med all projektinformation skickas till dig som du kan redigera och vidarebefodra.</p>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSendOrderDraft} 
                    disabled={sendingDraft}
                    size="sm"
                    type="button"
                  >
                    {sendingDraft ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Skickar...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Skicka beställningsutkast
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleSkipDraft}
                    size="sm"
                    type="button"
                    disabled={sendingDraft}
                  >
                    Hoppa över
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
