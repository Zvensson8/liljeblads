import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, DollarSign, TrendingUp, Building, Component } from "lucide-react";

export function FounderStats() {
  const [stats, setStats] = useState({
    totalOrganizations: 0,
    activeOrganizations: 0,
    totalUsers: 0,
    totalProperties: 0,
    totalComponents: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);

      const [orgsResult, usersResult, propertiesResult, componentsResult] = await Promise.all([
        supabase.from("organizations").select("subscription_tier", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("properties").select("id", { count: "exact", head: true }),
        supabase.from("components").select("id", { count: "exact", head: true }),
      ]);

      // Räkna intäkter baserat på subscription tiers
      const tierPrices: Record<string, number> = {
        small: 45000,
        medium: 150000,
        large: 450000,
        enterprise: 900000,
      };

      const revenue = (orgsResult.data || []).reduce((sum, org) => {
        return sum + (tierPrices[org.subscription_tier] || 0);
      }, 0);

      setStats({
        totalOrganizations: orgsResult.count || 0,
        activeOrganizations: orgsResult.count || 0,
        totalUsers: usersResult.count || 0,
        totalProperties: propertiesResult.count || 0,
        totalComponents: componentsResult.count || 0,
        totalRevenue: revenue,
      });
    } catch (error: any) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-1/2"></div>
                <div className="h-8 bg-muted rounded w-3/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Totala Organisationer</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalOrganizations}</div>
          <p className="text-xs text-muted-foreground">
            {stats.activeOrganizations} aktiva
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Totala Användare</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalUsers}</div>
          <p className="text-xs text-muted-foreground">
            Över alla organisationer
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Totala Fastigheter</CardTitle>
          <Building className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalProperties}</div>
          <p className="text-xs text-muted-foreground">
            Över alla organisationer
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Totala Komponenter</CardTitle>
          <Component className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalComponents}</div>
          <p className="text-xs text-muted-foreground">
            Över alla fastigheter
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Genomsnitt per Org</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalOrganizations > 0
              ? Math.round(stats.totalProperties / stats.totalOrganizations)
              : 0}{" "}
            fastigheter
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.totalOrganizations > 0
              ? Math.round(stats.totalUsers / stats.totalOrganizations)
              : 0}{" "}
            användare
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
