import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Property {
  id: string;
  name: string;
}

interface ScheduledReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ScheduledReportDialog = ({ open, onOpenChange }: ScheduledReportDialogProps) => {
  const queryClient = useQueryClient();
  const [properties, setProperties] = useState<Property[]>([]);
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState('maintenance-overview');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [schedule, setSchedule] = useState('weekly');
  const [recipients, setRecipients] = useState('');

  useEffect(() => {
    if (open) {
      fetchProperties();
    }
  }, [open]);

  const fetchProperties = async () => {
    const { data } = await supabase
      .from('properties')
      .select('id, name')
      .order('name');

    if (data) {
      setProperties(data);
      if (data.length > 0) {
        setSelectedProperty(data[0].id);
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      const cronSchedule = schedule === 'daily' ? '0 8 * * *' 
        : schedule === 'weekly' ? '0 8 * * 1'
        : '0 8 1 * *'; // monthly

      const { error } = await supabase.from('scheduled_reports').insert({
        name,
        report_type: reportType,
        config: { property_id: selectedProperty },
        schedule: cronSchedule,
        recipients: recipients.split(',').map(e => e.trim()),
        organization_id: profile?.organization_id,
        created_by: user.id,
        next_run: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Schemalagd rapport skapad!');
      onOpenChange(false);
      // Reset form
      setName('');
      setRecipients('');
    },
    onError: () => {
      toast.error('Kunde inte skapa rapporten');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Skapa schemalagd rapport</DialogTitle>
          <DialogDescription>
            Automatisera rapportgenerering och få dem via email
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Namn på rapport</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="t.ex. Månatlig underhållsrapport"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-type">Rapporttyp</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maintenance-overview">Underhållsöversikt</SelectItem>
                <SelectItem value="workorder-summary">Arbetsorder-sammanfattning</SelectItem>
                <SelectItem value="budget-analysis">Budget-analys</SelectItem>
                <SelectItem value="cost-trends">Kostnadstrender</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="property">Fastighet</Label>
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger id="property">
                <SelectValue placeholder="Välj fastighet" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule">Frekvens</Label>
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger id="schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Dagligen</SelectItem>
                <SelectItem value="weekly">Veckovis (måndagar)</SelectItem>
                <SelectItem value="monthly">Månadsvis (första dagen)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipients">Mottagare (email)</Label>
            <Input
              id="recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="email@example.com, email2@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Separera flera email-adresser med komma
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name || !recipients}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Skapa rapport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
