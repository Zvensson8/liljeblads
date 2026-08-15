import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Activity } from 'lucide-react';

export function EnergyPulseBridgeSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('organization_jarvis_settings')
        .select('energypulse_base_url, energypulse_bridge_secret')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (cancelled) return;
      if (error && !error.message.includes('column')) {
        toast.error(error.message);
      }
      setUrl((data?.energypulse_base_url as string | null) ?? '');
      setSecret((data?.energypulse_bridge_secret as string | null) ?? '');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('organization_jarvis_settings').upsert({
        organization_id: organizationId,
        energypulse_base_url: url.trim() || null,
        energypulse_bridge_secret: secret.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('EnergyPulse-koppling sparad');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          EnergyPulse
        </CardTitle>
        <CardDescription>
          URL + hemlighet (samma som ENERGYPULSE_BRIDGE_SECRET). Används när
          Jarvis läser energi och när en arbetsorder blir klar (åtgärden
          markeras genomförd i EnergyPulse).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ep-url">EnergyPulse-URL</Label>
          <Input
            id="ep-url"
            disabled={loading}
            placeholder="https://energypulse.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-secret">Bridge-hemlighet</Label>
          <Input
            id="ep-secret"
            type="password"
            disabled={loading}
            placeholder="minst 16 tecken"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        <Button type="button" onClick={() => void save()} disabled={saving || loading}>
          {saving ? 'Sparar…' : 'Spara'}
        </Button>
      </CardContent>
    </Card>
  );
}
