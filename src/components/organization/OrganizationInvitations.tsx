import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Mail, Trash2, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Invitation {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

interface OrganizationInvitationsProps {
  organizationId: string;
}

export function OrganizationInvitations({ organizationId }: OrganizationInvitationsProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchInvitations();
  }, [organizationId]);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("organization_invitations")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (error: any) {
      console.error("Error fetching invitations:", error);
      toast.error("Kunde inte hämta inbjudningar");
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!email) {
      toast.error("Ange en e-postadress");
      return;
    }

    try {
      setSending(true);
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("organization_invitations").insert({
        organization_id: organizationId,
        email: email.toLowerCase(),
        role,
        invited_by: userData.user?.id,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("Denna e-postadress har redan bjudits in");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Inbjudan skickad");
      setEmail("");
      setRole("member");
      fetchInvitations();
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast.error("Kunde inte skicka inbjudan");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("organization_invitations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Inbjudan borttagen");
      fetchInvitations();
    } catch (error: any) {
      console.error("Error deleting invitation:", error);
      toast.error("Kunde inte ta bort inbjudan");
    }
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bjud in nya medlemmar</CardTitle>
          <CardDescription>
            Skicka inbjudningar via e-post till nya teammedlemmar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-postadress</Label>
              <Input
                id="email"
                type="email"
                placeholder="namn@exempel.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Roll</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Ägare</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Medlem</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSendInvitation} disabled={sending}>
              <Mail className="h-4 w-4 mr-2" />
              Skicka inbjudan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktiva inbjudningar ({invitations.length})</CardTitle>
          <CardDescription>Hantera skickade inbjudningar</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Laddar inbjudningar...</div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Inga inbjudningar skickade ännu</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-post</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Skickat</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {invitation.role === "owner" ? "Ägare" : invitation.role === "admin" ? "Admin" : "Medlem"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invitation.accepted_at ? (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Accepterad
                        </Badge>
                      ) : isExpired(invitation.expires_at) ? (
                        <Badge variant="destructive">Utgången</Badge>
                      ) : (
                        <Badge variant="secondary">Väntar</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(invitation.created_at).toLocaleDateString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right">
                      {!invitation.accepted_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteInvitation(invitation.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
