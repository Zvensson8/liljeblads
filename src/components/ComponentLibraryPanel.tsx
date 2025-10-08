import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useComponentLibrary } from '@/hooks/useComponentLibrary';
import { ScrollArea } from './ui/scroll-area';
import { AddCustomComponentDialog } from './AddCustomComponentDialog';
import { Plus, X } from 'lucide-react';

interface ComponentLibraryPanelProps {
  onSelectTemplate: (template: any) => void;
}

export const ComponentLibraryPanel = ({ onSelectTemplate }: ComponentLibraryPanelProps) => {
  const { templates, addCustomTemplate, removeCustomTemplate } = useComponentLibrary();
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <>
      <Card className="w-64 h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Komponentbibliotek</CardTitle>
              <CardDescription>Klicka för att lägga till</CardDescription>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowAddDialog(true)}
              className="h-8 w-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-2 p-4">
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
