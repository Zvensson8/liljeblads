import { UseFormReturn } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { WorkOrderFormData } from "@/lib/workOrderFormSchema";

export interface WorkOrderEditFormProps {
  form: UseFormReturn<WorkOrderFormData>;
  properties: { id: string; name: string }[];
  componentsForProperty: { id: string; name: string; type: string }[];
  watchedPropertyId: string;
  submitting: boolean;
  onSubmit: (data: WorkOrderFormData) => void;
  onCancel: () => void;
}

export function WorkOrderEditForm({
  form,
  properties,
  componentsForProperty,
  watchedPropertyId,
  submitting,
  onSubmit,
  onCancel,
}: WorkOrderEditFormProps) {
  return (
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
                    {properties?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
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

        {watchedPropertyId && componentsForProperty.length > 0 && (
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
                <Select onValueChange={field.onChange} value={field.value}>
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
                <Select onValueChange={field.onChange} value={field.value}>
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
                  <Input type="number" placeholder="t.ex. 15000" {...field} />
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
                  placeholder="Ytterligare information..."
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
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Aktivera påminnelser när status är &quot;Beställt&quot;</FormLabel>
                  <p className="text-sm text-muted-foreground">
                    Få regelbundna påminnelser om att följa upp
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                      <Input type="email" placeholder="din.email@exempel.se" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Avbryt
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Sparar..." : "Spara ändringar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
