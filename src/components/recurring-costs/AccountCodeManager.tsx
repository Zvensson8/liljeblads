import { useState, useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface AccountCode {
  id: string;
  code: string;
  description: string;
}

interface AccountCodeManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountCodeManager({ open, onOpenChange }: AccountCodeManagerProps) {
  const { organization } = useOrganization();
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newCode, setNewCode] = useState({ code: "", description: "" });

  useEffect(() => {
    if (organization && open) {
      fetchAccountCodes();
    }
  }, [organization, open]);

  const fetchAccountCodes = async () => {
    if (!organization) return;

    try {
      const { data, error } = await supabase
        .from("account_codes")
        .select("*")
        .eq("organization_id", organization.id)
        .order("code");

      if (error) throw error;
      setAccountCodes(data || []);
    } catch (error) {
      console.error("Error fetching account codes:", error);
      toast.error("Kunde inte hämta kontokoder");
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("account_codes")
        .insert([{
          organization_id: organization.id,
          code: newCode.code,
          description: newCode.description,
        }]);

      if (error) throw error;
      
      toast.success("Kontokod tillagd");
      setNewCode({ code: "", description: "" });
      fetchAccountCodes();
    } catch (error: unknown) {
      console.error("Error adding account code:", error);
      const code = (error as { code?: string } | null)?.code;
      if (code === "23505") {
        toast.error("Kontokoden finns redan");
      } else {
        toast.error("Kunde inte lägga till kontokod");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Är du säker på att du vill ta bort denna kontokod?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("account_codes")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Kontokod borttagen");
      fetchAccountCodes();
    } catch (error) {
      console.error("Error deleting account code:", error);
      toast.error("Kunde inte ta bort kontokod (kanske används den?)");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hantera Kontoplan</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <div className="flex-1">
            <Label htmlFor="code" className="sr-only">Kontokod</Label>
            <Input
              id="code"
              placeholder="Kontokod (t.ex. 41319)"
              value={newCode.code}
              onChange={(e) => setNewCode({ ...newCode, code: e.target.value })}
              required
            />
          </div>
          <div className="flex-[2]">
            <Label htmlFor="description" className="sr-only">Beskrivning</Label>
            <Input
              id="description"
              placeholder="Beskrivning (t.ex. Serviceavtal ventilation)"
              value={newCode.description}
              onChange={(e) => setNewCode({ ...newCode, description: e.target.value })}
              required
            />
          </div>
          <Button type="submit" disabled={isLoading}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till
          </Button>
        </form>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kod</TableHead>
                <TableHead>Beskrivning</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountCodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Inga kontokoder ännu
                  </TableCell>
                </TableRow>
              ) : (
                accountCodes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-medium">{code.code}</TableCell>
                    <TableCell>{code.description}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(code.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
