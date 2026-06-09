import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Building2, Package, Wrench, Briefcase, Search, Sparkles, CheckSquare, Calendar, ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAISearch, AISearchResult } from "@/hooks/useAISearch";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";

interface GlobalSearchResult {
  id: string;
  type: "property" | "component" | "work_order" | "project" | "todo" | "drift_task" | "maintenance";
  title: string;
  subtitle: string;
  path: string;
  similarity?: number;
}

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [useAI, setUseAI] = useState(false);
  
  const { search: aiSearch, isSearching: aiSearching, results: aiResults, error: aiError, clearResults } = useAISearch();
  const { data: standardResults = [], isLoading: standardLoading } = useGlobalSearch({
    query: searchQuery,
    enabled: !useAI && open,
  });

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      clearResults();
    }
  }, [open, clearResults]);

  // Convert AI results to standard format
  const convertAIResults = useCallback((aiData: typeof aiResults): GlobalSearchResult[] => {
    if (!aiData) return [];
    
    return aiData.results.map((r: AISearchResult) => {
      let title = "";
      let subtitle = "";
      let path = "";
      let type: GlobalSearchResult["type"] = "component";

      switch (r.source_table) {
        case "properties":
          type = "property";
          title = r.details?.name || r.content.split('.')[0];
          subtitle = r.details?.address || "";
          path = `/properties/${r.source_id}`;
          break;
        case "components":
          type = "component";
          title = r.details?.name || r.content.split('.')[0];
          subtitle = r.details?.property?.name || r.details?.type || "";
          path = `/components/${r.source_id}`;
          break;
        case "work_orders":
          type = "work_order";
          title = r.details?.action || r.content.split('.')[0];
          subtitle = r.details?.component?.property?.name || r.details?.status || "";
          path = `/work-orders?id=${r.source_id}`;
          break;
        case "projects":
          type = "project";
          title = r.details?.name || r.content.split('.')[0];
          subtitle = r.details?.property?.name || r.details?.type || "";
          path = `/projects/${r.source_id}`;
          break;
        case "property_todos":
          type = "todo";
          title = r.details?.title || r.content.split('.')[0];
          subtitle = r.details?.property?.name || r.details?.category || "";
          path = `/properties/${r.details?.property?.id}?tab=todos`;
          break;
        case "drift_tasks":
          type = "drift_task";
          title = r.details?.name || r.content.split('.')[0];
          subtitle = `${r.details?.quarter || ''} ${r.details?.year || ''} - ${r.details?.property?.name || ''}`;
          path = `/operations?property=${r.details?.property?.id}`;
          break;
        case "maintenance_history":
          type = "maintenance";
          title = r.details?.action_type || r.content.split('.')[0];
          subtitle = `${r.details?.performed_date || ''} - ${r.details?.component?.name || ''}`;
          path = `/components/${r.details?.component?.id}`;
          break;
      }

      return {
        id: r.source_id,
        type,
        title,
        subtitle,
        path,
        similarity: r.similarity
      };
    });
  }, []);

  // AI search effect
  useEffect(() => {
    if (!useAI || !searchQuery || searchQuery.length < 2) return;
    
    const debounce = setTimeout(() => {
      aiSearch(searchQuery);
    }, 500);
    
    return () => clearTimeout(debounce);
  }, [searchQuery, useAI, aiSearch]);

  const aiResultsMemo = useMemo(() => {
    if (!useAI || !aiResults) return [];
    return convertAIResults(aiResults);
  }, [useAI, aiResults, convertAIResults]);

  const results = useAI ? aiResultsMemo : standardResults;

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
      case "todo":
        return <CheckSquare className="h-4 w-4" />;
      case "drift_task":
        return <Calendar className="h-4 w-4" />;
      case "maintenance":
        return <ClipboardList className="h-4 w-4" />;
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
      case "todo":
        return "Att göra";
      case "drift_task":
        return "Driftuppgift";
      case "maintenance":
        return "Underhåll";
      default:
        return "";
    }
  };

  const groupedResults = {
    property: results.filter((r) => r.type === "property"),
    component: results.filter((r) => r.type === "component"),
    work_order: results.filter((r) => r.type === "work_order"),
    project: results.filter((r) => r.type === "project"),
    todo: results.filter((r) => r.type === "todo"),
    drift_task: results.filter((r) => r.type === "drift_task"),
    maintenance: results.filter((r) => r.type === "maintenance"),
  };

  const isLoading = useAI ? aiSearching : standardLoading;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2 px-3 border-b">
        <CommandInput
          placeholder={useAI ? "Sök med AI - beskriv vad du letar efter..." : "Sök fastigheter, komponenter, arbetsordrar, projekt..."}
          value={searchQuery}
          onValueChange={setSearchQuery}
          className="flex-1"
        />
        <Toggle
          pressed={useAI}
          onPressedChange={setUseAI}
          size="sm"
          className="shrink-0"
          aria-label="Toggle AI search"
        >
          <Sparkles className={`h-4 w-4 ${useAI ? 'text-primary' : ''}`} />
          <span className="ml-1 text-xs">AI</span>
        </Toggle>
      </div>
      <CommandList>
        {!searchQuery && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {useAI ? (
              <div className="space-y-2">
                <Sparkles className="h-8 w-8 mx-auto text-primary/50" />
                <p>AI-sökning aktiverad</p>
                <p className="text-xs">Beskriv vad du letar efter med egna ord...</p>
              </div>
            ) : (
              "Börja skriva för att söka..."
            )}
          </div>
        )}
        
        {aiError && (
          <div className="py-6 text-center text-sm text-destructive">
            {aiError}
          </div>
        )}
        
        {searchQuery && !isLoading && results.length === 0 && !aiError && (
          <CommandEmpty>
            {useAI ? "Inga AI-resultat hittades. Prova att beskriva på ett annat sätt." : "Inga resultat hittades."}
          </CommandEmpty>
        )}
        
        {isLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {useAI ? (
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 animate-pulse" />
                <span>AI söker...</span>
              </div>
            ) : (
              "Söker..."
            )}
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
                {result.similarity && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(result.similarity * 100)}%
                  </Badge>
                )}
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
                {result.similarity && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(result.similarity * 100)}%
                  </Badge>
                )}
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
                {result.similarity && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(result.similarity * 100)}%
                  </Badge>
                )}
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
                {result.similarity && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(result.similarity * 100)}%
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.todo.length > 0 && (
          <CommandGroup heading="Att göra">
            {groupedResults.todo.map((result) => (
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
                {result.similarity && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(result.similarity * 100)}%
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.drift_task.length > 0 && (
          <CommandGroup heading="Driftuppgifter">
            {groupedResults.drift_task.map((result) => (
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
                {result.similarity && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(result.similarity * 100)}%
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.maintenance.length > 0 && (
          <CommandGroup heading="Underhållshistorik">
            {groupedResults.maintenance.map((result) => (
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
                {result.similarity && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(result.similarity * 100)}%
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
