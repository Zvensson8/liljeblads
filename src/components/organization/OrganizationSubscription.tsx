import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Check, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SUBSCRIPTION_TIERS, getTierById } from "@/lib/subscriptionTiers";

interface OrganizationSubscriptionProps {
  organization: {
    id: string;
    subscription_tier: string;
    max_properties: number;
    max_users: number;
    max_components?: number;
    max_work_orders?: number;
    max_projects?: number;
    max_documents?: number;
    max_storage_mb?: number;
  };
  stats: {
    propertyCount: number;
    memberCount: number;
  };
  onUpdate: () => void;
}

export function OrganizationSubscription({
  organization,
  stats,
  onUpdate,
}: OrganizationSubscriptionProps) {
  const [upgrading, setUpgrading] = useState(false);

  const currentTier = SUBSCRIPTION_TIERS.find((t) => t.id === organization.subscription_tier);
  const propertyUsagePercent = (stats.propertyCount / organization.max_properties) * 100;
  const userUsagePercent = (stats.memberCount / organization.max_users) * 100;

  const handleUpgrade = async (tierId: string) => {
    const tier = SUBSCRIPTION_TIERS.find((t) => t.id === tierId);
    if (!tier) return;

    try {
      setUpgrading(true);
      const { error } = await supabase
        .from("organizations")
        .update({
          subscription_tier: tier.id,
          max_properties: tier.limits.properties,
          max_users: tier.limits.users,
          max_components: tier.limits.components,
          max_work_orders: tier.limits.workOrders,
          max_projects: tier.limits.projects,
          max_documents: tier.limits.documents,
          max_storage_mb: tier.limits.storageMb,
        })
        .eq("id", organization.id);

      if (error) throw error;

      toast.success(`Prenumeration uppgraderad till ${tier.name}`);
      onUpdate();
    } catch (error: unknown) {
      console.error("Error upgrading subscription:", error);
      toast.error("Kunde inte uppgradera prenumeration");
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Aktuell prenumeration</CardTitle>
          <CardDescription>
            Du har {currentTier?.name} prenumerationen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">{currentTier?.name}</h3>
              <p className="text-muted-foreground">
                {currentTier?.price.toLocaleString("sv-SE")} SEK / år
              </p>
            </div>
            <Badge variant="default" className="text-lg px-4 py-2">
              Aktiv
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Fastigheter</span>
                <span className="text-muted-foreground">
                  {stats.propertyCount} / {organization.max_properties}
                </span>
              </div>
              <Progress value={propertyUsagePercent} className="h-2" />
              {propertyUsagePercent > 75 && (
                <p className="text-xs text-yellow-600">
                  Du närmar dig gränsen för antal fastigheter
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Användare</span>
                <span className="text-muted-foreground">
                  {stats.memberCount} / {organization.max_users}
                </span>
              </div>
              <Progress value={userUsagePercent} className="h-2" />
              {userUsagePercent > 75 && (
                <p className="text-xs text-yellow-600">
                  Du närmar dig gränsen för antal användare
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t">
            <h4 className="font-semibold mb-2">Inkluderade funktioner:</h4>
            <ul className="space-y-1">
              {currentTier?.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-xl font-bold mb-4">Uppgradera din prenumeration</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {SUBSCRIPTION_TIERS.map((tier) => {
            const isCurrent = tier.id === organization.subscription_tier;
            const currentIndex = SUBSCRIPTION_TIERS.findIndex(
              (t) => t.id === organization.subscription_tier
            );
            const tierIndex = SUBSCRIPTION_TIERS.findIndex((t) => t.id === tier.id);
            const isUpgrade = tierIndex > currentIndex;

            return (
              <Card
                key={tier.id}
                className={isCurrent ? "border-primary" : ""}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{tier.name}</CardTitle>
                    {isCurrent && <Badge>Aktuell</Badge>}
                  </div>
                  <CardDescription>
                    <span className="text-2xl font-bold text-foreground">
                      {tier.price.toLocaleString("sv-SE")} SEK
                    </span>
                    <span className="text-sm"> / år</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1">
                    {tier.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isUpgrade && (
                    <Button
                      onClick={() => handleUpgrade(tier.id)}
                      disabled={upgrading}
                      className="w-full"
                    >
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Uppgradera till {tier.name}
                    </Button>
                  )}

                  {isCurrent && (
                    <Button disabled className="w-full" variant="outline">
                      Nuvarande plan
                    </Button>
                  )}

                  {!isUpgrade && !isCurrent && (
                    <Button disabled className="w-full" variant="ghost">
                      Lägre plan
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
