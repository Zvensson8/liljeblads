import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useComponentLibrary } from '@/hooks/useComponentLibrary';
import { ScrollArea } from './ui/scroll-area';

interface ComponentLibraryPanelProps {
  onSelectTemplate: (template: any) => void;
}

export const ComponentLibraryPanel = ({ onSelectTemplate }: ComponentLibraryPanelProps) => {
  const { templates } = useComponentLibrary();

  return (
    <Card className="w-64 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Komponentbibliotek</CardTitle>
        <CardDescription>Klicka för att lägga till på ritningen</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-2 p-4">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <Button
                  key={template.id}
                  variant="outline"
                  className="w-full justify-start h-auto py-3 hover:border-primary transition-all"
                  onClick={() => onSelectTemplate(template)}
                >
                  <div className="flex items-start gap-3">
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
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
