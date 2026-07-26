import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Clock, User, AlertCircle, CheckCircle, XCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

type AuditValue = Record<string, unknown> | string | number | boolean | null;

interface AuditLog {
  id: string;
  timestamp: string;
  user_email: string | null;
  event_type: string;
  resource_type: string;
  action: string;
  success: boolean;
  old_value: AuditValue;
  new_value: AuditValue;
  metadata: AuditValue;
}

interface AuditLogRow extends Omit<AuditLog, "user_email"> {
  profiles?: { email?: string | null } | null;
}

interface OrganizationAuditLogsProps {
  organizationId: string;
}

export function OrganizationAuditLogs({ organizationId }: OrganizationAuditLogsProps) {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>("all");

  const { data: auditLogs, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", organizationId, eventTypeFilter, resourceTypeFilter],
    queryFn: async () => {
      // Hämta audit logs med användarens email från profiles
      // Cast supabase to any here to avoid TS2589 deep instantiation with the joined select.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select(`
          *,
          profiles:user_id (
            email
          )
        `)
        .eq("organization_id", organizationId)
        .order("timestamp", { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Mappa till rätt format med user_email
      let processedData = ((data ?? []) as unknown as AuditLogRow[]).map((log) => ({
        ...log,
        user_email: log.profiles?.email ?? null,
      })) as AuditLog[];
      
      // Filtrera på frontend
      if (eventTypeFilter !== "all") {
        processedData = processedData.filter((log) => log.event_type === eventTypeFilter);
      }
      
      if (resourceTypeFilter !== "all") {
        processedData = processedData.filter((log) => log.resource_type === resourceTypeFilter);
      }
      
      return processedData;
    },
  });

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "create":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "update":
      case "role_change":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "delete":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "access":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "permission_denied":
        return <Shield className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventBadgeVariant = (eventType: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (eventType) {
      case "create":
        return "default";
      case "update":
      case "role_change":
        return "secondary";
      case "delete":
      case "permission_denied":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      member_added: "Medlem tillagd",
      role_updated: "Roll uppdaterad",
      member_removed: "Medlem borttagen",
      email_changed: "E-post ändrad",
      name_changed: "Namn ändrat",
      organization_changed: "Organisation ändrad",
      contact_created: "Kontakt skapad",
      contact_updated: "Kontakt uppdaterad",
      contact_deleted: "Kontakt borttagen",
      billing_updated: "Fakturering uppdaterad",
      viewed_email: "E-post visad",
      accessed_billing: "Fakturering öppnad",
    };
    return labels[action] || action;
  };

  const formatChangeDetails = (log: AuditLog) => {
    if (!log.old_value && !log.new_value) return null;

    return (
      <div className="text-xs space-y-1 mt-2">
        {log.old_value && (
          <div className="text-muted-foreground">
            <span className="font-medium">Före:</span>{" "}
            {typeof log.old_value === "object"
              ? JSON.stringify(log.old_value, null, 2)
              : log.old_value}
          </div>
        )}
        {log.new_value && (
          <div className="text-muted-foreground">
            <span className="font-medium">Efter:</span>{" "}
            {typeof log.new_value === "object"
              ? JSON.stringify(log.new_value, null, 2)
              : log.new_value}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Laddar audit logs...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Säkerhetslogg
            </CardTitle>
            <CardDescription>
              Spåra alla säkerhetshändelser och ändringar i organisationen
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            Uppdatera
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1">
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrera på händelsetyp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla händelser</SelectItem>
                <SelectItem value="create">Skapade</SelectItem>
                <SelectItem value="update">Uppdaterade</SelectItem>
                <SelectItem value="delete">Borttagna</SelectItem>
                <SelectItem value="role_change">Rolländringar</SelectItem>
                <SelectItem value="access">Åtkomst</SelectItem>
                <SelectItem value="permission_denied">Nekad åtkomst</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrera på resurs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla resurser</SelectItem>
                <SelectItem value="organization_members">Medlemmar</SelectItem>
                <SelectItem value="profiles">Profiler</SelectItem>
                <SelectItem value="property_contacts">Kontakter</SelectItem>
                <SelectItem value="organizations">Organisation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tidpunkt</TableHead>
                <TableHead>Användare</TableHead>
                <TableHead>Händelse</TableHead>
                <TableHead>Åtgärd</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs && auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss", {
                          locale: sv,
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {log.user_email || "System"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getEventBadgeVariant(log.event_type)}>
                        <span className="flex items-center gap-1">
                          {getEventIcon(log.event_type)}
                          {log.event_type}
                        </span>
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {log.resource_type}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">
                          {getActionLabel(log.action)}
                        </div>
                        {formatChangeDetails(log)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.success ? (
                        <Badge variant="outline" className="text-green-600">
                          ✓ Lyckades
                        </Badge>
                      ) : (
                        <Badge variant="destructive">✗ Misslyckades</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <div className="text-muted-foreground">
                      Inga händelser hittades
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Info */}
        <div className="text-xs text-muted-foreground border-t pt-4">
          <p className="flex items-center gap-2">
            <Shield className="h-3 w-3" />
            Audit logs kan inte ändras eller tas bort och sparas för compliance och säkerhetsövervakning.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
