import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { useEffect } from "react";

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
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

interface WorkOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: any;
  onSuccess: () => void;
  propertyId?: string;
}

export function WorkOrderDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
  propertyId,
}: WorkOrderDialogProps) {
  const form = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      action: "",
      property_id: propertyId || "",
      status: "not_started",
      priority: "medium",
      price: "",
      contractor: "",
      quarter: "",
      comments: "",
      due_date: "",
    },
  });

  const { data: properties } = useQuery({
    queryKey: ["properties-for-work-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (order) {
      form.reset({
        action: order.action || "",
        property_id: order.property_id || "",
        status: order.status || "not_started",
        priority: order.priority || "medium",
        price: order.price?.toString() || "",
        contractor: order.contractor || "",
        quarter: order.quarter || "",
        comments: order.comments || "",
        due_date: order.due_date || "",
      });
    } else if (propertyId) {
      form.reset({
        action: "",
        property_id: propertyId,
        status: "not_started",
        priority: "medium",
        price: "",
        contractor: "",
        quarter: "",
        comments: "",
        due_date: "",
      });
    }
  }, [order, propertyId, form]);

  const onSubmit = async (data: WorkOrderFormData) => {
    const payload = {
      action: data.action,
      property_id: data.property_id,
      status: data.status,
      priority: data.priority,
      price: data.price ? parseFloat(data.price) : null,
      contractor: data.contractor || null,
      quarter: data.quarter || null,
      comments: data.comments || null,
      due_date: data.due_date || null,
    };

    if (order) {
      const { error } = await supabase
        .from("work_orders")
        .update(payload)
        .eq("id", order.id);

      if (error) {
        toast.error("Kunde inte uppdatera arbetsorder");
        return;
      }
      toast.success("Arbetsorder uppdaterad");
    } else {
      const { error } = await supabase.from("work_orders").insert([payload]);

      if (error) {
        toast.error("Kunde inte skapa arbetsorder");
        return;
      }
      toast.success("Arbetsorder skapad");
    }

    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {order ? "Redigera Arbetsorder" : "Ny Arbetsorder"}
          </DialogTitle>
          <DialogDescription>
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
                      onValueChange={field.onChange}
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
              <Button type="submit">
                {order ? "Uppdatera Arbetsorder" : "Skapa Arbetsorder"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
