import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateDriftTask } from "@/hooks/useDriftTasks";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { TaskTemplateSelector } from "./TaskTemplateSelector";
import { useState } from "react";

const taskFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Uppgiftsnamn krävs")
    .max(200, "Uppgiftsnamn får vara max 200 tecken"),
  description: z
    .string()
    .trim()
    .max(1000, "Beskrivning får vara max 1000 tecken")
    .optional(),
  planned_count: z
    .number()
    .int("Antal måste vara ett heltal")
    .min(0, "Antal kan inte vara negativt")
    .max(10000, "Antal får vara max 10000"),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  year: number;
  quarter: Database["public"]["Enums"]["quarter_type"];
  onSuccess: () => void;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  propertyId,
  year,
  quarter,
  onSuccess,
}: TaskFormDialogProps) {
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: "",
      description: "",
      planned_count: 0,
    },
  });

  const onSubmit = async (values: TaskFormValues) => {
    const { error } = await supabase.from("drift_tasks").insert({
      property_id: propertyId,
      year,
      quarter,
      name: values.name,
      description: values.description || null,
      planned_count: values.planned_count,
      reported_count: 0,
    });

    if (error) {
      toast.error("Kunde inte skapa uppgift");
      return;
    }

    toast.success("Uppgift skapad");
    form.reset();
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby="task-form-description">
        <DialogHeader>
          <DialogTitle>Skapa ny uppgift</DialogTitle>
          <DialogDescription id="task-form-description">
            Lägg till en ny driftuppgift för {quarter} {year}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <TaskTemplateSelector
              propertyId={propertyId}
              onSelectTemplate={(template) => {
                form.setValue("name", template.name);
                form.setValue("description", template.description || "");
                form.setValue("planned_count", template.planned_count);
              }}
              onOpenLibrary={() => setTemplateLibraryOpen(true)}
            />
            
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Uppgiftsnamn *</FormLabel>
                  <FormControl>
                    <Input placeholder="T.ex. OVK-besiktning" {...field} />
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
                      placeholder="Frivillig beskrivning av uppgiften..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Max 1000 tecken
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="planned_count"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Antal planerade enheter</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="10000"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value) || 0)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Detta uppdateras automatiskt när du lägger till objekt
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  onOpenChange(false);
                }}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Skapa uppgift
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
