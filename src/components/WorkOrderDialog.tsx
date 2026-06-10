import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useComponents } from "@/hooks/useComponents";
import { useProperties } from "@/hooks/useProperties";
import { useCreateWorkOrder, useUpdateWorkOrder } from "@/hooks/useWorkOrders";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";

const workOrderSchema = z.object({
  action: z.string().min(1, "Åtgärd krävs").max(200, "Max 200 tecken"),
  property_id: z.string().min(1, "Fastighet krävs"),
  component_id: z.string().optional(),
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

interface WorkOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: import("@/types/domain/workOrder").WorkOrder | null;
  onSuccess: () => void;
  propertyId?: string;
  projectId?: string;
}


export function WorkOrderDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
  propertyId,
  projectId,
}: WorkOrderDialogProps) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      action: "",
      property_id: propertyId || "",
      component_id: "",
      status: "not_started",
      priority: "medium",
      price: "",
      contractor: "",
      quarter: "",
      comments: "",
      due_date: "",
      reminder_enabled: false,
      reminder_frequency: "weekly",
      reminder_recipient_email: user?.email || "",
    },
  });

  const watchedPropertyId = form.watch("property_id");

  const { data: componentsForProperty } = useComponents({ propertyId: watchedPropertyId });
  const { data: properties } = useProperties();

  const createWorkOrder = useCreateWorkOrder();
  const updateWorkOrder = useUpdateWorkOrder();


  useEffect(() => {
    if (order) {
      form.reset({
        action: order.action || "",
        property_id: order.property_id || "",
        component_id: order.component_id || "",
        status: order.status || "not_started",
        priority: order.priority || "medium",
        price: order.price?.toString() || "",
        contractor: order.contractor || "",
        quarter: order.quarter || "",
        comments: order.comments || "",
        due_date: order.due_date || "",
        reminder_enabled: order.reminder_enabled || false,
        reminder_frequency: order.reminder_frequency || "weekly",
        reminder_recipient_email: order.reminder_recipient_email || user?.email || "",
      });
    } else if (propertyId) {
      form.reset({
        action: "",
        property_id: propertyId,
        component_id: "",
        status: "not_started",
        priority: "medium",
        price: "",
        contractor: "",
        quarter: "",
        comments: "",
        due_date: "",
        reminder_enabled: false,
        reminder_frequency: "weekly",
        reminder_recipient_email: user?.email || "",
      });
    }
  }, [order, propertyId, form, user?.email]);

  const onSubmit = async (data: WorkOrderFormData) => {
    if (!user) {
      toast.error("Du måste vara inloggad för att skapa en arbetsorder");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        action: data.action,
        property_id: data.property_id,
        component_id: data.component_id || null,
        status: data.status,
        priority: data.priority,
        price: data.price ? parseFloat(data.price) : null,
        contractor: data.contractor || null,
        quarter: data.quarter || null,
        comments: data.comments || null,
        due_date: data.due_date || null,
        reminder_enabled: data.reminder_enabled,
        reminder_frequency: data.reminder_frequency,
        reminder_recipient_email: data.reminder_recipient_email || null,
      };

      const handleDbError = (actionLabel: string, err: any) => {
        console.error(`${actionLabel} error:`, err, { payload });
        const msg = String(err?.message || "");
        if (msg.toLowerCase().includes("row-level security") || err?.code === "42501") {
          toast.error("Du saknar behörighet för vald fastighet");
          return;
        }
        toast.error(`${actionLabel} misslyckades: ${msg || "Okänt fel"}`);
      };

      try {
        if (order) {
          await updateWorkOrder.mutateAsync({
            id: order.id,
            patch: { ...payload, project_id: projectId || order.project_id || null } as any,
          });
        } else {
          await createWorkOrder.mutateAsync({ ...payload, project_id: projectId || null } as any);
        }
      } catch (err: any) {
        handleDbError(order ? "Uppdatering" : "Skapande", err);
        return;
      }

      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Unexpected error:", error);
      toast.error("Ett oväntat fel uppstod");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="work-order-description">
        <DialogHeader>
          <DialogTitle>
            {order ? "Redigera Arbetsorder" : "Ny Arbetsorder"}
          </DialogTitle>
          <DialogDescription id="work-order-description">
            Skapa en ny arbetsorder för underhåll eller reparation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="action"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Åtgärd *</FormLabel>
                  <FormControl>
                    <Input placeholder="t.ex. Byte av cirkulationspump" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="property_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fastighet *</FormLabel>
                    <Select
                      onValueChange={(val) => {
                        field.onChange(val);
                        form.setValue("component_id", "");
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Välj fastighet" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {properties?.map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.name}
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
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Datum</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {watchedPropertyId && componentsForProperty && componentsForProperty.length > 0 && (
              <FormField
                control={form.control}
                name="component_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Komponent (valfritt)</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Välj komponent" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Ingen komponent</SelectItem>
                        {componentsForProperty.map((comp) => (
                          <SelectItem key={comp.id} value={comp.id}>
                            {comp.name} ({comp.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
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
                        <SelectItem value="not_started">Ej påbörjad</SelectItem>
                        <SelectItem value="awaiting_quote">Inväntar offert</SelectItem>
                        <SelectItem value="ordered">Beställt</SelectItem>
                        <SelectItem value="completed">Slutförd</SelectItem>
                        <SelectItem value="archived">Arkiverad</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioritet</FormLabel>
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
                        <SelectItem value="low">Låg</SelectItem>
                        <SelectItem value="medium">Medel</SelectItem>
                        <SelectItem value="high">Hög</SelectItem>
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
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pris (kr)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="t.ex. 15000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contractor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entreprenör</FormLabel>
                    <FormControl>
                      <Input placeholder="t.ex. Rörmokarn AB" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="quarter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kvartal</FormLabel>
                  <FormControl>
                    <Input placeholder="t.ex. Q3 2025" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kommentar</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ytterligare information om arbetsordern..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">E-postpåminnelser</h3>
              
              <FormField
                control={form.control}
                name="reminder_enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Aktivera påminnelser när status är "Beställt"
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Få regelbundna påminnelser om att följa upp arbetsorderns status
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch("reminder_enabled") && (
                <>
                  <FormField
                    control={form.control}
                    name="reminder_frequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Påminnelsefrekvens</FormLabel>
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
                            <SelectItem value="weekly">Varje vecka</SelectItem>
                            <SelectItem value="biweekly">Varannan vecka</SelectItem>
                            <SelectItem value="triweekly">Var tredje vecka</SelectItem>
                            <SelectItem value="monthly">Varje månad</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="reminder_recipient_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-postadress för påminnelser</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="din.email@exempel.se"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>

            <Alert className="bg-blue-500/10 border-blue-500/20">
              <Info className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-500">
                Tips: Du kan ladda upp filer (offerter, beställningar, foton) efter att
                arbetsordern har skapats.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Sparar…"
                  : order
                    ? "Uppdatera Arbetsorder"
                    : "Skapa Arbetsorder"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
