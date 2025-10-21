import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { format, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarIcon, Clock, Wrench } from "lucide-react";

interface PropertyMaintenancePlanProps {
  propertyId: string;
}

interface MaintenanceEvent {
  id: string;
  component_name: string;
  component_type: string;
  next_service_date: Date;
  service_interval_months: number;
}

export function PropertyMaintenancePlan({ propertyId }: PropertyMaintenancePlanProps) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<MaintenanceEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedEvents, setSelectedEvents] = useState<MaintenanceEvent[]>([]);

  useEffect(() => {
    fetchMaintenancePlan();
  }, [propertyId]);

  useEffect(() => {
    if (selectedDate) {
      const eventsOnDate = events.filter(e => 
        isSameDay(e.next_service_date, selectedDate)
      );
      setSelectedEvents(eventsOnDate);
    }
  }, [selectedDate, events]);

  const fetchMaintenancePlan = async () => {
    try {
      const compQuery = await supabase
        .from("components")
        .select("id, name, type, next_service_date, installation_year")
        .eq("property_id", propertyId)
        .not("next_service_date", "is", null);
      
      const componentsData = compQuery.data;
      const compError = compQuery.error;

      if (compError || !componentsData) {
        setLoading(false);
        return;
      }

      const maintenanceEvents: MaintenanceEvent[] = componentsData.map((comp: any) => ({
        id: comp.id,
        component_name: comp.name || "Namnlös komponent",
        component_type: comp.type || "Okänd typ",
        next_service_date: new Date(comp.next_service_date!),
        service_interval_months: 12
      }));

      setEvents(maintenanceEvents);
    } catch (error) {
      console.error("Error fetching maintenance plan:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const upcomingEvents = events
    .filter(e => e.next_service_date >= new Date())
    .sort((a, b) => a.next_service_date.getTime() - b.next_service_date.getTime())
    .slice(0, 10);

  const modifiers = {
    maintenance: events.map(e => e.next_service_date)
  };

  const modifiersStyles = {
    maintenance: {
      backgroundColor: "hsl(var(--primary) / 0.3)",
      fontWeight: "bold"
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
      {/* Calendar View */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Underhållskalender
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={sv}
            className="rounded-md border"
            modifiers={modifiers}
            modifiersStyles={modifiersStyles}
          />
          
          {selectedEvents.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-semibold text-sm">
                Planerat för {format(selectedDate!, "d MMMM yyyy", { locale: sv })}:
              </h4>
              {selectedEvents.map(event => (
                <div key={event.id} className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="font-medium">{event.component_name}</div>
                  <div className="text-sm text-muted-foreground">{event.component_type}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Maintenance */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Kommande underhåll
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map(event => {
              const daysUntil = Math.ceil((event.next_service_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const isUrgent = daysUntil <= 30;
              
              return (
                <div 
                  key={event.id} 
                  className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{event.component_name}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        {event.component_type}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Nästa service: </span>
                        <span className="font-medium">
                          {format(event.next_service_date, "d MMMM yyyy", { locale: sv })}
                        </span>
                      </div>
                    </div>
                    <Badge variant={isUrgent ? "destructive" : "secondary"}>
                      {daysUntil} dagar
                    </Badge>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Inget planerat underhåll
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
