import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useComponentLibrary, type ComponentTemplate } from '@/hooks/useComponentLibrary';
import { ScrollArea } from './ui/scroll-area';
import { AddCustomComponentDialog } from './AddCustomComponentDialog';
import { Plus, X, Package, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { supabase } from '@/integrations/supabase/client';

interface ComponentLibraryPanelProps {
  onSelectTemplate: (template: ComponentTemplate) => void;
  propertyId?: string;
  onSelectExistingComponent?: (component: ExistingComponent) => void;
}

interface ExistingComponent {
  id: string;
  name: string;
  type: string;
  manufacturer?: string;
  room_zone?: string | null;
}

export const ComponentLibraryPanel = ({ 
  onSelectTemplate, 
  propertyId,
  onSelectExistingComponent 
}: ComponentLibraryPanelProps) => {
  const { templates, addCustomTemplate, removeCustomTemplate } = useComponentLibrary();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [existingComponents, setExistingComponents] = useState<ExistingComponent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (propertyId) {
      loadExistingComponents();
    }
  }, [propertyId]);

  const loadExistingComponents = async () => {
    if (!propertyId) return;

    const { data, error } = await supabase
      .from('components')
      .select('id, name, type, manufacturer, room_zone')
      .eq('property_id', propertyId);

    if (!error && data) {
      setExistingComponents(data as ExistingComponent[]);
    }
  };

  // Filter components based on search query
  const filteredComponents = existingComponents.filter(comp => 
    comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comp.type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comp.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Card className="w-64 h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Komponenter</CardTitle>
          <CardDescription>Mallar och befintliga i fastigheten</CardDescription>
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
              <div className="px-4 pb-2 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sök komponent..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 text-sm pl-8"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {filteredComponents.length} av {existingComponents.length} komponenter
                </p>
              </div>
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="space-y-2 p-4 pt-0">
                  {existingComponents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Inga komponenter ännu
                    </div>
                  ) : filteredComponents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Inga komponenter matchar sökningen
                    </div>
                  ) : (
                    filteredComponents.map((component) => (
                      <ComponentButton
                        key={component.id}
                        component={component}
                        onSelect={onSelectExistingComponent}
                      />
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

// Separate component for the button to keep things clean
const ComponentButton = ({ 
  component, 
  onSelect 
}: { 
  component: ExistingComponent; 
  onSelect?: (component: ExistingComponent) => void;
}) => (
  <Button
    variant="outline"
    className="w-full justify-start h-auto py-3 hover:border-primary transition-all"
    onClick={() => onSelect?.(component)}
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
        {component.room_zone ? (
          <p className="text-xs text-muted-foreground">
            {component.room_zone}
          </p>
        ) : null}
      </div>
    </div>
  </Button>
);
