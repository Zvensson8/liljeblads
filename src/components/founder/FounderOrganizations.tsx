import { useState, useMemo } from "react";
import {
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  type Organization,
} from "@/hooks/useOrganizations";
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

import { Pencil, Trash2, Search, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TIER_CONFIGS, SUBSCRIPTION_TIERS } from "@/lib/subscriptionTiers";

// Organization type imported from useOrganizations hook

export function FounderOrganizations() {
  const { data: organizations = [], isLoading: loading } = useOrganizations();
  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();

  const [searchTerm, setSearchTerm] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    subscription_tier: "",
    max_properties: 0,
    max_users: 0,
    notes: "",
  });
  const [createForm, setCreateForm] = useState({
    name: "",
    subscription_tier: "small",
  });

  const filteredOrgs = useMemo(
    () =>
      organizations.filter((org) =>
        org.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [organizations, searchTerm],
  );

  const handleEdit = (org: Organization) => {
    setSelectedOrg(org);
    setEditForm({
      name: org.name,
      subscription_tier: org.subscription_tier,
      max_properties: org.max_properties,
      max_users: org.max_users,
      notes: org.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrg) return;
    try {
      await updateOrg.mutateAsync({
        id: selectedOrg.id,
        patch: {
          name: editForm.name,
          subscription_tier: editForm.subscription_tier,
          max_properties: editForm.max_properties,
          max_users: editForm.max_users,
          notes: editForm.notes || null,
        },
      });
      setEditDialogOpen(false);
    } catch {
      /* toast handled in hook */
    }
  };

  const handleCreate = async () => {
    try {
      const tierConfig =
        TIER_CONFIGS[createForm.subscription_tier as keyof typeof TIER_CONFIGS];
      await createOrg.mutateAsync({
        name: createForm.name,
        subscription_tier: createForm.subscription_tier,
        max_properties: tierConfig.limits.properties,
        max_users: tierConfig.limits.users,
        max_components: tierConfig.limits.components,
        max_work_orders: tierConfig.limits.workOrders,
        max_projects: tierConfig.limits.projects,
        max_documents: tierConfig.limits.documents,
        max_storage_mb: tierConfig.limits.storageMb,
      });
      setCreateDialogOpen(false);
      setCreateForm({ name: "", subscription_tier: "small" });
    } catch {
      /* toast handled in hook */
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Är du säker på att du vill radera organisationen "${name}"? Detta kommer radera alla relaterade data.`,
      )
    ) {
      return;
    }
    try {
      await deleteOrg.mutateAsync(id);
    } catch {
      /* toast handled in hook */
    }
  };


  const handleTierChange = (tier: string) => {
    const config = TIER_CONFIGS[tier as keyof typeof TIER_CONFIGS];
    if (config) {
      setEditForm({
        ...editForm,
        subscription_tier: tier,
        max_properties: config.limits.properties,
        max_users: config.limits.users,
      });
    }
  };

  const handleCreateTierChange = (tier: string) => {
    setCreateForm({
      ...createForm,
      subscription_tier: tier,
    });
  };


  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Organisationer ({organizations.length})</CardTitle>
              <CardDescription>Hantera alla organisationer och deras inställningar</CardDescription>
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
                  <TableHead>Tier</TableHead>
                  <TableHead>Gränser</TableHead>
                  <TableHead>Skapad</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="font-medium">{org.name}</div>
                    </TableCell>
                    <TableCell>
                      <Badge>
                        {TIER_CONFIGS[org.subscription_tier as keyof typeof TIER_CONFIGS]?.name || org.subscription_tier}
                      </Badge>
                    </TableCell>
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
              Lägg till en ny organisation
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
              <Label htmlFor="create_tier">Tier *</Label>
              <Select
                value={createForm.subscription_tier}
                onValueChange={handleCreateTierChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBSCRIPTION_TIERS.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name} ({tier.limits.properties} fastigheter, {tier.limits.users} användare)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              Ändra organisationsinställningar
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
              <Label htmlFor="tier">Tier</Label>
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
                      {config.name}
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
