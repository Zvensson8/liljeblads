import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

const projectSchema = z.object({
  property_id: z.string().min(1, "Fastighet krävs"),
  project_number: z.string().min(1, "Projektnummer krävs"),
  name: z.string().min(1, "Projektnamn krävs").max(200),
  description: z.string().optional(),
  type: z.enum(["investering", "underhall", "energi", "annat"]),
  status: z.enum(["planerat", "invantar_offert", "offert_finns", "pagaende", "pausat"]),
  project_manager: z.string().optional(),
  start_date: z.date().optional(),
  end_date: z.date().optional(),
  budget: z.number().min(0, "Budget måste vara positiv"),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: string;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  onSuccess,
  projectId,
}: ProjectFormDialogProps) {
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

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
      budget: 0,
    },
  });

  useEffect(() => {
    if (open) {
      fetchProperties();
      // Don't auto-generate project number on open, wait for property selection
    }
  }, [open, projectId]);

  const fetchProperties = async () => {
    const { data } = await supabase
      .from("properties")
      .select("id, name, property_number")
      .order("name");
    setProperties(data || []);
  };

  const generateProjectNumber = async (propertyId: string, projectType: "investering" | "underhall" | "energi" | "annat") => {
    // Get property to fetch its property_number
    const { data: property } = await supabase
      .from("properties")
      .select("property_number")
      .eq("id", propertyId)
      .single();

    if (!property?.property_number) {
      toast.error("Fastigheten saknar fastighetsnummer");
      return;
    }

    // Use + for underhåll (maintenance), - for investering (investment)
    const suffix = projectType === "underhall" ? "+" : "-";
    
    // Count existing projects for this property and type
    const { count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("type", projectType);
    
    const nextNumber = (count || 0) + 1;
    const projectNumber = `${property.property_number}${suffix}${nextNumber.toString().padStart(2, "0")}`;
    form.setValue("project_number", projectNumber);
  };

  const onSubmit = async (values: ProjectFormValues) => {
    setLoading(true);
    try {
      const projectData: any = {
        ...values,
        start_date: values.start_date?.toISOString().split("T")[0] || null,
        end_date: values.end_date?.toISOString().split("T")[0] || null,
        forecast: values.budget,
      };

      const { data: project, error } = await supabase
        .from("projects")
        .insert([projectData])
        .select()
        .single();

      if (error) throw error;

      // Load checklist templates for the project type
      const { data: templates } = await supabase
        .from("project_checklist_templates")
        .select("items")
        .eq("project_type", values.type)
        .single();

      if (templates?.items) {
        const checklistItems = (templates.items as any[]).map((item) => ({
          project_id: project.id,
          title: item.title,
          description: item.description,
          order_index: item.order,
        }));

        await supabase.from("project_checklist_items").insert(checklistItems);
      }

      // Log activity
      await supabase.from("project_activity_log").insert({
        project_id: project.id,
        activity_type: "status_change",
        description: "Projekt skapat",
      });

      toast.success("Projekt skapat");
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Kunde inte skapa projekt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skapa nytt projekt</DialogTitle>
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
                      // Generate project number when property and type are selected
                      const currentType = form.getValues("type");
                      if (value && currentType) {
                        generateProjectNumber(value, currentType);
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="project_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Projektnummer *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="2025-0001" />
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
                      onValueChange={(value: "investering" | "underhall" | "energi" | "annat") => {
                        field.onChange(value);
                        // Generate project number when property and type are selected
                        const currentProperty = form.getValues("property_id");
                        if (value && currentProperty) {
                          generateProjectNumber(currentProperty, value);
                        }
                      }} 
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
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Startdatum</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: sv })
                            ) : (
                              <span>Välj datum</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={sv}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Slutdatum</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: sv })
                            ) : (
                              <span>Välj datum</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={sv}
                        />
                      </PopoverContent>
                    </Popover>
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
                disabled={loading}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Skapa projekt
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
