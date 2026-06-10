import { useState } from 'react';
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, MapPin, FileText, AlertCircle, Mail, Settings, Wrench, Clock } from 'lucide-react';
import { PropertyTodos } from './PropertyTodos';
import { ActivityTimeline } from '../ActivityTimeline';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSendPropertyInfo } from '@/hooks/useEdgeFunctions';
import { EnergyDeclarationCard } from './EnergyDeclarationCard';
import { usePropertyContacts } from '@/hooks/usePropertyContacts';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import type { Property } from '@/types/domain';

interface ComponentLite {
  next_maintenance_date?: string | null;
  [key: string]: unknown;
}

interface PropertyOverviewProps {
  property: Property & { organization_id?: string | null; invoice_address?: string | null };
  components: ComponentLite[];
  workOrders: unknown[];
  floors: unknown[];
  overdueTodos: number;
  urgentWorkOrders: number;
}

export function PropertyOverview({ 
  property, 
  components, 
  workOrders, 
  floors,
  overdueTodos,
  urgentWorkOrders 
}: PropertyOverviewProps) {
  const [sendingEmail, setSendingEmail] = useState(false);
  const { user } = useAuth();
  const { data: contacts = [] } = usePropertyContacts({ propertyId: property.id });
  const { preferences } = useNotificationPreferences();
  const sendPropertyInfo = useSendPropertyInfo();

  const handleSendContactInfo = async () => {
    if (!user?.email) {
      toast.error('Kunde inte hämta din e-postadress. Vänligen logga in igen.');
      return;
    }

    setSendingEmail(true);

    try {
      const sortedContacts = [...contacts].sort((a, b) =>
        new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
      );
      const mainContact = sortedContacts[0];

      const recipientEmail = preferences?.notification_email || user.email;

      await sendPropertyInfo.mutateAsync({
        property_name: property.name,
        property_number: property.property_number,
        property_address: property.address,
        invoice_address: property.invoice_address,
        main_contact: mainContact,
        recipient_email: recipientEmail,
      });

      toast.success('Kontaktinformation skickad till din e-post!');
    } catch (error: unknown) {
      console.error('Error sending email:', error);
      toast.error('Kunde inte skicka e-post: ' + getErrorMessage(error));
    } finally {
      setSendingEmail(false);
    }
  };

  // Calculate components needing service soon (example logic)
  const componentsNeedingService = components.filter((c) => {
    if (!c.next_maintenance_date) return false;
    const daysUntil = Math.floor((new Date(c.next_maintenance_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 30 && daysUntil >= 0;
  }).length;

  const hasAlerts = overdueTodos > 0 || urgentWorkOrders > 0 || componentsNeedingService > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Alerts Section */}
      {hasAlerts && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-lg text-orange-500">Uppmärksamhet krävs</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overdueTodos > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-medium">{overdueTodos}</span>
                <span className="text-muted-foreground">överfälliga att-göra</span>
              </div>
            )}
            {urgentWorkOrders > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-medium">{urgentWorkOrders}</span>
                <span className="text-muted-foreground">brådskande arbetsordrar</span>
              </div>
            )}
            {componentsNeedingService > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-medium">{componentsNeedingService}</span>
                <span className="text-muted-foreground">komponenter behöver service inom 30 dagar</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Property Information */}
        <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Fastighetsinformation</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{property.address || 'Ingen adress'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">📅</span>
              <span className="text-muted-foreground">Byggår: {property.construction_year || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Typ: </span>
              <span className="text-foreground">{property.property_type || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">LOA: </span>
              <span className="text-foreground">{property.loa || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tomtarea: </span>
              <span className="text-foreground">{property.area_sqm ? `${property.area_sqm} m²` : '-'}</span>
            </div>
            
            {/* Compact Energy Declaration */}
            <EnergyDeclarationCard 
              propertyId={property.id} 
              organizationId={property.organization_id}
              compact
            />
          </CardContent>
        </Card>

        {/* Invoice Address & Send Button */}
        <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Fakturaadress</CardTitle>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSendContactInfo}
                disabled={sendingEmail}
                className="gap-2"
              >
                <Mail className="h-4 w-4" />
                Skicka
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {property.invoice_address ? (
              <div className="whitespace-pre-wrap text-sm border rounded-lg p-3 bg-muted/30">
                {property.invoice_address}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Ingen fakturaadress registrerad. Lägg till via "Redigera Fastighet".
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Snabbstatistik</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Våningar:</span>
              <span className="font-medium">{floors.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">Komponenter:</span>
              </div>
              <span className="font-medium">{components.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">Arbetsordrar:</span>
              </div>
              <span className="font-medium">{workOrders.length}</span>
            </div>
            {componentsNeedingService > 0 && (
              <div className="flex justify-between items-center pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-orange-500">Service inom 30 dagar:</span>
                </div>
                <span className="font-medium text-orange-500">{componentsNeedingService}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Att-göra Widget */}
        <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Att-göra</CardTitle>
          </CardHeader>
          <CardContent>
            <PropertyTodos propertyId={property.id} compact />
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline - Full Width */}
      <ActivityTimeline propertyId={property.id} />
    </div>
  );
}
