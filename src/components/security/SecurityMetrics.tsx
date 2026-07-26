import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

export const SecurityMetrics = () => {
  const { user } = useAuth();

  const { data: auditCount } = useQuery({
    queryKey: ['audit-logs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    },
  });

  const userInfo = user
    ? {
        email: user.email,
        lastSignIn: user.last_sign_in_at,
        createdAt: user.created_at,
        emailVerified: user.email_confirmed_at !== null,
      }
    : null;

  const securityMetrics = [
    {
      title: 'Säkerhetsstatus',
      value: 'Bra',
      icon: Shield,
      description: 'Inga kritiska problem',
      color: 'text-green-600',
      bgColor: 'bg-green-600/10',
    },
    {
      title: 'Email-verifiering',
      value: userInfo?.emailVerified ? 'Verifierad' : 'Ej verifierad',
      icon: CheckCircle2,
      description: userInfo?.email || '',
      color: userInfo?.emailVerified ? 'text-green-600' : 'text-yellow-600',
      bgColor: userInfo?.emailVerified ? 'bg-green-600/10' : 'bg-yellow-600/10',
    },
    {
      title: 'Senaste inloggning',
      value: userInfo?.lastSignIn
        ? new Date(userInfo.lastSignIn).toLocaleDateString('sv-SE')
        : '-',
      icon: Activity,
      description: 'Aktivitet',
      color: 'text-blue-600',
      bgColor: 'bg-blue-600/10',
    },
    {
      title: 'Aktivitetsloggar',
      value: auditCount || 0,
      icon: Activity,
      description: 'Totalt antal händelser',
      color: 'text-purple-600',
      bgColor: 'bg-purple-600/10',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {securityMetrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {metric.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                <Icon className={`h-4 w-4 ${metric.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metric.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
