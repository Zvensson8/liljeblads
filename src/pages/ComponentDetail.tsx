import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate as useNav } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  Edit,
  Trash2,
  TrendingUp,
  FileText,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Home,
  Building2,
  Wrench,
  ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { ComponentFormDialog } from "@/components/ComponentFormDialog";
import { MaintenanceHistoryDialog } from "@/components/MaintenanceHistoryDialog";
import { ComponentDocuments } from "@/components/component/ComponentDocuments";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useRecentlyVisited } from "@/hooks/useRecentlyVisited";
import { FloorSelector } from "@/components/FloorSelector";
import { QuickServiceButton } from "@/components/QuickServiceButton";
import { ServiceRecordCard } from "@/components/ServiceRecordCard";

interface Component {
  id: string;
  name: string;
  type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  registration_number: string | null;
  room_zone: string | null;
  installation_year: number | null;
  refrigerant_code: string | null;
  refrigerant_amount_kg: number | null;
  refrigerant_type: string | null;
  notes: string | null;
  floor_id: string;
  created_at: string;
  updated_at: string;
}

interface Floor {
  id: string;
  name: string;
  level: number | null;
  property_id: string;
  properties: {
    id: string;
    name: string;
    address: string | null;
  };
}

interface MaintenanceRecord {
  id: string;
  performed_date: string;
  action_type: string;
  cost: number | null;
  expected_cost: number | null;
  supplier: string | null;
  notes: string | null;
  is_warranty: boolean;
  category: string | null;
}

export default function ComponentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [component, setComponent] = useState<Component | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceRecord[]>([]);
  const [componentWorkOrders, setComponentWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const { addRecentItem } = useRecentlyVisited();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (user && id) {
      fetchComponentData();
    }
  }, [user, authLoading, id, navigate]);

  useEffect(() => {
    if (component && floor) {
      addRecentItem({
        id: component.id,
        type: "component",
        title: component.name,
        path: `/components/${component.id}`,
      });
    }
  }, [component, floor]);

  const fetchComponentData = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      // Fetch component with both floor and direct property relationships
      const { data: componentData, error: componentError } = await supabase
        .from("components")
        .select(`
          *,
          floors:floor_id (
            id,
            name,
            level,
            property_id,
            properties:property_id (
              id,
              name,
              address
            )
          ),
          direct_property:property_id (
            id,
            name,
            address
          )
        `)
        .eq("id", id)
        .single();

      if (componentError) throw componentError;
      setComponent(componentData);
      
      // Set floor if it exists, otherwise create a mock floor object from direct property
      if (componentData.floors) {
        setFloor(componentData.floors as any);
      } else if (componentData.direct_property) {
        setFloor({
          id: '',
          name: 'Ingen våning',
          level: null,
          property_id: componentData.direct_property.id,
          properties: componentData.direct_property
        } as any);
      }

      // Fetch maintenance history
      const { data: maintenanceData, error: maintenanceError } = await supabase
        .from("maintenance_history")
        .select("*")
        .eq("component_id", id)
        .order("performed_date", { ascending: false });

      if (maintenanceError) throw maintenanceError;
      setMaintenanceHistory(maintenanceData || []);

      // Fetch work orders linked to this component
      const { data: woData } = await supabase
        .from("work_orders")
        .select("*, properties(id, name)")
        .eq("component_id", id)
        .order("created_at", { ascending: false });
      setComponentWorkOrders(woData || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta komponentdata");
      navigate("/components");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!component || !confirm(`Är du säker på att du vill ta bort ${component.name}?`)) return;

    try {
      const { error } = await supabase
        .from("components")
        .delete()
        .eq("id", component.id);

      if (error) throw error;

      toast.success("Komponent borttagen");
      navigate("/components");
    } catch (error: any) {
      toast.error("Kunde inte ta bort komponent");
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: "Aktiv", className: "bg-green-500", icon: CheckCircle2 },
      maintenance: { label: "Underhåll", className: "bg-yellow-500", icon: AlertTriangle },
      inactive: { label: "Inaktiv", className: "bg-red-500", icon: AlertTriangle },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active;
    const Icon = config.icon;
    return (
      <Badge className={`${config.className} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const totalMaintenanceCost = maintenanceHistory.reduce((sum, record) => sum + (record.cost || 0), 0);
  const totalWorkOrderCost = componentWorkOrders.reduce((sum, wo) => sum + (wo.price || 0), 0);
  const totalCombinedCost = totalMaintenanceCost + totalWorkOrderCost;
  const averageMaintenanceCost = maintenanceHistory.length > 0 
    ? totalMaintenanceCost / maintenanceHistory.length 
    : 0;
  const lastMaintenance = maintenanceHistory[0];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!component || !floor) {
    return null;
  }

  const property = floor.properties;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <Breadcrumb className="py-3">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/" className="flex items-center gap-1">
                    <Home className="h-3 w-3" />
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href={`/properties/${property.id}`} className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {property.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/components">Komponenter</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{component.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex h-12 items-center gap-2 md:gap-4">
            <SidebarTrigger className="hidden md:flex" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/components")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2 flex-1">
              <Package className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">{component.name}</h1>
              {getStatusBadge(component.status)}
            </div>
            <div className="flex items-center gap-2">
              <QuickServiceButton
                componentId={component.id}
                componentName={component.name}
                onSuccess={fetchComponentData}
              />
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Redigera
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Ta bort
              </Button>
            </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Total kostnad
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {totalCombinedCost.toLocaleString("sv-SE")} kr
                    </p>
                    {totalWorkOrderCost > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Underhåll: {totalMaintenanceCost.toLocaleString("sv-SE")} kr · Arbetsordrar: {totalWorkOrderCost.toLocaleString("sv-SE")} kr
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Snitt per tillfälle
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {averageMaintenanceCost.toLocaleString("sv-SE")} kr
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Senaste service
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base font-semibold">
                      {lastMaintenance 
                        ? format(new Date(lastMaintenance.performed_date), "PPP", { locale: sv })
                        : "Ingen service registrerad"
                      }
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Antal åtgärder
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {maintenanceHistory.length}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Main Content Tabs */}
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="maintenance">Underhåll</TabsTrigger>
                  <TabsTrigger value="work-orders">
                    Arbetsordrar{componentWorkOrders.length > 0 && ` (${componentWorkOrders.length})`}
                  </TabsTrigger>
                  <TabsTrigger value="costs">Kostnader</TabsTrigger>
                  <TabsTrigger value="location">Plats</TabsTrigger>
                  <TabsTrigger value="documents">Dokument</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Teknisk information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Komponenttyp</p>
                          <p className="text-base">{component.type}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Registreringsnummer</p>
                          <p className="text-base">{component.registration_number || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Tillverkare</p>
                          <p className="text-base">{component.manufacturer || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Modell</p>
                          <p className="text-base">{component.model || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Serienummer</p>
                          <p className="text-base">{component.serial_number || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Installationsår</p>
                          <p className="text-base">{component.installation_year || "-"}</p>
                        </div>
                        {component.refrigerant_code && (
                          <>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Köldmediekod</p>
                              <p className="text-base">{component.refrigerant_code}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Köldmedietyp</p>
                              <p className="text-base">{component.refrigerant_type || "-"}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Fyllnadsmängd</p>
                              <p className="text-base">
                                {component.refrigerant_amount_kg 
                                  ? `${component.refrigerant_amount_kg} kg`
                                  : "-"
                                }
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {component.notes && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Anteckningar</p>
                          <p className="text-base whitespace-pre-wrap">{component.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="maintenance">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Underhållshistorik</CardTitle>
                        <Button onClick={() => setMaintenanceDialogOpen(true)}>
                          Lägg till åtgärd
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {maintenanceHistory.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Ingen underhållshistorik registrerad</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {maintenanceHistory.map((record) => (
                            <ServiceRecordCard
                              key={record.id}
                              record={record}
                              onUpdate={fetchComponentData}
                              onDelete={fetchComponentData}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="work-orders">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5" />
                        Arbetsordrar kopplade till komponenten
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {componentWorkOrders.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Inga arbetsordrar kopplade till denna komponent</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {componentWorkOrders.map((wo) => (
                            <div
                              key={wo.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(`/work-orders`)}
                            >
                              <div>
                                <p className="font-medium">{wo.action}</p>
                                <p className="text-sm text-muted-foreground">
                                  {wo.status === 'not_started' ? 'Ej påbörjad' : wo.status === 'awaiting_quote' ? 'Inväntar offert' : wo.status === 'ordered' ? 'Beställt' : wo.status === 'completed' ? 'Slutförd' : 'Arkiverad'}
                                  {wo.contractor && ` · ${wo.contractor}`}
                                  {wo.due_date && ` · ${wo.due_date}`}
                                </p>
                              </div>
                              <div className="text-right">
                                {wo.price ? (
                                  <p className="font-semibold">{Number(wo.price).toLocaleString('sv-SE')} kr</p>
                                ) : (
                                  <p className="text-muted-foreground">-</p>
                                )}
                              </div>
                            </div>
                          ))}
                          <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                            <span>Total kostnad arbetsordrar</span>
                            <span>{totalWorkOrderCost.toLocaleString('sv-SE')} kr</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="costs">
                  <Card>
                    <CardHeader>
                      <CardTitle>Kostnadsanalys</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Total kostnad</p>
                            <p className="text-2xl font-bold">
                              {totalMaintenanceCost.toLocaleString("sv-SE")} kr
                            </p>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Genomsnittskostnad per åtgärd</p>
                            <p className="text-2xl font-bold">
                              {averageMaintenanceCost.toLocaleString("sv-SE")} kr
                            </p>
                          </div>
                        </div>

                        <div>
                          <h3 className="font-semibold mb-3">Kostnadsfördelning per kategori</h3>
                          {maintenanceHistory.length > 0 ? (
                            <div className="space-y-2">
                              {Object.entries(
                                maintenanceHistory.reduce((acc, record) => {
                                  const category = record.category || 'Okategoriserad';
                                  acc[category] = (acc[category] || 0) + (record.cost || 0);
                                  return acc;
                                }, {} as Record<string, number>)
                              ).sort(([, a], [, b]) => b - a).map(([category, cost]) => (
                                <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                                  <span className="font-medium">{category}</span>
                                  <span className="font-semibold">{cost.toLocaleString("sv-SE")} kr</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground">Ingen data tillgänglig</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="location">
                  <Card>
                    <CardHeader>
                      <CardTitle>Placering</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Fastighet</p>
                        <p className="text-lg font-semibold">{property.name}</p>
                        {property.address && (
                          <p className="text-sm text-muted-foreground">{property.address}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">Våningsplan</p>
                        <FloorSelector
                          componentId={component.id}
                          propertyId={property.id}
                          currentFloorId={component.floor_id}
                          onSuccess={fetchComponentData}
                        />
                      </div>
                      {component.room_zone && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Rum/Zon</p>
                          <p className="text-base">{component.room_zone}</p>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/property/${property.id}`)}
                      >
                        Visa på ritning
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="documents">
                  <Card>
                    <CardHeader>
                      <CardTitle>Dokument & Rapporter</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ComponentDocuments componentId={component.id} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </SidebarInset>
      </div>

      <ComponentFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        floorId={component.floor_id}
        propertyId={property.id}
        editingComponent={component}
        onSuccess={() => {
          setEditDialogOpen(false);
          fetchComponentData();
        }}
      />

      <MaintenanceHistoryDialog
        componentId={component.id}
        componentName={component.name}
        open={maintenanceDialogOpen}
        onOpenChange={setMaintenanceDialogOpen}
        onSuccess={fetchComponentData}
      />
    </SidebarProvider>
  );
}
