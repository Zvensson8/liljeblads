import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useUserConsents,
  useCreateUserConsent,
  useUpdateUserConsent,
  type UserConsent,
} from '@/hooks/useUserConsents';

const DEFAULT_CONSENTS = [
  { consent_type: 'analytics', granted: false },
  { consent_type: 'marketing', granted: false },
  { consent_type: 'data_processing', granted: true },
] as const;

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

export const ConsentManager = () => {
  const { user } = useAuth();
  const { data: consents = [], isLoading } = useUserConsents(
    user ? { userId: user.id } : undefined,
  );
  const createConsent = useCreateUserConsent();
  const updateConsent = useUpdateUserConsent();

  // Seed defaults once if the user has no consent rows yet.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!user || isLoading || seededRef.current) return;
    if (consents.length > 0) return;
    seededRef.current = true;
    DEFAULT_CONSENTS.forEach((c) => {
      createConsent.mutate({
        user_id: user.id,
        consent_type: c.consent_type,
        granted: c.granted,
        granted_at: c.granted ? new Date().toISOString() : null,
      } as never);
    });
  }, [user, isLoading, consents.length, createConsent]);

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
        {(consents as UserConsent[]).map((consent) => {
          const info = consentLabels[consent.consent_type] || {
            title: consent.consent_type,
            description: '',
          };

          return (
            <div
              key={consent.id}
              className="flex items-center justify-between space-x-4 p-4 border rounded-lg"
            >
              <div className="flex-1">
                <Label htmlFor={consent.id} className="font-medium">
                  {info.title}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
              </div>
              <Switch
                id={consent.id}
                checked={consent.granted}
                disabled={consent.consent_type === 'data_processing'}
                onCheckedChange={(checked) => {
                  updateConsent.mutate(
                    {
                      id: consent.id,
                      patch: {
                        granted: checked,
                        granted_at: checked ? new Date().toISOString() : null,
                        revoked_at: !checked ? new Date().toISOString() : null,
                      } as never,
                    },
                    {
                      onSuccess: () => toast.success('Samtycke uppdaterat'),
                    },
                  );
                }}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
