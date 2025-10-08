import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useComponentLibrary } from '@/hooks/useComponentLibrary';
import { ScrollArea } from './ui/scroll-area';
import { AddCustomComponentDialog } from './AddCustomComponentDialog';
import { Plus, X, Package } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/integrations/supabase/client';

interface ComponentLibraryPanelProps {
  onSelectTemplate: (template: any) => void;
  propertyId?: string;
  onSelectExistingComponent?: (component: any) => void;
}

export const ComponentLibraryPanel = ({ 
  onSelectTemplate, 
  propertyId,
  onSelectExistingComponent 
}: ComponentLibraryPanelProps) => {
  const { templates, addCustomTemplate, removeCustomTemplate } = useComponentLibrary();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [existingComponents, setExistingComponents] = useState<any[]>([]);

  useEffect(() => {
    if (propertyId) {
      loadExistingComponents();
    }
  }, [propertyId]);

  const loadExistingComponents = async () => {
    if (!propertyId) return;

    const { data, error } = await supabase
      .from('components')
      .select(`
        *,
        floors!inner (
          property_id,
          name
        )
      `)
      .eq('floors.property_id', propertyId);

    if (!error && data) {
      setExistingComponents(data);
    }
  };

  return (
    <>
      <Card className="w-64 h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Komponenter</CardTitle>
          <CardDescription>Välj för att placera på ritning</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="templates" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mx-4 mb-2">
              <TabsTrigger value="templates">Mallar</TabsTrigger>
              <TabsTrigger value="existing">Befintliga</TabsTrigger>
            </TabsList>
            
            <TabsContent value="templates" className="mt-0">
              <div className="flex items-center justify-between px-4 pb-2">
                <p className="text-sm text-muted-foreground">Skapa nya</p>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowAddDialog(true)}
                  className="h-8 w-8"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-2 p-4 pt-0">
                  {templates.map((template) => {
                    const Icon = template.icon;
                    return (
                      <div key={template.id} className="relative group">
                        <Button
                          variant="outline"
                          className="w-full justify-start h-auto py-3 hover:border-primary transition-all"
                          onClick={() => onSelectTemplate(template)}
                        >
                          <div className="flex items-start gap-3 w-full">
                            <div 
                              className="p-2 rounded-lg shrink-0" 
                              style={{ backgroundColor: `${template.color}20` }}
                            >
                              <Icon className="h-5 w-5" style={{ color: template.color }} />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <p className="font-medium text-sm">{template.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {template.description}
                              </p>
                            </div>
                          </div>
                        </Button>
                        {template.isCustom && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCustomTemplate(template.id);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="existing" className="mt-0">
              <div className="px-4 pb-2">
                <p className="text-sm text-muted-foreground">Placera befintliga</p>
              </div>
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-2 p-4 pt-0">
                  {existingComponents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Inga komponenter ännu
                    </div>
                  ) : (
                    existingComponents.map((component) => (
                      <Button
                        key={component.id}
                        variant="outline"
                        className="w-full justify-start h-auto py-3 hover:border-primary transition-all"
                        onClick={() => onSelectExistingComponent?.(component)}
                      >
                        <div className="flex items-start gap-3 w-full">
                          <div className="p-2 rounded-lg shrink-0 bg-primary/10">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <p className="font-medium text-sm">{component.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {component.type}
                            </p>
                            {component.floors && (
                              <p className="text-xs text-muted-foreground">
                                {component.floors.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </Button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AddCustomComponentDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={addCustomTemplate}
      />
    </>
  );
};
