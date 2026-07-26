import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useProperties } from '@/hooks/useProperties';
import { useCreateScheduledReport } from '@/hooks/useScheduledReports';

interface ScheduledReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ScheduledReportDialog = ({ open, onOpenChange }: ScheduledReportDialogProps) => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { data: properties = [] } = useProperties();
  const createReport = useCreateScheduledReport();

  const [name, setName] = useState('');
  const [reportType, setReportType] = useState('maintenance-overview');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [schedule, setSchedule] = useState('weekly');
  const [recipients, setRecipients] = useState('');

  useEffect(() => {
    if (open && properties.length > 0 && !selectedProperty) {
      setSelectedProperty(properties[0].id);
    }
  }, [open, properties, selectedProperty]);

  const handleCreate = async () => {
    if (!user || !organization) {
      toast.error('Du måste vara inloggad');
      return;
    }

    const cronSchedule =
      schedule === 'daily' ? '0 8 * * *' : schedule === 'weekly' ? '0 8 * * 1' : '0 8 1 * *';

    try {
      await createReport.mutateAsync({
        name,
        report_type: reportType,
        config: { property_id: selectedProperty },
        schedule: cronSchedule,
        recipients: recipients.split(',').map((e) => e.trim()),
        organization_id: organization.id,
        created_by: user.id,
        next_run: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      } as never);
      toast.success('Schemalagd rapport skapad!');
      onOpenChange(false);
      setName('');
      setRecipients('');
    } catch {
      toast.error('Kunde inte skapa rapporten');
    }
  };

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
            onClick={handleCreate}
            disabled={createReport.isPending || !name || !recipients}
          >
            {createReport.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Skapa rapport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
