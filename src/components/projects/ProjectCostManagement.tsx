import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLogProjectActivity } from "@/hooks/useProjectActivityLog";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface CostItem {
  id: string;
  description: string;
  amount: number;
  cost_date: string;
  actor: string | null;
  category: string | null;
  created_at: string;
}

interface ProjectCostManagementProps {
  projectId: string;
  onCostUpdate: () => void;
}

export function ProjectCostManagement({
  projectId,
  onCostUpdate,
}: ProjectCostManagementProps) {
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(false);
  const logActivity = useLogProjectActivity();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<CostItem | null>(null);
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    cost_date: new Date().toISOString().split("T")[0],
    actor: "",
    category: "",
  });

  useEffect(() => {
    fetchCosts();
  }, [projectId]);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_cost_items")
        .select("*")
        .eq("project_id", projectId)
        .order("cost_date", { ascending: false });

      if (error) throw error;
      setCosts(data || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta kostnader");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description || !formData.amount) {
      toast.error("Fyll i alla obligatoriska fält");
      return;
    }

    try {
      if (editingCost) {
        const { error } = await supabase
          .from("project_cost_items")
          .update({
            description: formData.description,
            amount: parseFloat(formData.amount),
            cost_date: formData.cost_date,
            actor: formData.actor || null,
            category: formData.category || null,
          })
          .eq("id", editingCost.id);

        if (error) throw error;

        // Log activity
        await logActivity.mutateAsync({
          project_id: projectId,
          activity_type: "cost_updated",
          description: `Kostnad uppdaterad: "${formData.description}" (${parseFloat(formData.amount).toLocaleString("sv-SE")} kr)`,
        });

        toast.success("Kostnad uppdaterad");
      } else {
        const { error } = await supabase.from("project_cost_items").insert({
          project_id: projectId,
          description: formData.description,
          amount: parseFloat(formData.amount),
          cost_date: formData.cost_date,
          actor: formData.actor || null,
          category: formData.category || null,
        });

        if (error) throw error;

        // Log activity
        await logActivity.mutateAsync({
          project_id: projectId,
          activity_type: "cost_added",
          description: `Kostnad tillagd: "${formData.description}" (${parseFloat(formData.amount).toLocaleString("sv-SE")} kr)`,
        });

        toast.success("Kostnad registrerad");
      }

      setDialogOpen(false);
      setEditingCost(null);
      setFormData({
        description: "",
        amount: "",
        cost_date: new Date().toISOString().split("T")[0],
        actor: "",
        category: "",
      });
      fetchCosts();
      onCostUpdate();
    } catch (error: any) {
      toast.error("Kunde inte spara kostnad");
    }
  };

  const handleEdit = (cost: CostItem) => {
    setEditingCost(cost);
    setFormData({
      description: cost.description,
      amount: cost.amount.toString(),
      cost_date: cost.cost_date,
      actor: cost.actor || "",
      category: cost.category || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Är du säker på att du vill ta bort denna kostnad?")) return;

    try {
      // Get cost details before deleting for logging
      const costToDelete = costs.find(c => c.id === id);

      const { error } = await supabase
        .from("project_cost_items")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Log activity
      if (costToDelete) {
        await logActivity.mutateAsync({
          project_id: projectId,
          activity_type: "cost_deleted",
          description: `Kostnad borttagen: "${costToDelete.description}" (${costToDelete.amount.toLocaleString("sv-SE")} kr)`,
        });
      }

      toast.success("Kostnad borttagen");
      fetchCosts();
      onCostUpdate();
    } catch (error: any) {
      toast.error("Kunde inte ta bort kostnad");
    }
  };

  const totalCost = costs.reduce((sum, cost) => sum + cost.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Kostnadsregistrering</h3>
          <p className="text-sm text-muted-foreground">
            Totalt: {totalCost.toLocaleString("sv-SE")} kr (exkl. moms)
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingCost(null);
                setFormData({
                  description: "",
                  amount: "",
                  cost_date: new Date().toISOString().split("T")[0],
                  actor: "",
                  category: "",
                });
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Registrera kostnad
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCost ? "Redigera kostnad" : "Registrera ny kostnad"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="description">Beskrivning *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="T.ex. Material för ombyggnad"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount">Belopp (exkl. moms) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="cost_date">Datum *</Label>
                  <Input
                    id="cost_date"
                    type="date"
                    value={formData.cost_date}
                    onChange={(e) =>
                      setFormData({ ...formData, cost_date: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="actor">Aktör</Label>
                  <Input
                    id="actor"
                    value={formData.actor}
                    onChange={(e) =>
                      setFormData({ ...formData, actor: e.target.value })
                    }
                    placeholder="T.ex. Byggfirma AB"
                  />
                </div>

                <div>
                  <Label htmlFor="category">Kategori</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    placeholder="T.ex. Material"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Avbryt
                </Button>
                <Button type="submit">
                  {editingCost ? "Uppdatera" : "Spara"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Beskrivning</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Aktör</TableHead>
              <TableHead className="text-right">Belopp</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-muted-foreground">
                    Inga kostnader registrerade än
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              costs.map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell>
                    {format(new Date(cost.cost_date), "PPP", { locale: sv })}
                  </TableCell>
                  <TableCell>{cost.description}</TableCell>
                  <TableCell>
                    {cost.category || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    {cost.actor || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {cost.amount.toLocaleString("sv-SE")} kr
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(cost)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(cost.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
