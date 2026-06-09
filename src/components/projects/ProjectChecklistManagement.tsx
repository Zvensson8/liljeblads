import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLogProjectActivity } from "@/hooks/useProjectActivityLog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { CheckCircle2, Circle, Calendar, Plus, ListTodo, CalendarIcon, ChevronDown, ChevronRight, AlertCircle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  deadline: string | null;
  responsible: string | null;
  order_index: number;
  category: string | null;
  priority: string | null;
}

interface ProjectChecklistManagementProps {
  projectId: string;
  propertyId: string;
}

const categoryConfig: Record<string, { label: string; order: number }> = {
  planning: { label: "Planering", order: 1 },
  execution: { label: "Genomförande", order: 2 },
  closing: { label: "Avslut", order: 3 },
  uncategorized: { label: "Okategoriserade", order: 4 },
};

const priorityConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  high: { label: "Hög", icon: <ArrowUp className="h-3 w-3" />, className: "text-red-600 bg-red-100" },
  normal: { label: "Normal", icon: <ArrowRight className="h-3 w-3" />, className: "text-gray-600 bg-gray-100" },
  low: { label: "Låg", icon: <ArrowDown className="h-3 w-3" />, className: "text-blue-600 bg-blue-100" },
};

export function ProjectChecklistManagement({
  projectId,
  propertyId,
}: ProjectChecklistManagementProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const logActivity = useLogProjectActivity();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResponsible, setNewResponsible] = useState("");
  const [newDeadline, setNewDeadline] = useState<Date>();
  const [newCategory, setNewCategory] = useState<string>("uncategorized");
  const [newPriority, setNewPriority] = useState<string>("normal");
  const [submitting, setSubmitting] = useState(false);
  const [existingTodos, setExistingTodos] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    planning: true,
    execution: true,
    closing: true,
    uncategorized: true,
  });

  useEffect(() => {
    fetchChecklistItems();
    fetchExistingTodos();
  }, [projectId, propertyId]);

  const fetchChecklistItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_checklist_items")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta checklista");
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingTodos = async () => {
    try {
      const { data, error } = await supabase
        .from("property_todos")
        .select("title")
        .eq("property_id", propertyId)
        .eq("completed", false);

      if (error) throw error;
      setExistingTodos(data?.map(todo => todo.title) || []);
    } catch (error: any) {
      console.error("Kunde inte hämta todos:", error);
    }
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, ChecklistItem[]> = {
      planning: [],
      execution: [],
      closing: [],
      uncategorized: [],
    };

    items.forEach(item => {
      const category = item.category || "uncategorized";
      if (groups[category]) {
        groups[category].push(item);
      } else {
        groups.uncategorized.push(item);
      }
    });

    // Sort by priority within each category
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
        return aPriority - bPriority;
      });
    });

    return groups;
  }, [items]);

  const handleToggleComplete = async (item: ChecklistItem) => {
    try {
      const { error } = await supabase
        .from("project_checklist_items")
        .update({
          completed: !item.completed,
          completed_at: !item.completed ? new Date().toISOString() : null,
        })
        .eq("id", item.id);

      if (error) throw error;

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, completed: !i.completed } : i
        )
      );

      await logActivity.mutateAsync({
        project_id: projectId,
        activity_type: "checklist_update",
        description: `Checklistpunkt "${item.title}" markerad som ${!item.completed ? "klar" : "ej klar"}`,
      });

      toast.success(
        !item.completed ? "Markerad som klar" : "Markerad som ej klar"
      );
    } catch (error: any) {
      toast.error("Kunde inte uppdatera checklista");
    }
  };

  const handleAddItem = async () => {
    if (!newTitle.trim()) {
      toast.error("Titel krävs");
      return;
    }

    setSubmitting(true);
    try {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order_index)) : 0;
      
      const { data, error } = await supabase
        .from("project_checklist_items")
        .insert({
          project_id: projectId,
          title: newTitle,
          description: newDescription || null,
          responsible: newResponsible || null,
          deadline: newDeadline ? newDeadline.toISOString().split("T")[0] : null,
          order_index: maxOrder + 1,
          completed: false,
          category: newCategory === "uncategorized" ? null : newCategory,
          priority: newPriority,
        })
        .select()
        .single();

      if (error) throw error;

      setItems(prev => [...prev, data]);

      await logActivity.mutateAsync({
        project_id: projectId,
        activity_type: "checklist_update",
        description: `Ny checklistpunkt tillagd: "${newTitle}"`,
      });

      toast.success("Checklistpunkt tillagd");
      setAddDialogOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewResponsible("");
      setNewDeadline(undefined);
      setNewCategory("uncategorized");
      setNewPriority("normal");
    } catch (error: any) {
      toast.error("Kunde inte lägga till checklistpunkt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToPropertyTodos = async (item: ChecklistItem) => {
    try {
      if (!user) throw new Error("Not authenticated");



      const { error } = await supabase
        .from("property_todos")
        .insert({
          property_id: propertyId,
          title: item.title,
          due_date: item.deadline,
          completed: false,
          user_id: user.id,
        });

      if (error) throw error;

      toast.success("Tillagd i att göra-listan");
      fetchExistingTodos();
    } catch (error: any) {
      toast.error("Kunde inte lägga till i att göra-listan");
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const isTodoAlreadyAdded = (title: string) => {
    return existingTodos.includes(title);
  };

  const isOverdue = (deadline: string | null, completed: boolean) => {
    if (!deadline || completed) return false;
    return new Date(deadline) < new Date();
  };

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const renderChecklistItem = (item: ChecklistItem) => (
    <div
      key={item.id}
      className={cn(
        "flex items-start gap-3 p-3 border rounded-lg transition-colors",
        item.completed ? "bg-muted/50" : "bg-background",
        isOverdue(item.deadline, item.completed) && "border-red-300 bg-red-50/50 dark:bg-red-950/20"
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="p-0 h-auto hover:bg-transparent flex-shrink-0 mt-0.5"
        onClick={() => handleToggleComplete(item)}
      >
        {item.completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </Button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "font-medium",
                item.completed && "line-through text-muted-foreground"
              )}
            >
              {item.title}
            </span>
            {item.priority && item.priority !== "normal" && (
              <Badge variant="outline" className={cn("text-xs px-1.5 py-0", priorityConfig[item.priority]?.className)}>
                {priorityConfig[item.priority]?.icon}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOverdue(item.deadline, item.completed) && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Försenad
              </Badge>
            )}
            {item.deadline && !isOverdue(item.deadline, item.completed) && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(item.deadline), "d MMM", { locale: sv })}
              </span>
            )}
          </div>
        </div>

        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {item.responsible && (
            <span className="text-xs text-muted-foreground">
              @{item.responsible}
            </span>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => handleAddToPropertyTodos(item)}
            disabled={item.completed || isTodoAlreadyAdded(item.title)}
          >
            <ListTodo className="h-3 w-3 mr-1" />
            {isTodoAlreadyAdded(item.title) ? "I att-göra" : "Lägg i att-göra"}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderCategorySection = (categoryKey: string, categoryItems: ChecklistItem[]) => {
    const config = categoryConfig[categoryKey];
    const completedInCategory = categoryItems.filter(i => i.completed).length;
    const isExpanded = expandedCategories[categoryKey];

    if (categoryItems.length === 0) return null;

    return (
      <Collapsible
        key={categoryKey}
        open={isExpanded}
        onOpenChange={() => toggleCategory(categoryKey)}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted/80 transition-colors">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="font-medium">{config.label}</span>
            <Badge variant="secondary" className="text-xs">
              {completedInCategory} / {categoryItems.length}
            </Badge>
          </div>
          <Progress 
            value={(completedInCategory / categoryItems.length) * 100} 
            className="w-20 h-1.5"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2 pl-2">
          {categoryItems.map(renderChecklistItem)}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Framsteg</h3>
            <span className="text-sm text-muted-foreground">
              {completedCount} av {totalCount} klara
            </span>
          </div>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till
          </Button>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Grouped Checklist Items */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <Circle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-lg mb-2 text-muted-foreground">Ingen checklista</p>
          <p className="text-sm text-muted-foreground">
            Klicka på "Lägg till" för att skapa din första checklistpunkt
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(categoryConfig)
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([key]) => renderCategorySection(key, groupedItems[key] || []))}
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till checklistpunkt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Titel *</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="T.ex. Granska ritningar"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Kategori</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planering</SelectItem>
                    <SelectItem value="execution">Genomförande</SelectItem>
                    <SelectItem value="closing">Avslut</SelectItem>
                    <SelectItem value="uncategorized">Okategoriserad</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Prioritet</label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      <span className="flex items-center gap-2">
                        <ArrowUp className="h-3 w-3 text-red-600" />
                        Hög
                      </span>
                    </SelectItem>
                    <SelectItem value="normal">
                      <span className="flex items-center gap-2">
                        <ArrowRight className="h-3 w-3 text-gray-600" />
                        Normal
                      </span>
                    </SelectItem>
                    <SelectItem value="low">
                      <span className="flex items-center gap-2">
                        <ArrowDown className="h-3 w-3 text-blue-600" />
                        Låg
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Beskrivning</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Detaljerad beskrivning..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Ansvarig</label>
                <Input
                  value={newResponsible}
                  onChange={(e) => setNewResponsible(e.target.value)}
                  placeholder="Namn"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Deadline</label>
                <Popover modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newDeadline && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newDeadline ? format(newDeadline, "d MMM", { locale: sv }) : "Datum"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[200]" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={newDeadline}
                      onSelect={setNewDeadline}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={submitting}
            >
              Avbryt
            </Button>
            <Button onClick={handleAddItem} disabled={submitting}>
              {submitting ? "Lägger till..." : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
