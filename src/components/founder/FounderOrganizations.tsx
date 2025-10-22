import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Pencil, Trash2, Search, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Organization {
  id: string;
  name: string;
  subscription_tier: string;
  max_properties: number;
  max_users: number;
  billing_cycle: string;
  billing_contact: string | null;
  invoice_email: string | null;
  payment_status: string;
  next_billing_date: string | null;
  last_payment_date: string | null;
  notes: string | null;
  created_at: string;
}

const TIER_CONFIGS = {
  small: { name: "Liten", maxProperties: 10, maxUsers: 5, price: 45000 },
  medium: { name: "Mellan", maxProperties: 50, maxUsers: 20, price: 150000 },
  large: { name: "Stor", maxProperties: 150, maxUsers: 40, price: 450000 },
  enterprise: { name: "Enterprise", maxProperties: 300, maxUsers: 60, price: 900000 },
};

const BILLING_CYCLES = {
  monthly: "Månadsvis",
  quarterly: "Kvartalsvis",
  semi_annually: "Halvårsvis",
  annually: "Årsvis",
};

export function FounderOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filteredOrgs, setFilteredOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    subscription_tier: "",
    max_properties: 0,
    max_users: 0,
    billing_cycle: "monthly",
    billing_contact: "",
    invoice_email: "",
    payment_status: "active",
    next_billing_date: "",
    notes: "",
  });
  const [createForm, setCreateForm] = useState({
    name: "",
    subscription_tier: "small",
    billing_cycle: "monthly",
    billing_contact: "",
    invoice_email: "",
  });

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    const filtered = organizations.filter((org) =>
      org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.invoice_email?.toLowerCase().includes(searchTerm.toLowerCase())
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
      billing_cycle: org.billing_cycle,
      billing_contact: org.billing_contact || "",
      invoice_email: org.invoice_email || "",
      payment_status: org.payment_status,
      next_billing_date: org.next_billing_date || "",
      notes: org.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrg) return;

    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editForm.name,
          subscription_tier: editForm.subscription_tier,
          max_properties: editForm.max_properties,
          max_users: editForm.max_users,
          billing_cycle: editForm.billing_cycle,
          billing_contact: editForm.billing_contact || null,
          invoice_email: editForm.invoice_email || null,
          payment_status: editForm.payment_status,
          next_billing_date: editForm.next_billing_date || null,
          notes: editForm.notes || null,
        })
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

  const handleCreate = async () => {
    try {
      const tierConfig = TIER_CONFIGS[createForm.subscription_tier as keyof typeof TIER_CONFIGS];
      
      const { error } = await supabase
        .from("organizations")
        .insert({
          name: createForm.name,
          subscription_tier: createForm.subscription_tier,
          max_properties: tierConfig.maxProperties,
          max_users: tierConfig.maxUsers,
          billing_cycle: createForm.billing_cycle,
          billing_contact: createForm.billing_contact || null,
          invoice_email: createForm.invoice_email || null,
          payment_status: "active",
        });

      if (error) throw error;

      toast.success("Organisation skapad");
      setCreateDialogOpen(false);
      setCreateForm({
        name: "",
        subscription_tier: "small",
        billing_cycle: "monthly",
        billing_contact: "",
        invoice_email: "",
      });
      fetchOrganizations();
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error("Kunde inte skapa organisation");
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

  const handleCreateTierChange = (tier: string) => {
    setCreateForm({
      ...createForm,
      subscription_tier: tier,
    });
  };

  const getPaymentStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      overdue: "destructive",
      suspended: "secondary",
      cancelled: "outline",
    };
    const labels: Record<string, string> = {
      active: "Aktiv",
      overdue: "Förfallen",
      suspended: "Pausad",
      cancelled: "Avslutad",
    };
    return <Badge variant={variants[status] || "default"}>{labels[status] || status}</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Organisationer ({organizations.length})</CardTitle>
              <CardDescription>Hantera alla organisationer och deras prenumerationer</CardDescription>
            </div>
            <div className="flex gap-2">
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
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Building className="mr-2 h-4 w-4" />
                Skapa Organisation
              </Button>
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
                  <TableHead>Organisation</TableHead>
                  <TableHead>Prenumeration</TableHead>
                  <TableHead>Betalning</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gränser</TableHead>
                  <TableHead>Skapad</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{org.name}</div>
                        {org.invoice_email && (
                          <div className="text-sm text-muted-foreground">{org.invoice_email}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge>
                          {TIER_CONFIGS[org.subscription_tier as keyof typeof TIER_CONFIGS]?.name || org.subscription_tier}
                        </Badge>
                        <div className="text-sm text-muted-foreground mt-1">
                          {BILLING_CYCLES[org.billing_cycle as keyof typeof BILLING_CYCLES]}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {org.next_billing_date && (
                        <div className="text-sm">
                          <div>Nästa: {new Date(org.next_billing_date).toLocaleDateString("sv-SE")}</div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getPaymentStatusBadge(org.payment_status)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{org.max_properties} fastigheter</div>
                        <div>{org.max_users} användare</div>
                      </div>
                    </TableCell>
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

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Skapa Ny Organisation</DialogTitle>
            <DialogDescription>
              Lägg till en ny organisation med prenumeration och faktureringsinformation
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="create_name">Organisationsnamn *</Label>
              <Input
                id="create_name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Ange organisationsnamn"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="create_tier">Prenumeration *</Label>
              <Select
                value={createForm.subscription_tier}
                onValueChange={handleCreateTierChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIER_CONFIGS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.name} - {config.price.toLocaleString("sv-SE")} SEK/år ({config.maxProperties} fastigheter, {config.maxUsers} användare)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="create_billing_cycle">Betalningscykel *</Label>
              <Select
                value={createForm.billing_cycle}
                onValueChange={(value) => setCreateForm({ ...createForm, billing_cycle: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_CYCLES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="create_invoice_email">Faktura E-post</Label>
              <Input
                id="create_invoice_email"
                type="email"
                value={createForm.invoice_email}
                onChange={(e) => setCreateForm({ ...createForm, invoice_email: e.target.value })}
                placeholder="faktura@företag.se"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="create_billing_contact">Faktureringskontakt</Label>
              <Input
                id="create_billing_contact"
                value={createForm.billing_contact}
                onChange={(e) => setCreateForm({ ...createForm, billing_contact: e.target.value })}
                placeholder="Namn på kontaktperson"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleCreate} disabled={!createForm.name}>
              Skapa Organisation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redigera Organisation</DialogTitle>
            <DialogDescription>
              Ändra organisationsinställningar, prenumeration och faktureringsinformation
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

            <div className="grid gap-2">
              <Label htmlFor="billing_cycle">Betalningscykel</Label>
              <Select
                value={editForm.billing_cycle}
                onValueChange={(value) => setEditForm({ ...editForm, billing_cycle: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_CYCLES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="payment_status">Betalningsstatus</Label>
              <Select
                value={editForm.payment_status}
                onValueChange={(value) => setEditForm({ ...editForm, payment_status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="overdue">Förfallen</SelectItem>
                  <SelectItem value="suspended">Pausad</SelectItem>
                  <SelectItem value="cancelled">Avslutad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invoice_email">Faktura E-post</Label>
              <Input
                id="invoice_email"
                type="email"
                value={editForm.invoice_email}
                onChange={(e) => setEditForm({ ...editForm, invoice_email: e.target.value })}
                placeholder="faktura@företag.se"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="billing_contact">Faktureringskontakt</Label>
              <Input
                id="billing_contact"
                value={editForm.billing_contact}
                onChange={(e) => setEditForm({ ...editForm, billing_contact: e.target.value })}
                placeholder="Namn på kontaktperson"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="next_billing_date">Nästa faktureringsdatum</Label>
              <Input
                id="next_billing_date"
                type="date"
                value={editForm.next_billing_date}
                onChange={(e) => setEditForm({ ...editForm, next_billing_date: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Anteckningar</Label>
              <Textarea
                id="notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Interna anteckningar om organisationen..."
                rows={3}
              />
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
