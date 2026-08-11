import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/utils';

/**
 * Minimal privacy tools for end users (GDPR-oriented).
 * Full org export remains founder-only via organization tooling.
 */
export function PrivacySettings() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);

  const handleExportMyData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      // Best-effort: call export function scoped to current user if available
      const { data, error } = await supabase.functions.invoke('export-organization-data', {
        body: { exportType: 'user', userId: user.id },
      });
      if (error) throw error;

      // Function may return a signed URL or a base64/blob payload depending on version
      const url =
        (data as { downloadUrl?: string; url?: string } | null)?.downloadUrl ||
        (data as { downloadUrl?: string; url?: string } | null)?.url;

      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success('Export startad');
      } else {
        toast.message('Export begärd', {
          description:
            'Om exporten stöds av servern får du en fil eller e-post. Annars kontakta admin.',
        });
      }
    } catch (e) {
      toast.error('Kunde inte exportera data', {
        description: getErrorMessage(e),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Integritet & data
        </CardTitle>
        <CardDescription>
          Ladda ner en kopia av data kopplad till ditt konto. Radering av konto hanteras av
          systemägare (Founder).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Inloggad som <span className="font-medium text-foreground">{user?.email}</span>
        </div>
        <Button variant="outline" onClick={() => void handleExportMyData()} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Exportera min data
        </Button>
      </CardContent>
    </Card>
  );
}
