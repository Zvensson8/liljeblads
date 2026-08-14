import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Building2,
  Plus,
  MapPin,
  Trash2,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Download,
} from 'lucide-react';
import { createWorkbook, addJsonSheet, downloadWorkbook } from '@/lib/excelUtils';
import { Badge } from '@/components/ui/badge';
import { getEnergyGradeColor } from '@/lib/energyUtils';
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
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { PropertyEditDialog } from '@/components/PropertyEditDialog';
import { EntityListHeader } from '@/components/list/EntityListHeader';
import {
  EntityListEmpty,
  EntityListError,
  EntityListSkeleton,
} from '@/components/list/EntityListState';
import { useListSearchParams } from '@/hooks/useListSearchParams';
import {
  useDeleteProperty,
  useProperties,
  type Property,
} from '@/hooks/useProperties';
import { filterProperties, uniquePropertyTypes } from '@/lib/propertiesListFilter';
import { propertyPath } from '@/lib/entityPaths';
import { propertyService } from '@/services/supabase';
import { cn } from '@/lib/utils';

const LIST_DEFAULTS = { q: '', type: 'all' };

export default function Properties() {
  const navigate = useNavigate();
  const [params, setParam] = useListSearchParams(LIST_DEFAULTS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const { data: properties = [], isLoading, isError, refetch } = useProperties();
  const deleteProperty = useDeleteProperty();

  const types = useMemo(() => uniquePropertyTypes(properties), [properties]);
  const filteredProperties = useMemo(
    () =>
      filterProperties(properties, {
        searchQuery: params.q,
        typeFilter: params.type,
      }),
    [properties, params.q, params.type],
  );

  const handleDeleteProperty = async () => {
    if (!propertyToDelete) return;
    try {
      const deps = await propertyService.countDependents(propertyToDelete.id);
      const total = deps.components + deps.workOrders + deps.projects;
      if (total > 0) {
        toast.error(
          `Kan inte ta bort — ${deps.components} komponenter, ${deps.workOrders} arbetsordrar, ${deps.projects} projekt.`,
        );
        return;
      }
      await deleteProperty.mutateAsync(propertyToDelete.id);
      setDeleteDialogOpen(false);
      setPropertyToDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte ta bort');
    }
  };

  const handleExportXlsx = async () => {
    try {
      const wb = createWorkbook();
      const data = filteredProperties.map((p) => ({
        Namn: p.name,
        Adress: p.address || '-',
        Typ: p.property_type || '-',
        Byggår: p.construction_year || '-',
        'Area (m²)': p.area_sqm || '-',
        LOA: p.loa || '-',
        Fastighetsbeteckning: p.property_number || '-',
        Fakturaadress: p.invoice_address || '-',
        Energiklass: p.energy_grade || '-',
        Beskrivning: p.description || '-',
      }));
      addJsonSheet(wb, 'Fastigheter', data);
      await downloadWorkbook(
        wb,
        `Fastigheter_${new Date().toISOString().split('T')[0]}.xlsx`,
      );
      toast.success(`${data.length} fastigheter exporterade`);
    } catch {
      toast.error('Kunde inte skapa Excel-fil');
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col w-full">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 md:px-6">
            <div className="flex h-14 md:h-16 items-center gap-2 md:gap-4">
              <SidebarTrigger className="hidden md:flex" />
              <EntityListHeader
                icon={<Building2 className="h-5 w-5 text-primary shrink-0" />}
                title="Fastigheter"
                actions={
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void handleExportXlsx()}
                      disabled={filteredProperties.length === 0}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Exportera XLSX
                    </Button>
                    <Button onClick={() => setDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Ny fastighet
                    </Button>
                  </>
                }
              />
            </div>
          </header>

          <main className="flex-1 overflow-auto pb-20 md:pb-0">
            <div className="container mx-auto px-4 md:px-6 py-4 md:py-8 space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sök namn, adress eller beteckning…"
                    className="pl-10"
                    value={params.q}
                    onChange={(e) => setParam('q', e.target.value)}
                  />
                </div>
                <div className="flex gap-1 border border-border rounded-lg p-1 self-start">
                  <Button
                    variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8"
                    onClick={() => setViewMode('cards')}
                  >
                    <LayoutGrid className="h-4 w-4 mr-2" />
                    Kort
                  </Button>
                  <Button
                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8"
                    onClick={() => setViewMode('table')}
                  >
                    <TableIcon className="h-4 w-4 mr-2" />
                    Tabell
                  </Button>
                </div>
              </div>

              {types.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={params.type === 'all' ? 'default' : 'outline'}
                    className="h-8"
                    onClick={() => setParam('type', 'all')}
                  >
                    Alla
                  </Button>
                  {types.map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={params.type === t ? 'default' : 'outline'}
                      className="h-8"
                      onClick={() => setParam('type', t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              )}

              {isLoading ? (
                <EntityListSkeleton />
              ) : isError ? (
                <EntityListError onRetry={() => void refetch()} />
              ) : filteredProperties.length === 0 && !params.q && params.type === 'all' ? (
                <EntityListEmpty
                  title="Inga fastigheter än"
                  description="Skapa den första så du kan lägga komponenter och arbetsordrar på den."
                  action={
                    <Button onClick={() => setDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Ny fastighet
                    </Button>
                  }
                />
              ) : filteredProperties.length === 0 ? (
                <EntityListEmpty
                  title="Inget matchar"
                  description="Prova ett annat sökord eller typ."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setParam('q', '');
                        setParam('type', 'all');
                      }}
                    >
                      Rensa filter
                    </Button>
                  }
                />
              ) : viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProperties.map((property) => (
                    <Card
                      key={property.id}
                      className="group cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => navigate(propertyPath(property.id))}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg group-hover:text-primary transition-colors">
                            {property.name}
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPropertyToDelete(property);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {property.energy_grade && (
                            <Badge
                              className={cn(
                                getEnergyGradeColor(property.energy_grade).bg,
                                getEnergyGradeColor(property.energy_grade).text,
                                getEnergyGradeColor(property.energy_grade).border,
                                'border font-bold text-xs',
                              )}
                            >
                              {property.energy_grade}
                            </Badge>
                          )}
                          {property.property_type && (
                            <Badge variant="outline">{property.property_type}</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 pt-0">
                        {property.address && (
                          <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                            {property.address}
                          </div>
                        )}
                        {property.property_number && (
                          <CardDescription className="font-mono text-xs">
                            {property.property_number}
                          </CardDescription>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-sm text-muted-foreground">
                          <th className="text-left py-3 px-4 font-medium">Fastighet</th>
                          <th className="text-left py-3 px-4 font-medium">Adress</th>
                          <th className="text-left py-3 px-4 font-medium">Typ</th>
                          <th className="text-left py-3 px-4 font-medium">Energi</th>
                          <th className="text-left py-3 px-4 font-medium">Åtgärder</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProperties.map((property) => (
                          <tr
                            key={property.id}
                            className="border-b hover:bg-muted/50 cursor-pointer"
                            onClick={() => navigate(propertyPath(property.id))}
                          >
                            <td className="py-3 px-4 font-medium">{property.name}</td>
                            <td className="py-3 px-4 text-sm text-muted-foreground">
                              {property.address || '—'}
                            </td>
                            <td className="py-3 px-4 text-sm">
                              {property.property_type || '—'}
                            </td>
                            <td className="py-3 px-4">
                              {property.energy_grade || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPropertyToDelete(property);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>

      <PropertyEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        property={null}
        onSuccess={() => setDialogOpen(false)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort fastighet?</AlertDialogTitle>
            <AlertDialogDescription>
              “{propertyToDelete?.name}” tas bort bara om den saknar komponenter,
              arbetsordrar och projekt. Annars behåll den — det går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteProperty()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
