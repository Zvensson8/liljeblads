import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trash2, Crown, Shield, User as UserIcon, DollarSign, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Member {
  id: string;
  role: string;
  joined_at: string;
  user_id: string;
  profiles: {
    email: string;
    full_name: string | null;
  } | null;
}

interface OrganizationMembersProps {
  organizationId: string;
  isAdmin: boolean;
  currentUserId: string;
}

export function OrganizationMembers({ organizationId, isAdmin, currentUserId }: OrganizationMembersProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

  useEffect(() => {
    fetchMembers();
  }, [organizationId]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", organizationId)
        .order("joined_at", { ascending: false });

      if (error) throw error;

      // Fetch profile data separately
      const membersWithProfiles = await Promise.all(
        (data || []).map(async (member) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", member.user_id)
            .single();

          return {
            ...member,
            profiles: profile,
          };
        })
      );

      setMembers(membersWithProfiles as any);
    } catch (error: any) {
      console.error("Error fetching members:", error);
      toast.error("Kunde inte hämta medlemmar");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from("organization_members")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) throw error;

      toast.success("Roll uppdaterad");
      fetchMembers();
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast.error("Kunde inte uppdatera roll");
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;

    try {
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("id", memberToDelete.id);

      if (error) throw error;

      toast.success("Medlem borttagen");
      setDeleteDialogOpen(false);
      setMemberToDelete(null);
      fetchMembers();
    } catch (error: any) {
      console.error("Error deleting member:", error);
      toast.error("Kunde inte ta bort medlem");
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <UserIcon className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const hasFinancialAccess = (role: string) => {
    return role === "owner" || role === "admin";
  };

  const getRolePermissions = (role: string) => {
    switch (role) {
      case "owner":
        return "Full åtkomst inkl. fakturering, budgetar och alla kostnader";
      case "admin":
        return "Hantera medlemmar, se all finansiell data";
      default:
        return "Visa fastigheter och komponenter, begränsad ekonomiåtkomst";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Laddar medlemmar...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Information om roller och behörigheter */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Roller och Behörigheter</AlertTitle>
          <AlertDescription className="space-y-2 mt-2">
            <div className="grid gap-2">
              <div className="flex items-start gap-2">
                <Crown className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div className="text-sm">
                  <strong>Ägare:</strong> Full åtkomst till allt inkl. fakturering, budgetar, kostnader och organisationsinställningar
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-500 mt-0.5" />
                <div className="text-sm">
                  <strong>Admin:</strong> Kan hantera medlemmar och har full åtkomst till all finansiell data (budgetar, priser, kostnader)
                </div>
              </div>
              <div className="flex items-start gap-2">
                <UserIcon className="h-4 w-4 text-gray-500 mt-0.5" />
                <div className="text-sm">
                  <strong>Medlem:</strong> Kan visa fastigheter, komponenter och work orders men ser INTE priser eller kostnadsdata
                </div>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Medlemmar ({members.length})</CardTitle>
            <CardDescription>Hantera medlemmar och deras rollbehörigheter</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead>E-post</TableHead>
                  <TableHead>Roll & Behörigheter</TableHead>
                  <TableHead>Gick med</TableHead>
                  {isAdmin && <TableHead className="text-right">Åtgärder</TableHead>}
                </TableRow>
              </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.profiles?.full_name || "Okänd användare"}
                  </TableCell>
                  <TableCell>
                    {/* Endast org admins kan se email - Defense in Depth */}
                    {isAdmin || member.user_id === currentUserId ? (
                      member.profiles?.email
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help">
                            Dold (endast admins)
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Endast org owners och admins kan se e-postadresser</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {isAdmin && member.user_id !== currentUserId ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member.id, value)}
                        >
                          <SelectTrigger className="w-[160px]">
                            <div className="flex items-center gap-2">
                              {getRoleIcon(member.role)}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">
                              <div className="flex items-center gap-2">
                                <Crown className="h-4 w-4" />
                                Ägare
                              </div>
                            </SelectItem>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                Admin
                              </div>
                            </SelectItem>
                            <SelectItem value="member">
                              <div className="flex items-center gap-2">
                                <UserIcon className="h-4 w-4" />
                                Medlem
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={getRoleBadgeVariant(member.role)}>
                          <span className="flex items-center gap-1">
                            {getRoleIcon(member.role)}
                            {member.role === "owner" ? "Ägare" : member.role === "admin" ? "Admin" : "Medlem"}
                          </span>
                        </Badge>
                      )}
                      <div className="flex items-center gap-2">
                        {hasFinancialAccess(member.role) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs">
                                <DollarSign className="h-3 w-3 mr-1" />
                                Ekonomi
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">Har åtkomst till budgetar, priser och kostnadsdata</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs text-xs">{getRolePermissions(member.role)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(member.joined_at).toLocaleDateString("sv-SE")}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {member.user_id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setMemberToDelete(member);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort medlem</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort {memberToDelete?.profiles?.full_name || "denna medlem"} från organisationen?
              Denna åtgärd kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMember} className="bg-destructive text-destructive-foreground">
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
