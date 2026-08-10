/**
 * Semi-agent onboarding for multi-org: checklist + next-step links.
 * No automatic writes — pure guidance.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useProperties } from '@/hooks/useProperties';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Building2,
  Users,
  Image,
  Bot,
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  href: string;
  cta: string;
  icon: typeof Building2;
}

export function OrgOnboardingChecklist() {
  const { organization, memberRole } = useOrganization();
  const orgId = organization?.id;
  const { data: properties = [], isLoading: propsLoading } = useProperties();

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['org-onboarding', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const [members, pending, orgRow] = await Promise.all([
        supabase
          .from('organization_members')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!),
        supabase
          .from('ai_suggested_actions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!)
          .eq('status', 'pending'),
        supabase
          .from('organizations_public')
          .select('logo_url')
          .eq('id', orgId!)
          .maybeSingle(),
      ]);
      return {
        memberCount: members.count ?? 0,
        pendingActions: pending.count ?? 0,
        logoUrl: orgRow.data?.logo_url ?? null,
      };
    },
  });

  const items: ChecklistItem[] = useMemo(() => {
    const memberCount = meta?.memberCount ?? 1;
    const hasLogo = Boolean(meta?.logoUrl || organization?.logo_url);
    const hasProperties = properties.length > 0;
    const hasTeam = memberCount > 1;
    const hasReviewedQueue = (meta?.pendingActions ?? 0) === 0;

    return [
      {
        id: 'properties',
        label: 'Lägg till minst en fastighet',
        done: hasProperties,
        href: '/properties',
        cta: 'Till fastigheter',
        icon: Building2,
      },
      {
        id: 'team',
        label: 'Bjud in en kollega',
        done: hasTeam,
        href: '/organization/settings',
        cta: 'Inbjudningar',
        icon: Users,
      },
      {
        id: 'logo',
        label: 'Ladda upp organisationslogotyp',
        done: hasLogo,
        href: '/organization/settings',
        cta: 'Varumärke',
        icon: Image,
      },
      {
        id: 'hitl',
        label: 'Granska AI-förslag (eller ha noll pending)',
        done: hasReviewedQueue,
        href: '/agent',
        cta: 'Agent-aktivitet',
        icon: Bot,
      },
    ];
  }, [meta, organization?.logo_url, properties.length]);

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  const loading = propsLoading || metaLoading;

  // Hide for pure members who can't act, and when fully onboarded
  if (!orgId) return null;
  if (memberRole === 'member' && allDone) return null;
  if (!loading && allDone) return null;

  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Kom igång med {organization?.name || 'organisationen'}
            </CardTitle>
            <CardDescription>
              Checklista (ingen automatisk skrivning) — {doneCount}/{items.length} klart
            </CardDescription>
          </div>
          <span className="text-sm font-medium text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Laddar checklista…</p>
        ) : (
          items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background/80 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span
                    className={
                      item.done
                        ? 'text-sm text-muted-foreground line-through'
                        : 'text-sm font-medium'
                    }
                  >
                    {item.label}
                  </span>
                </div>
                {!item.done && (
                  <Button variant="ghost" size="sm" asChild className="shrink-0">
                    <Link to={item.href}>
                      {item.cta}
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
