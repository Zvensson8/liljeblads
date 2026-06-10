import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Link2, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Component {
  id: string;
  name: string;
  type: string;
  serial_number: string | null;
  registration_number: string | null;
  aff_code: string | null;
  room_zone: string | null;
  floor_id: string;
  floor?: {
    name: string;
  };
}

interface ComponentAutoDetectProps {
  propertyId: string;
  onSelectComponent: (component: Component) => void;
}

export function ComponentAutoDetect({
  propertyId,
  onSelectComponent,
}: ComponentAutoDetectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [components, setComponents] = useState<Component[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const debounce = setTimeout(() => {
        searchComponents();
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setComponents([]);
    }
  }, [searchQuery]);

  const searchComponents = async () => {
    setSearching(true);
    try {
      // Fetch floors for the property first
      const { data: floors, error: floorsError } = await supabase
        .from("floors")
        .select("id")
        .eq("property_id", propertyId);

      if (floorsError) throw floorsError;

      const floorIds = floors?.map((f) => f.id) || [];

      if (floorIds.length === 0) {
        setComponents([]);
        return;
      }

      // Search components by name, serial, registration, or aff_code
      const { data, error } = await supabase
        .from("components")
        .select(
          `
          id,
          name,
          type,
          serial_number,
          registration_number,
          aff_code,
          room_zone,
          floor_id,
          floors:floor_id (
            name
          )
        `
        )
        .in("floor_id", floorIds)
        .or(
          `name.ilike.%${searchQuery}%,serial_number.ilike.%${searchQuery}%,registration_number.ilike.%${searchQuery}%,aff_code.ilike.%${searchQuery}%`
        )
        .limit(10);

      if (error) throw error;

      setComponents((data as any) || []);
    } catch (error: unknown) {
      console.error("Error searching components:", error);
      toast.error("Kunde inte söka komponenter");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectComponent = (component: Component) => {
    onSelectComponent(component);
    setSearchQuery("");
    setComponents([]);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="component-search">
          Sök komponent (namn, reg.nr, serie, AFF-kod)
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="component-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Börja skriva för att söka..."
            className="pl-10"
          />
        </div>
      </div>

      {searching && (
        <div className="text-sm text-muted-foreground">Söker...</div>
      )}

      {components.length > 0 && (
        <ScrollArea className="h-[200px] border rounded-lg">
          <div className="p-2 space-y-2">
            {components.map((component) => (
              <div
                key={component.id}
                className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{component.name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {component.type}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {component.registration_number && (
                        <div>Reg.nr: {component.registration_number}</div>
                      )}
                      {component.serial_number && (
                        <div>Serie: {component.serial_number}</div>
                      )}
                      {component.aff_code && (
                        <div>AFF: {component.aff_code}</div>
                      )}
                      {(component.floor?.name || component.room_zone) && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {component.floor?.name}
                          {component.room_zone && ` - ${component.room_zone}`}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSelectComponent(component)}
                  >
                    <Link2 className="w-4 h-4 mr-1" />
                    Välj
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {searchQuery.length >= 2 && !searching && components.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-4">
          Inga komponenter hittades
        </div>
      )}
    </div>
  );
}
