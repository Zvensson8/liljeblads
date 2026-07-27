import { useMemo, useState } from 'react';
import {
  useCreateUnitPrice,
  useDeleteUnitPrice,
  useUnitPrices,
  useUpdateUnitPrice,
  UNIT_PRICE_TYPE_SUGGESTIONS,
  type UnitPrice,
  type UnitPriceInput,
} from '@/hooks/useUnitPrices';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrganizationUnitPricesProps {
  organizationId: string;
  /** owner / admin / system admin */
  canEdit?: boolean;
}

function formatSek(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

const emptyForm: UnitPriceInput = {
  component_type: '',
  label: '',
  replacement_cost: 0,
  service_cost: null,
  is_active: true,
};

export function OrganizationUnitPrices({
  organizationId,
  canEdit = true,
}: OrganizationUnitPricesProps) {
  const { data: prices = [], isLoading, error } = useUnitPrices(organizationId);
  const createPrice = useCreateUnitPrice(organizationId);
  const updatePrice = useUpdateUnitPrice(organizationId);
  const deletePrice = useDeleteUnitPrice(organizationId);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UnitPrice | null>(null);
  const [form, setForm] = useState<UnitPriceInput>(emptyForm);
  const [replacementStr, setReplacementStr] = useState('');
  const [serviceStr, setServiceStr] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UnitPrice | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prices.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.component_type.toLowerCase().includes(q)
      );
    });
  }, [prices, search, showInactive]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setReplacementStr('');
    setServiceStr('');
    setDialogOpen(true);
  };

  const openEdit = (row: UnitPrice) => {
    setEditing(row);
    setForm({
      component_type: row.component_type,
      label: row.label,
      replacement_cost: Number(row.replacement_cost),
      service_cost: row.service_cost != null ? Number(row.service_cost) : null,
      is_active: row.is_active,
      currency: row.currency,
    });
    setReplacementStr(String(Math.round(Number(row.replacement_cost))));
    setServiceStr(
      row.service_cost != null ? String(Math.round(Number(row.service_cost))) : '',
    );
    setDialogOpen(true);
  };

  const applySuggestion = (type: string, label: string) => {
    setForm((f) => ({
      ...f,
      component_type: type,
      label: f.label.trim() ? f.label : label,
    }));
  };

  const handleSave = async () => {
    const replacement = parseMoney(replacementStr);
    if (replacement == null || replacement < 0) {
      toast.error('Ange en giltig byteskostnad (≥ 0)');
      return;
    }
    const service = serviceStr.trim() === '' ? null : parseMoney(serviceStr);
    if (serviceStr.trim() !== '' && (service == null || service < 0)) {
      toast.error('Servicekostnad måste vara ett giltigt belopp');
      return;
    }

    const payload: UnitPriceInput = {
      component_type: form.component_type.trim(),
      label: form.label.trim(),
      replacement_cost: replacement,
      service_cost: service,
      is_active: form.is_active ?? true,
    };

    if (!payload.component_type || !payload.label) {
      toast.error('Fyll i typ och namn');
      return;
    }

    try {
      if (editing) {
        await updatePrice.mutateAsync({ id: editing.id, patch: payload });
        toast.success('Ápris uppdaterat');
      } else {
        await createPrice.mutateAsync(payload);
        toast.success('Ápris tillagt');
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte spara');
    }
  };

  const handleToggleActive = async (row: UnitPrice) => {
    if (!canEdit) return;
    try {
      await updatePrice.mutateAsync({
        id: row.id,
        patch: { is_active: !row.is_active },
      });
      toast.success(row.is_active ? 'Inaktiverat' : 'Aktiverat');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte uppdatera');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePrice.mutateAsync(deleteTarget.id);
      toast.success('Ápris borttaget');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte ta bort');
    }
  };

  const saving = createPrice.isPending || updatePrice.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Áprislista</CardTitle>
          <CardDescription className="text-destructive">
            Kunde inte ladda prislistan. Kontrollera att migrationen
            <code className="mx-1 text-xs">component_unit_prices</code>
            är körd i Supabase.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Tags className="h-5 w-5 text-primary" />
              <CardTitle>Áprislista</CardTitle>
            </div>
            <CardDescription>
              Ungefärliga bytes- och servicekostnader per komponenttyp. Används när
              underhållsplaner genereras (före inköpskostnad per enskild komponent).
              Typkoden måste matcha fältet <strong>typ</strong> på komponenten (t.ex.{' '}
              <code className="text-xs">SC4.7</code> eller <code className="text-xs">entréparti</code>).
            </CardDescription>
          </div>
          {canEdit && (
            <Button onClick={openCreate} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Lägg till pris
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök typ eller namn…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Visa inaktiva
            </label>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Exempel: lägg till typ <strong>entréparti</strong> med byteskostnad{' '}
              <strong>100 000 kr</strong>. När en komponent med typen{' '}
              <code className="text-xs">entréparti</code> ingår i underhållsplanen
              används det priset automatiskt.
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground space-y-3">
              <p>
                {prices.length === 0
                  ? 'Ingen áprislista ännu. Lägg till t.ex. entréparti, värmepump eller SC-koder.'
                  : 'Inga rader matchar filtret.'}
              </p>
              {canEdit && prices.length === 0 && (
                <Button variant="outline" onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Skapa första ápriset
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Namn</TableHead>
                    <TableHead>Typkod</TableHead>
                    <TableHead className="text-right">Byte</TableHead>
                    <TableHead className="text-right">Service</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead className="text-right">Åtgärder</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(!row.is_active && 'opacity-60')}
                    >
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {row.component_type}
                        </code>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSek(Number(row.replacement_cost))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatSek(
                          row.service_cost != null ? Number(row.service_cost) : null,
                        )}
                      </TableCell>
                      <TableCell>
                        {row.is_active ? (
                          <Badge variant="default" className="font-normal">
                            Aktiv
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-normal">
                            Inaktiv
                          </Badge>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-2">
                            <Switch
                              checked={row.is_active}
                              onCheckedChange={() => handleToggleActive(row)}
                              title={row.is_active ? 'Inaktivera' : 'Aktivera'}
                              aria-label={row.is_active ? 'Inaktivera' : 'Aktivera'}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Redigera"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ta bort"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {prices.filter((p) => p.is_active).length} aktiva · {prices.length} totalt
            {!canEdit && ' · Endast ägare/admin kan ändra prislistan'}
          </p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Redigera ápris' : 'Lägg till ápris'}
            </DialogTitle>
            <DialogDescription>
              Koppla en ungefärlig kostnad till en komponenttyp som används i
              underhållsplanen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {!editing && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">
                  Förslag (fyller typ + namn)
                </Label>
                <Select
                  onValueChange={(v) => {
                    const s = UNIT_PRICE_TYPE_SUGGESTIONS.find((x) => x.type === v);
                    if (s) applySuggestion(s.type, s.label);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj förslag…" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_PRICE_TYPE_SUGGESTIONS.map((s) => (
                      <SelectItem key={s.type} value={s.type}>
                        {s.label} ({s.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="up-label">Namn / etikett</Label>
              <Input
                id="up-label"
                placeholder="t.ex. Entréparti"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="up-type">Typkod (matchar komponent.typ)</Label>
              <Input
                id="up-type"
                placeholder="t.ex. entréparti eller SC4.7"
                value={form.component_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, component_type: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="up-replace">Byteskostnad (kr)</Label>
                <Input
                  id="up-replace"
                  inputMode="decimal"
                  placeholder="100000"
                  value={replacementStr}
                  onChange={(e) => setReplacementStr(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="up-service">Servicekostnad (kr)</Label>
                <Input
                  id="up-service"
                  inputMode="decimal"
                  placeholder="Valfritt"
                  value={serviceStr}
                  onChange={(e) => setServiceStr(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Aktiv</div>
                <div className="text-xs text-muted-foreground">
                  Inaktiva priser används inte vid plangenerering
                </div>
              </div>
              <Switch
                checked={form.is_active ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSave} disabled={saving || !canEdit}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Spara ändringar' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort ápris?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{deleteTarget.label}</strong> (
                  <code>{deleteTarget.component_type}</code>) tas bort permanent.
                  Befintliga sparade underhållsplaner behåller sina snapshot-kostnader.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePrice.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
