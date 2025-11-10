import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Compass, Sparkles, MapPin, Layers, Trash2, MoreVertical, Search, Filter, Wrench, FileText, StickyNote, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getEnergyGradeColor } from '@/lib/energyUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyFilterChips } from '@/components/PropertyFilterChips';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAuth } from '@/hooks/useAuth';
import { z } from 'zod';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';

const propertySchema = z.object({
  name: z.string().trim().min(1, 'Namn är obligatoriskt').max(200, 'Namn får vara max 200 tecken'),
  address: z.string().max(500, 'Adress får vara max 500 tecken').optional().or(z.literal('')),
  description: z.string().max(2000, 'Beskrivning får vara max 2000 tecken').optional().or(z.literal('')),
});

interface Property {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  area_sqm: number | null;
  construction_year: number | null;
  property_type: string | null;
  loa: string | null;
  property_number: string | null;
  invoice_address: string | null;
  floors?: any[];
  energy_grade?: string | null;
}

const Properties = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Array<{ id: string; label: string; value: any }>>([]);
  const [filterType, setFilterType] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const { toast } = useToast();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        floors (
          id,
          name,
          level
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Fel vid hämtning',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      // Fetch energy grades for all properties
      if (data) {
        const propertiesWithEnergyGrades = await Promise.all(
          data.map(async (property) => {
            const { data: historyData } = await supabase
              .from('property_energy_history')
              .select('energy_grade')
              .eq('property_id', property.id)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            return {
              ...property,
              energy_grade: historyData?.energy_grade || null
            };
          })
        );
        setProperties(propertiesWithEnergyGrades);
      } else {
        setProperties([]);
      }
    }
    setLoading(false);
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate input data
      propertySchema.parse({
        name,
        address: address || '',
        description: description || '',
      });

      const { error } = await supabase
        .from('properties')
        .insert([{ 
          name: name.trim(), 
          address: address.trim() || null, 
          description: description.trim() || null, 
          owner_id: user?.id 
        }]);

      if (error) {
        toast({
          title: 'Fel vid skapande',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Fastighet skapad!',
          description: `${name} har lagts till.`,
        });
        setDialogOpen(false);
        setName('');
        setAddress('');
        setDescription('');
        fetchProperties();
      }
    } catch (error: any) {
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        toast({
          title: 'Valideringsfel',
          description: firstError.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Fel',
          description: error.message,
          variant: 'destructive',
        });
      }
    }
  };

  const handleDeleteProperty = async () => {
    if (!propertyToDelete) return;

    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', propertyToDelete.id);

    if (error) {
      toast({
        title: 'Fel vid borttagning',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Fastighet borttagen',
        description: `${propertyToDelete.name} har tagits bort.`,
      });
      setDeleteDialogOpen(false);
      setPropertyToDelete(null);
      fetchProperties();
    }
  };

  const addFilter = () => {
    if (!filterType || !filterValue) return;
    
    const filterLabels: Record<string, string> = {
      property_type: 'Typ',
      construction_year: 'Byggår',
      area_sqm: 'Area',
    };

    setFilters([
      ...filters,
      {
        id: `${filterType}-${filterValue}`,
        label: `${filterLabels[filterType]}: ${filterValue}`,
        value: { type: filterType, value: filterValue },
      },
    ]);
    setFilterType('');
    setFilterValue('');
  };

  const removeFilter = (filterId: string) => {
    setFilters(filters.filter((f) => f.id !== filterId));
  };

  const clearAllFilters = () => {
    setFilters([]);
  };

  const filteredProperties = properties.filter((property) => {
    // Text search
    const matchesSearch =
      property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.description?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Apply filters
    return filters.every((filter) => {
      const { type, value } = filter.value;
      switch (type) {
        case 'property_type':
          return property.property_type?.toLowerCase().includes(value.toLowerCase());
        case 'construction_year':
          return property.construction_year?.toString() === value;
        case 'area_sqm':
          return property.area_sqm && property.area_sqm >= parseInt(value);
        default:
          return true;
      }
    });
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Modern Header */}
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger className="hover:bg-muted rounded-md p-2 transition-colors" />
              
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-semibold">Fastigheter</h1>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-medium">{properties.length} fastigheter</span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="container mx-auto px-6 py-8">
              {/* Stats Bar */}
              <div className="grid gap-4 md:grid-cols-3 mb-8 animate-fade-in">
                <Card className="border-border/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 hover-scale">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Totalt fastigheter</p>
                        <p className="text-3xl font-bold">{properties.length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-500/20">
                        <Building2 className="h-6 w-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-gradient-to-br from-green-500/10 to-green-600/5 hover-scale">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Med ritningar</p>
                        <p className="text-3xl font-bold">{properties.filter(p => p.floors && p.floors.length > 0).length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-500/20">
                        <MapPin className="h-6 w-6 text-green-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5 hover-scale">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Totalt våningar</p>
                        <p className="text-3xl font-bold">
                          {properties.reduce((acc, p) => acc + (p.floors?.length || 0), 0)}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-purple-500/20">
                        <Layers className="h-6 w-6 text-purple-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Search and Filter Bar */}
              <div className="space-y-4 mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">{filteredProperties.length} fastigheter</h2>
                    <p className="text-muted-foreground">
                      Hantera dina tilldelade fastigheter
                    </p>
                  </div>
                  
                  <div className="flex gap-3 items-center flex-wrap">
                    <div className="relative w-full md:w-96">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Sök fastigheter..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon">
                          <Filter className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <div className="p-4 space-y-4">
                          <div className="space-y-2">
                            <Label>Filtertyp</Label>
                            <Select value={filterType} onValueChange={setFilterType}>
                              <SelectTrigger>
                                <SelectValue placeholder="Välj filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="property_type">Typ</SelectItem>
                                <SelectItem value="construction_year">Byggår</SelectItem>
                                <SelectItem value="area_sqm">Min area (m²)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {filterType && (
                            <div className="space-y-2">
                              <Label>Värde</Label>
                              <Input
                                placeholder={
                                  filterType === 'area_sqm'
                                    ? 't.ex. 100'
                                    : filterType === 'construction_year'
                                    ? 't.ex. 2020'
                                    : 't.ex. Kontor'
                                }
                                value={filterValue}
                                onChange={(e) => setFilterValue(e.target.value)}
                              />
                            </div>
                          )}
                          
                          <Button
                            className="w-full"
                            onClick={addFilter}
                            disabled={!filterType || !filterValue}
                          >
                            Lägg till filter
                          </Button>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                
                <PropertyFilterChips
                  filters={filters}
                  onRemoveFilter={removeFilter}
                  onClearAll={clearAllFilters}
                />
              </div>

              {/* Page Actions */}
              <div className="flex justify-between items-center mb-8">
                <div className="flex gap-1 border border-border rounded-lg p-1">
                  <Button
                    variant={viewMode === "cards" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("cards")}
                    className="h-8"
                  >
                    <LayoutGrid className="h-4 w-4 mr-2" />
                    Kort
                  </Button>
                  <Button
                    variant={viewMode === "table" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("table")}
                    className="h-8"
                  >
                    <TableIcon className="h-4 w-4 mr-2" />
                    Tabell
                  </Button>
                </div>
                
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="gap-2">
                      <Plus className="h-5 w-5" />
                      Ny Fastighet
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]" aria-describedby="create-property-description">
                    <DialogHeader>
                      <DialogTitle>Skapa ny fastighet</DialogTitle>
                      <DialogDescription id="create-property-description" className="sr-only">
                        Formulär för att skapa en ny fastighet i systemet
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateProperty} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Namn <span className="text-destructive">*</span></Label>
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="T.ex. Storgatan 1"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address">Adress</Label>
                        <Input
                          id="address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="T.ex. Storgatan 1, 123 45 Stockholm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Beskrivning</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Valfri beskrivning..."
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                          Avbryt
                        </Button>
                        <Button type="submit" className="flex-1">
                          Skapa fastighet
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Properties Grid */}
              {filteredProperties.length === 0 && searchQuery === '' && filters.length === 0 ? (
                <Card className="border-dashed animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Building2 className="h-10 w-10 text-primary" />
                    </div>
                    <CardTitle className="mb-2 text-2xl">Inga fastigheter än</CardTitle>
                    <CardDescription className="text-base mb-6 text-center max-w-md">
                      Kom igång genom att skapa din första fastighet och börja hantera dina ritningar
                    </CardDescription>
                    <Button onClick={() => setDialogOpen(true)} size="lg" className="gap-2">
                      <Plus className="h-5 w-5" />
                      Skapa din första fastighet
                    </Button>
                  </CardContent>
                </Card>
              ) : filteredProperties.length === 0 ? (
                <Card className="border-dashed animate-fade-in">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted-foreground mb-4">Inga fastigheter matchar dina filter</p>
                    <Button variant="outline" onClick={clearAllFilters}>
                      Rensa filter
                    </Button>
                  </CardContent>
                </Card>
              ) : viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  {filteredProperties.map((property, index) => (
                    <Card 
                      key={property.id} 
                      className="group cursor-pointer border-border card-hover animate-scale-in"
                      style={{ animationDelay: `${0.05 * index}s` }}
                      onClick={() => navigate(`/property/${property.id}`)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            {property.energy_grade && (
                              <Badge 
                                className={`${getEnergyGradeColor(property.energy_grade).bg} ${getEnergyGradeColor(property.energy_grade).text} ${getEnergyGradeColor(property.energy_grade).border} border font-bold text-xs px-2 py-0.5`}
                              >
                                {property.energy_grade}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/property/${property.id}`);
                              }}
                            >
                              <span className="sr-only">Redigera</span>
                              ✏️
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPropertyToDelete(property);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          {property.name}
                        </CardTitle>
                        {property.property_number && (
                          <CardDescription className="text-primary/80 font-mono text-sm">
                            {property.property_number}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {property.address && (
                          <div className="flex items-start gap-2 text-sm">
                            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">{property.address}</span>
                          </div>
                        )}
                        {property.construction_year && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">📅</span>
                            <span className="text-muted-foreground">Byggår: {property.construction_year}</span>
                          </div>
                        )}
                        {property.property_type && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Typ: </span>
                            <span className="text-foreground">{property.property_type}</span>
                          </div>
                        )}
                        {property.loa && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">LOA: </span>
                            <span className="text-foreground">{property.loa} m²</span>
                          </div>
                        )}
                        {property.area_sqm && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Area: </span>
                            <span className="text-foreground">{property.area_sqm} m²</span>
                          </div>
                        )}
                        <div className="pt-3 mt-3 border-t border-border/50">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 gap-1.5 min-w-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/work-orders', { state: { propertyId: property.id } });
                              }}
                            >
                              <Wrench className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">Arbetsorder</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 gap-1.5 min-w-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/property/${property.id}?tab=drawings`);
                              }}
                            >
                              <Layers className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">Ritningar</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 gap-1.5 min-w-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/property/${property.id}?tab=notes`);
                              }}
                            >
                              <StickyNote className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">Anteckn.</span>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b text-sm text-muted-foreground">
                            <th className="text-left py-3 px-4 font-medium">Fastighet</th>
                            <th className="text-left py-3 px-4 font-medium">Adress</th>
                            <th className="text-left py-3 px-4 font-medium">Typ</th>
                            <th className="text-left py-3 px-4 font-medium">Byggår</th>
                            <th className="text-left py-3 px-4 font-medium">Energiklass</th>
                            <th className="text-left py-3 px-4 font-medium">Åtgärder</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProperties.map((property) => (
                            <tr 
                              key={property.id} 
                              className="border-b hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(`/property/${property.id}`)}
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-primary" />
                                  <div>
                                    <div className="font-medium">{property.name}</div>
                                    {property.property_number && (
                                      <div className="text-xs text-muted-foreground font-mono">
                                        {property.property_number}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {property.address ? (
                                  <div className="flex items-center gap-2 text-sm">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <span>{property.address}</span>
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="py-3 px-4 text-sm">{property.property_type || '-'}</td>
                              <td className="py-3 px-4 text-sm">{property.construction_year || '-'}</td>
                              <td className="py-3 px-4">
                                {property.energy_grade ? (
                                  <Badge 
                                    className={`${getEnergyGradeColor(property.energy_grade).bg} ${getEnergyGradeColor(property.energy_grade).text} ${getEnergyGradeColor(property.energy_grade).border} border font-bold text-xs px-2 py-0.5`}
                                  >
                                    {property.energy_grade}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/property/${property.id}`);
                                    }}
                                  >
                                    <span>✏️</span>
                                  </Button>
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
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort fastighet?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort "{propertyToDelete?.name}"? 
              Detta kommer även ta bort alla våningar, ritningar och komponenter. 
              Åtgärden kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteProperty}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default Properties;
