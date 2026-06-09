import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUpdateProperty } from "@/hooks/useProperties";
import { FileText } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { useEffect } from "react";

const propertySchema = z.object({
  name: z.string().min(1, "Namn krävs").max(200, "Max 200 tecken"),
  property_number: z.string().max(50, "Max 50 tecken").optional(),
  address: z.string().max(300, "Max 300 tecken").optional(),
  area_sqm: z.string().optional(),
  construction_year: z.string().optional(),
  property_type: z.string().max(100, "Max 100 tecken").optional(),
  loa: z.string().max(100, "Max 100 tecken").optional(),
  invoice_address: z.string().max(500, "Max 500 tecken").optional(),
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
  const updateProperty = useUpdateProperty();
  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      property_number: "",
      address: "",
      area_sqm: "",
      construction_year: "",
      property_type: "",
      loa: "",
      invoice_address: "",
    },
  });

  useEffect(() => {
    if (property) {
      form.reset({
        name: property.name || "",
        property_number: property.property_number || "",
        address: property.address || "",
        area_sqm: property.area_sqm?.toString() || "",
        construction_year: property.construction_year?.toString() || "",
        property_type: property.property_type || "",
        loa: property.loa || "",
        invoice_address: property.invoice_address || "",
      });
    }
  }, [property, form]);

  const onSubmit = async (data: PropertyFormData) => {
    const payload = {
      name: data.name,
      property_number: data.property_number || null,
      address: data.address || null,
      area_sqm: data.area_sqm ? parseFloat(data.area_sqm) : null,
      construction_year: data.construction_year ? parseInt(data.construction_year) : null,
      property_type: data.property_type || null,
      loa: data.loa || null,
      invoice_address: data.invoice_address || null,
    };

    try {
      await updateProperty.mutateAsync({ id: property.id, patch: payload as any });
      onSuccess();
    } catch {
      // toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby="edit-property-description">
        <DialogHeader>
          <DialogTitle>Redigera Fastighet</DialogTitle>
          <DialogDescription id="edit-property-description" className="sr-only">
            Formulär för att redigera fastighetsinformation
          </DialogDescription>
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
              name="property_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fastighetsnummer</FormLabel>
                  <FormControl>
                    <Input placeholder="t.ex. Vägen 13" {...field} />
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="area_sqm"
                render={({ field }) => (
                <FormItem>
                  <FormLabel>Tomtarea (m²)</FormLabel>
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
                name="construction_year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Byggår</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="t.ex. 1985"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="property_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ</FormLabel>
                    <FormControl>
                      <Input placeholder="t.ex. Hyresrätt, Kontor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="loa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LOA</FormLabel>
                    <FormControl>
                      <Input placeholder="LOA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Fakturainformation</h3>
              </div>
              
              <FormField
                control={form.control}
                name="invoice_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fakturaadress</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Bolagsnamn&#10;Organisationsnummer&#10;Postnummer/Box&#10;Postort"
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
