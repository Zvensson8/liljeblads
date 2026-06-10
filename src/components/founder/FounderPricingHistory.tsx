import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

interface PricingHistory {
  id: string;
  organization_id: string;
  changed_by: string | null;
  old_tier: string | null;
  new_tier: string | null;
  old_max_properties: number | null;
  new_max_properties: number | null;
  old_max_users: number | null;
  new_max_users: number | null;
  notes: string | null;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
}

export function FounderPricingHistory() {
  const [history, setHistory] = useState<PricingHistory[]>([]);
  const [organizations, setOrganizations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Hämta organisationer
      const { data: orgsData, error: orgsError } = await supabase
        .from("organizations")
        .select("id, name");

      if (orgsError) throw orgsError;

      const orgsMap: Record<string, string> = {};
      (orgsData || []).forEach((org) => {
        orgsMap[org.id] = org.name;
      });
      setOrganizations(orgsMap);

      // Hämta prishistorik
      const { data, error } = await supabase
        .from("organization_pricing_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setHistory((data as unknown as PricingHistory[]) || []);
    } catch (error: unknown) {
      console.error("Error fetching pricing history:", error);
      toast.error("Kunde inte hämta prishistorik");
    } finally {
      setLoading(false);
    }
  };

  const getTierName = (tier: string | null) => {
    if (!tier) return "N/A";
    const names: Record<string, string> = {
      small: "Liten",
      medium: "Mellan",
      large: "Stor",
      enterprise: "Enterprise",
    };
    return names[tier] || tier;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prisändringar ({history.length})</CardTitle>
        <CardDescription>
          Historik över alla ändringar i organisationers prenumerationer
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Laddar historik...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Inga prisändringar ännu
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Prenumeration</TableHead>
                <TableHead>Fastigheter</TableHead>
                <TableHead>Användare</TableHead>
                <TableHead>Datum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {organizations[item.organization_id] || "Okänd"}
                  </TableCell>
                  <TableCell>
                    {item.old_tier !== item.new_tier ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getTierName(item.old_tier)}</Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Badge>{getTierName(item.new_tier)}</Badge>
                      </div>
                    ) : (
                      <Badge variant="outline">{getTierName(item.new_tier)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.old_max_properties !== item.new_max_properties ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {item.old_max_properties}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{item.new_max_properties}</span>
                      </div>
                    ) : (
                      <span className="text-sm">{item.new_max_properties}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.old_max_users !== item.new_max_users ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {item.old_max_users}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{item.new_max_users}</span>
                      </div>
                    ) : (
                      <span className="text-sm">{item.new_max_users}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {new Date(item.created_at).toLocaleString("sv-SE", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
