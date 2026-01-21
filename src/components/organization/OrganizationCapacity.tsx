import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building, Users, FolderKanban, AlertTriangle } from "lucide-react";
import { getTierById, formatStorage, SUBSCRIPTION_TIERS } from "@/lib/subscriptionTiers";

interface OrganizationCapacityProps {
  organization: {
    id: string;
    name: string;
    subscription_tier: string;
    max_properties: number;
    max_users: number;
    max_components?: number;
    max_work_orders?: number;
    max_projects?: number;
    max_documents?: number;
    max_storage_mb?: number;
  };
  onUpgrade?: () => void;
}

export function OrganizationCapacity({ organization, onUpgrade }: OrganizationCapacityProps) {
  const [stats, setStats] = useState({ properties: 0, users: 0, projects: 0 });
  const [loading, setLoading] = useState(true);
  const tier = getTierById(organization.subscription_tier);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const { count: propCount } = await supabase.from("properties").select("*", { count: "exact", head: true }).eq("organization_id", organization.id);
        const { count: memberCount } = await supabase.from("organization_members").select("*", { count: "exact", head: true }).eq("organization_id", organization.id);
        const { count: projectCount } = await supabase.from("projects").select("*", { count: "exact", head: true }).eq("organization_id", organization.id);
        setStats({ properties: propCount ?? 0, users: memberCount ?? 0, projects: projectCount ?? 0 });
      } catch (e) {
        console.error("Error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [organization.id]);

  const limits = {
    properties: organization.max_properties || tier?.limits.properties || 10,
    users: organization.max_users || tier?.limits.users || 5,
    projects: organization.max_projects || tier?.limits.projects || 100,
  };

  const capacityItems = [
    { label: "Fastigheter", current: stats.properties, max: limits.properties, icon: <Building className="h-4 w-4" /> },
    { label: "Användare", current: stats.users, max: limits.users, icon: <Users className="h-4 w-4" /> },
    { label: "Projekt", current: stats.projects, max: limits.projects, icon: <FolderKanban className="h-4 w-4" /> },
  ];

  if (loading) {
    return <Card><CardContent className="py-8"><div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></CardContent></Card>;
  }

  const criticalItems = capacityItems.filter(item => (item.current / item.max) * 100 >= 90);

  return (
    <div className="space-y-6">
      {criticalItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Kritisk kapacitet!</strong> Över 90% för: {criticalItems.map(i => i.label).join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kapacitetsöversikt</CardTitle>
          <CardDescription>Prenumeration: <Badge variant="outline">{tier?.name || organization.subscription_tier}</Badge></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {capacityItems.map((item) => {
              const percent = Math.min((item.current / item.max) * 100, 100);
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">{item.icon}{item.label}</div>
                    <span className="text-sm text-muted-foreground">{item.current} / {item.max}</span>
                  </div>
                  <Progress value={percent} className="h-2" />
                  <p className="text-xs text-muted-foreground">{percent.toFixed(0)}% använt</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prenumerationsnivåer</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Resurs</th>
                  {SUBSCRIPTION_TIERS.map(t => <th key={t.id} className={`text-center py-2 ${t.id === organization.subscription_tier ? 'bg-primary/10' : ''}`}>{t.name}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b"><td className="py-2">Fastigheter</td>{SUBSCRIPTION_TIERS.map(t => <td key={t.id} className="text-center py-2">{t.limits.properties.toLocaleString()}</td>)}</tr>
                <tr className="border-b"><td className="py-2">Användare</td>{SUBSCRIPTION_TIERS.map(t => <td key={t.id} className="text-center py-2">{t.limits.users.toLocaleString()}</td>)}</tr>
                <tr className="border-b"><td className="py-2">Komponenter</td>{SUBSCRIPTION_TIERS.map(t => <td key={t.id} className="text-center py-2">{t.limits.components.toLocaleString()}</td>)}</tr>
                <tr className="border-b"><td className="py-2">Projekt</td>{SUBSCRIPTION_TIERS.map(t => <td key={t.id} className="text-center py-2">{t.limits.projects.toLocaleString()}</td>)}</tr>
                <tr><td className="py-2">Lagring</td>{SUBSCRIPTION_TIERS.map(t => <td key={t.id} className="text-center py-2">{formatStorage(t.limits.storageMb)}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
