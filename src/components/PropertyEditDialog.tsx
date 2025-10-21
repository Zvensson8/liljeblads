import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import { useEffect } from "react";

const propertySchema = z.object({
  name: z.string().min(1, "Namn krävs").max(200, "Max 200 tecken"),
  address: z.string().max(300, "Max 300 tecken").optional(),
  area_sqm: z.string().optional(),
  description: z.string().max(1000, "Max 1000 tecken").optional(),
});

type PropertyFormData = z.infer<typeof propertySchema>;

interface PropertyEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: any;
  onSuccess: () => void;
}

export function PropertyEditDialog({
  open,
  onOpenChange,
  property,
  onSuccess,
}: PropertyEditDialogProps) {
  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      address: "",
      area_sqm: "",
      description: "",
    },
  });

  useEffect(() => {
    if (property) {
      form.reset({
        name: property.name || "",
        address: property.address || "",
        area_sqm: property.area_sqm?.toString() || "",
        description: property.description || "",
      });
    }
  }, [property, form]);

  const onSubmit = async (data: PropertyFormData) => {
    const payload = {
      name: data.name,
      address: data.address || null,
      area_sqm: data.area_sqm ? parseFloat(data.area_sqm) : null,
      description: data.description || null,
    };

    const { error } = await supabase
      .from("properties")
      .update(payload)
      .eq("id", property.id);

    if (error) {
      toast.error("Kunde inte uppdatera fastighet");
      return;
    }
    
    toast.success("Fastighet uppdaterad");
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Redigera Fastighet</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Namn *</FormLabel>
                  <FormControl>
                    <Input placeholder="Fastighetsnamn" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adress</FormLabel>
                  <FormControl>
                    <Input placeholder="Gatuadress, postnummer, stad" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="area_sqm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Area (m²)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="t.ex. 5000"
                      {...field}
                    />
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
                      placeholder="Ytterligare information om fastigheten..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Avbryt
              </Button>
              <Button type="submit">
                Spara Ändringar
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
