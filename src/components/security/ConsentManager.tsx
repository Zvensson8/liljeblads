import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface Consent {
  id: string;
  consent_type: string;
  granted: boolean;
}

export const ConsentManager = () => {
  const queryClient = useQueryClient();

  const { data: consents, isLoading } = useQuery({
    queryKey: ['user-consents'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_consents')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      // Initialize default consents if none exist
      if (!data || data.length === 0) {
        const defaultConsents = [
          { consent_type: 'analytics', granted: false },
          { consent_type: 'marketing', granted: false },
          { consent_type: 'data_processing', granted: true },
        ];

        for (const consent of defaultConsents) {
          await supabase.from('user_consents').insert({
            user_id: user.id,
            ...consent,
            granted_at: consent.granted ? new Date().toISOString() : null,
          });
        }

        return defaultConsents.map((c, i) => ({ id: `temp-${i}`, ...c }));
      }

      return data;
    },
  });

  const updateConsentMutation = useMutation({
    mutationFn: async ({ consentId, granted }: { consentId: string; granted: boolean }) => {
      const { error } = await supabase
        .from('user_consents')
        .update({
          granted,
          granted_at: granted ? new Date().toISOString() : null,
          revoked_at: !granted ? new Date().toISOString() : null,
        })
        .eq('id', consentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-consents'] });
      toast.success('Samtycke uppdaterat');
    },
    onError: () => {
      toast.error('Kunde inte uppdatera samtycke');
    },
  });

  const consentLabels: Record<string, { title: string; description: string }> = {
    analytics: {
      title: 'Analys och statistik',
      description: 'Tillåt att vi samlar in anonymiserad data för att förbättra tjänsten',
    },
    marketing: {
      title: 'Marknadsföring',
      description: 'Ta emot information om nya funktioner och erbjudanden',
    },
    data_processing: {
      title: 'Databehandling (krävs)',
      description: 'Nödvändig för att tjänsten ska fungera',
    },
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Samtycken</CardTitle>
          <CardDescription>Hantera dina dataskyddssamtycken</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Samtycken</CardTitle>
        <CardDescription>Hantera dina dataskyddssamtycken enligt GDPR</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {consents?.map((consent: Consent) => {
          const info = consentLabels[consent.consent_type] || {
            title: consent.consent_type,
            description: '',
          };

          return (
            <div key={consent.id} className="flex items-center justify-between space-x-4 p-4 border rounded-lg">
              <div className="flex-1">
                <Label htmlFor={consent.id} className="font-medium">
                  {info.title}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {info.description}
                </p>
              </div>
              <Switch
                id={consent.id}
                checked={consent.granted}
                disabled={consent.consent_type === 'data_processing'}
                onCheckedChange={(checked) =>
                  updateConsentMutation.mutate({
                    consentId: consent.id,
                    granted: checked,
                  })
                }
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
