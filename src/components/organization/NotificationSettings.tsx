import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { FileText, TrendingUp, Bell, CalendarCheck, Eye, Loader2 } from 'lucide-react';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { ReportPreviewDialog } from './ReportPreviewDialog';
import { ReportType } from '@/types/notifications';

export function NotificationSettings() {
  const { preferences, loading, updatePreference, markAsPreviewed } = useNotificationPreferences();
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewReportType, setPreviewReportType] = useState<ReportType | null>(null);

  const handlePreview = (reportType: ReportType) => {
    setPreviewReportType(reportType);
    setPreviewDialogOpen(true);
  };

  const handleMarkAsPreviewed = (reportType: ReportType) => {
    markAsPreviewed(reportType);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!preferences) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Kunde inte ladda inställningar</p>
        </CardContent>
      </Card>
    );
  }

  const reportConfigs = [
    {
      type: 'project_summary' as ReportType,
      icon: FileText,
      title: 'Månatlig projektsammanfattning',
      description: 'Översikt av alla pågående projekt, budget vs utfall, och milstolpar',
      enabled: preferences.monthly_project_summary,
      previewed: preferences.project_summary_previewed,
      frequency: 'Första måndagen varje månad'
    },
    {
      type: 'workorder_summary' as ReportType,
      icon: TrendingUp,
      title: 'Månatlig arbetsorderrapport',
      description: 'Status på arbetsordrar, försenade ordrar och kostnadsuppföljning',
      enabled: preferences.monthly_workorder_summary,
      previewed: preferences.workorder_summary_previewed,
      frequency: 'Första måndagen varje månad'
    },
    {
      type: 'maintenance_reminders' as ReportType,
      icon: Bell,
      title: 'Veckovisa underhållspåminnelser',
      description: 'Komponenter med kommande underhåll och utgående garantier',
      enabled: preferences.maintenance_reminders,
      previewed: preferences.maintenance_reminders_previewed,
      frequency: 'Varje måndag'
    },
    {
      type: 'maintenance_history' as ReportType,
      icon: CalendarCheck,
      title: 'Årlig underhållshistorik',
      description: 'Sammanfattning av föregående års underhåll med kostnadsanalys',
      enabled: preferences.maintenance_history_annual,
      previewed: preferences.maintenance_history_previewed,
      frequency: '1 januari varje år'
    }
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>E-postrapporter & Påminnelser</CardTitle>
          <CardDescription>
            Välj vilka automatiska rapporter du vill ta emot. Du måste förhandsgranska
            varje rapport innan den aktiveras för automatisk sändning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {reportConfigs.map((config) => {
            const Icon = config.icon;
            return (
              <div key={config.type} className="flex items-start justify-between p-4 border rounded-lg">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <Label className="font-medium">{config.title}</Label>
                    {!config.previewed && (
                      <Badge variant="secondary">Ej förhandsgranskad</Badge>
                    )}
                    {config.previewed && !config.enabled && (
                      <Badge variant="outline">Förhandsgranskad</Badge>
                    )}
                    {config.enabled && config.previewed && (
                      <Badge>Aktiv</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {config.description}
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    Skickas: {config.frequency}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handlePreview(config.type)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Förhandsgranska
                  </Button>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(checked) => updatePreference(config.type, checked)}
                    disabled={!config.previewed}
                  />
                </div>
              </div>
            );
          })}
          
          <Separator />
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="preferred_day">Föredragen dag för månatliga rapporter</Label>
              <Select 
                value={preferences.preferred_day} 
                onValueChange={(value) => updatePreference('preferred_day', value)}
              >
                <SelectTrigger id="preferred_day" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Måndag</SelectItem>
                  <SelectItem value="tuesday">Tisdag</SelectItem>
                  <SelectItem value="wednesday">Onsdag</SelectItem>
                  <SelectItem value="thursday">Torsdag</SelectItem>
                  <SelectItem value="friday">Fredag</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                Rapporter skickas första veckan i månaden på vald dag
              </p>
            </div>
            
            <div>
              <Label htmlFor="notification_email">Alternativ e-postadress (valfritt)</Label>
              <Input
                id="notification_email"
                type="email"
                value={preferences.notification_email || ''}
                onChange={(e) => updatePreference('notification_email', e.target.value || null)}
                placeholder="din.email@exempel.se"
                className="mt-2"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Lämna tom för att använda din registrerade e-postadress
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ReportPreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        reportType={previewReportType}
        onMarkAsPreviewed={handleMarkAsPreviewed}
      />
    </>
  );
}
