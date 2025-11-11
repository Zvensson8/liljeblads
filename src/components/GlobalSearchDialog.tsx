import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Building2, Package, Wrench, Briefcase, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface SearchResult {
  id: string;
  type: "property" | "component" | "work_order" | "project";
  title: string;
  subtitle: string;
  path: string;
}

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const searchData = async () => {
      if (!searchQuery || searchQuery.length < 2 || !user) {
        setResults([]);
        return;
      }

      setLoading(true);
      const allResults: SearchResult[] = [];

      try {
        // Search properties
        const { data: properties } = await supabase
          .from("properties")
          .select("id, name, address, property_number")
          .or(`name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%,property_number.ilike.%${searchQuery}%`)
          .limit(5);

        if (properties) {
          allResults.push(
            ...properties.map((p) => ({
              id: p.id,
              type: "property" as const,
              title: p.name,
              subtitle: p.address || `#${p.property_number || p.id.substring(0, 5)}`,
              path: `/properties/${p.id}`,
            }))
          );
        }

        // Search components (both floor-linked and property-linked)
        const { data: components } = await supabase
          .from("components")
          .select(`
            id, 
            name, 
            type,
            floors:floor_id(
              property_id,
              properties(name)
            ),
            direct_property:property_id(
              id,
              name
            )
          `)
          .ilike("name", `%${searchQuery}%`)
          .limit(5);

        if (components) {
          allResults.push(
            ...components.map((c: any) => {
              const propertyName = c.floors?.properties?.name || c.direct_property?.name || "";
              return {
                id: c.id,
                type: "component" as const,
                title: c.name,
                subtitle: `${c.type}${propertyName ? ` - ${propertyName}` : ""}`,
                path: `/components/${c.id}`,
              };
            })
          );
        }

        // Search work orders
        const { data: workOrders } = await supabase
          .from("work_orders")
          .select("id, action, properties(name)")
          .ilike("action", `%${searchQuery}%`)
          .neq("status", "archived")
          .limit(5);

        if (workOrders) {
          allResults.push(
            ...workOrders.map((w: any) => ({
              id: w.id,
              type: "work_order" as const,
              title: w.action,
              subtitle: w.properties?.name || "",
              path: `/work-orders?id=${w.id}`,
            }))
          );
        }

        // Search projects
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name, project_number, properties(name)")
          .or(`name.ilike.%${searchQuery}%,project_number.ilike.%${searchQuery}%`)
          .eq("is_archived", false)
          .limit(5);

        if (projects) {
          allResults.push(
            ...projects.map((p: any) => ({
              id: p.id,
              type: "project" as const,
              title: p.name,
              subtitle: `${p.project_number} - ${p.properties?.name || ""}`,
              path: `/projects/${p.id}`,
            }))
          );
        }

        setResults(allResults);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchData, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, user]);

  const handleSelect = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "property":
        return <Building2 className="h-4 w-4" />;
      case "component":
        return <Package className="h-4 w-4" />;
      case "work_order":
        return <Wrench className="h-4 w-4" />;
      case "project":
        return <Briefcase className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "property":
        return "Fastighet";
      case "component":
        return "Komponent";
      case "work_order":
        return "Arbetsorder";
      case "project":
        return "Projekt";
      default:
        return "";
    }
  };

  const groupedResults = {
    property: results.filter((r) => r.type === "property"),
    component: results.filter((r) => r.type === "component"),
    work_order: results.filter((r) => r.type === "work_order"),
    project: results.filter((r) => r.type === "project"),
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Sök fastigheter, komponenter, arbetsordrar, projekt..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        {!searchQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Börja skriva för att söka...
          </div>
        )}
        {searchQuery && !loading && results.length === 0 && (
          <CommandEmpty>Inga resultat hittades.</CommandEmpty>
        )}
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Söker...
          </div>
        )}

        {groupedResults.property.length > 0 && (
          <CommandGroup heading="Fastigheter">
            {groupedResults.property.map((result) => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result.path)}
                className="flex items-center gap-3"
              >
                {getIcon(result.type)}
                <div className="flex-1">
                  <div className="font-medium">{result.title}</div>
                  <div className="text-xs text-muted-foreground">{result.subtitle}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.component.length > 0 && (
          <CommandGroup heading="Komponenter">
            {groupedResults.component.map((result) => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result.path)}
                className="flex items-center gap-3"
              >
                {getIcon(result.type)}
                <div className="flex-1">
                  <div className="font-medium">{result.title}</div>
                  <div className="text-xs text-muted-foreground">{result.subtitle}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.work_order.length > 0 && (
          <CommandGroup heading="Arbetsordrar">
            {groupedResults.work_order.map((result) => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result.path)}
                className="flex items-center gap-3"
              >
                {getIcon(result.type)}
                <div className="flex-1">
                  <div className="font-medium">{result.title}</div>
                  <div className="text-xs text-muted-foreground">{result.subtitle}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.project.length > 0 && (
          <CommandGroup heading="Projekt">
            {groupedResults.project.map((result) => (
              <CommandItem
                key={result.id}
                onSelect={() => handleSelect(result.path)}
                className="flex items-center gap-3"
              >
                {getIcon(result.type)}
                <div className="flex-1">
                  <div className="font-medium">{result.title}</div>
                  <div className="text-xs text-muted-foreground">{result.subtitle}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
