import { useState } from 'react';
import { getErrorMessage } from "@/lib/utils";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const proposalSchema = z.object({
  property_id: z.string().min(1, 'Fastighet krävs'),
  name: z.string().min(1, 'Projektnamn krävs').max(200),
  description: z.string().optional(),
  type: z.enum(['investering', 'underhall', 'energi', 'annat']),
  budget: z.number().min(0, 'Budget måste vara positiv').optional(),
  reasoning: z.string().optional(),
});

type ProposalFormValues = z.infer<typeof proposalSchema>;

interface ManualProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ManualProposalDialog({
  open,
  onOpenChange,
  onSuccess,
}: ManualProposalDialogProps) {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [loading, setLoading] = useState(false);

  const { data: properties = [] } = useQuery({
    queryKey: ['properties-for-proposal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const form = useForm<ProposalFormValues>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      property_id: '',
      name: '',
      description: '',
      type: 'investering',
      budget: undefined,
      reasoning: '',
    },
  });

  const onSubmit = async (values: ProposalFormValues) => {
    if (!organization?.id) {
      toast.error('Ingen organisation vald');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: values.name,
        description: values.description,
        type: values.type,
        budget: values.budget,
        property_id: values.property_id,
        status: 'forslag',
      };

      const { error } = await supabase
        .from('ai_suggested_actions')
        .insert({
          organization_id: organization.id,
          action_type: 'create_project',
          payload,
          confidence_score: 1, // Manual = 100% confidence
          reasoning: values.reasoning || 'Manuellt skapat projektförslag',
          status: 'pending',
        });

      if (error) throw error;

      toast.success('Projektförslag tillagt');
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      console.error('Error creating proposal:', error);
      toast.error(getErrorMessage(error) || 'Kunde inte skapa projektförslag');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lägg till projektförslag</DialogTitle>
          <DialogDescription>
            Skapa ett manuellt projektförslag som du senare kan godkänna och omvandla till ett riktigt projekt.
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
                  <Select onValueChange={field.onChange} value={field.value}>
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

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Projektnamn *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="T.ex. Byte av värmepump" />
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
                      placeholder="Beskriv projektet och varför det behövs..."
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Uppskattad budget (SEK)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reasoning"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivering</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Varför föreslås detta projekt? (visas som tips vid granskning)"
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Lägg till förslag
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
