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
import { Pencil, Trash2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Organization {
  id: string;
  name: string;
  subscription_tier: string;
  max_properties: number;
  max_users: number;
  created_at: string;
}

const TIER_CONFIGS = {
  small: { name: "Liten", maxProperties: 10, maxUsers: 5, price: 45000 },
  medium: { name: "Mellan", maxProperties: 50, maxUsers: 20, price: 150000 },
  large: { name: "Stor", maxProperties: 150, maxUsers: 40, price: 450000 },
  enterprise: { name: "Enterprise", maxProperties: 300, maxUsers: 60, price: 900000 },
};

export function FounderOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filteredOrgs, setFilteredOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    subscription_tier: "",
    max_properties: 0,
    max_users: 0,
  });

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    const filtered = organizations.filter((org) =>
      org.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredOrgs(filtered);
  }, [searchTerm, organizations]);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrganizations(data || []);
      setFilteredOrgs(data || []);
    } catch (error: any) {
      console.error("Error fetching organizations:", error);
      toast.error("Kunde inte hämta organisationer");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (org: Organization) => {
    setSelectedOrg(org);
    setEditForm({
      name: org.name,
      subscription_tier: org.subscription_tier,
      max_properties: org.max_properties,
      max_users: org.max_users,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrg) return;

    try {
      const { error } = await supabase
        .from("organizations")
        .update(editForm)
        .eq("id", selectedOrg.id);

      if (error) throw error;

      toast.success("Organisation uppdaterad");
      setEditDialogOpen(false);
      fetchOrganizations();
    } catch (error: any) {
      console.error("Error updating organization:", error);
      toast.error("Kunde inte uppdatera organisation");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Är du säker på att du vill radera organisationen "${name}"? Detta kommer radera alla relaterade data.`)) {
      return;
    }

    try {
      const { error } = await supabase.from("organizations").delete().eq("id", id);

      if (error) throw error;

      toast.success("Organisation raderad");
      fetchOrganizations();
    } catch (error: any) {
      console.error("Error deleting organization:", error);
      toast.error("Kunde inte radera organisation");
    }
  };

  const handleTierChange = (tier: string) => {
    const config = TIER_CONFIGS[tier as keyof typeof TIER_CONFIGS];
    if (config) {
      setEditForm({
        ...editForm,
        subscription_tier: tier,
        max_properties: config.maxProperties,
        max_users: config.maxUsers,
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Alla Organisationer ({organizations.length})</CardTitle>
              <CardDescription>Hantera alla organisationer i systemet</CardDescription>
            </div>
            <div className="w-64">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök organisation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Laddar organisationer...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead>Prenumeration</TableHead>
                  <TableHead>Fastigheter</TableHead>
                  <TableHead>Användare</TableHead>
                  <TableHead>Skapad</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>
                      <Badge>
                        {TIER_CONFIGS[org.subscription_tier as keyof typeof TIER_CONFIGS]?.name || org.subscription_tier}
                      </Badge>
                    </TableCell>
                    <TableCell>{org.max_properties}</TableCell>
                    <TableCell>{org.max_users}</TableCell>
                    <TableCell>
                      {new Date(org.created_at).toLocaleDateString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(org)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(org.id, org.name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Redigera Organisation</DialogTitle>
            <DialogDescription>
              Ändra organisationsinställningar och prenumeration
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Organisationsnamn</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tier">Prenumeration</Label>
              <Select
                value={editForm.subscription_tier}
                onValueChange={handleTierChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIER_CONFIGS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.name} - {config.price.toLocaleString("sv-SE")} SEK/år
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="max_properties">Max Fastigheter</Label>
                <Input
                  id="max_properties"
                  type="number"
                  value={editForm.max_properties}
                  onChange={(e) =>
                    setEditForm({ ...editForm, max_properties: parseInt(e.target.value) })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="max_users">Max Användare</Label>
                <Input
                  id="max_users"
                  type="number"
                  value={editForm.max_users}
                  onChange={(e) =>
                    setEditForm({ ...editForm, max_users: parseInt(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSaveEdit}>Spara ändringar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
