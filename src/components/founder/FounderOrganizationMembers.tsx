import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Trash2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Organization {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

interface Member {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  joined_at: string;
  profiles: Profile;
  organizations: Organization;
}

export function FounderOrganizationMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    organization_id: "",
    user_id: "",
    role: "member",
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const filtered = members.filter((member) =>
      member.profiles.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.profiles.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.organizations.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredMembers(filtered);
  }, [searchTerm, members]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [membersRes, orgsRes, profilesRes] = await Promise.all([
        supabase
          .from("organization_members")
          .select(`
            *,
            profiles:user_id(id, email, full_name),
            organizations(id, name)
          `),
        supabase
          .from("organizations")
          .select("id, name")
          .order("name"),
        supabase
          .from("profiles")
          .select("id, email, full_name")
          .order("email"),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (orgsRes.error) throw orgsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      setMembers(membersRes.data as any || []);
      setFilteredMembers(membersRes.data as any || []);
      setOrganizations(orgsRes.data || []);
      setProfiles(profilesRes.data || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Kunde inte hämta data");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!addForm.organization_id || !addForm.user_id) {
      toast.error("Välj både organisation och användare");
      return;
    }

    try {
      const { error } = await supabase
        .from("organization_members")
        .insert({
          organization_id: addForm.organization_id,
          user_id: addForm.user_id,
          role: addForm.role,
        });

      if (error) {
        if (error.code === "23505") {
          toast.error("Användaren är redan medlem i denna organisation");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Medlem tillagd");
      setAddDialogOpen(false);
      setAddForm({ organization_id: "", user_id: "", role: "member" });
      fetchData();
    } catch (error: any) {
      console.error("Error adding member:", error);
      toast.error("Kunde inte lägga till medlem");
    }
  };

  const handleDeleteMember = async (id: string, email: string, orgName: string) => {
    if (!confirm(`Är du säker på att du vill ta bort ${email} från ${orgName}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Medlem borttagen");
      fetchData();
    } catch (error: any) {
      console.error("Error deleting member:", error);
      toast.error("Kunde inte ta bort medlem");
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
      fetchData();
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast.error("Kunde inte uppdatera roll");
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role === "owner") return "default";
    if (role === "admin") return "secondary";
    return "outline";
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Organisationsmedlemmar ({members.length})</CardTitle>
              <CardDescription>Hantera användare och deras roller i organisationer</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="w-64">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sök medlem eller organisation..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Button onClick={() => setAddDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Lägg till Medlem
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Laddar medlemmar...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Användare</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead>Gick med</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{member.profiles.full_name}</div>
                        <div className="text-sm text-muted-foreground">{member.profiles.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{member.organizations.name}</TableCell>
                    <TableCell>
                      <Select
                        value={member.role}
                        onValueChange={(value) => handleRoleChange(member.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {new Date(member.joined_at).toLocaleDateString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMember(
                          member.id,
                          member.profiles.email,
                          member.organizations.name
                        )}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till Medlem</DialogTitle>
            <DialogDescription>
              Lägg till en användare i en organisation
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="organization">Organisation *</Label>
              <Select
                value={addForm.organization_id}
                onValueChange={(value) => setAddForm({ ...addForm, organization_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj organisation" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user">Användare *</Label>
              <Select
                value={addForm.user_id}
                onValueChange={(value) => setAddForm({ ...addForm, user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj användare" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name} ({profile.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Roll</Label>
              <Select
                value={addForm.role}
                onValueChange={(value) => setAddForm({ ...addForm, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleAddMember} disabled={!addForm.organization_id || !addForm.user_id}>
              Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
