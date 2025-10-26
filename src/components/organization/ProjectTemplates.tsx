import { useProjectTemplates } from "@/hooks/useProjectTemplates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProjectTemplatesProps {
  organizationId: string;
}

export const ProjectTemplates = ({ organizationId }: ProjectTemplatesProps) => {
  const { templates, loading } = useProjectTemplates(organizationId);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      investering: "Investering",
      underhall: "Underhåll",
      energi: "Energi",
      annat: "Annat",
    };
    return labels[type] || type;
  };

  if (loading) {
    return <div className="p-8 text-center">Laddar mallar...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Projektmallar</h3>
        <p className="text-sm text-muted-foreground">
          Förinställda mallar för din organisation ({templates.length} st)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <Badge variant="secondary">
                    {getTypeLabel(template.type)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {template.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {template.default_budget && (
                    <div>
                      <span className="text-muted-foreground">Budget:</span>
                      <div className="font-medium">
                        {template.default_budget.toLocaleString("sv-SE")} kr
                      </div>
                    </div>
                  )}
                  {template.estimated_duration_quarters && (
                    <div>
                      <span className="text-muted-foreground">Varaktighet:</span>
                      <div className="font-medium">
                        {template.estimated_duration_quarters} kvartal
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Checklista:</span>
                    <div className="font-medium">
                      {template.checklist_items?.length || 0} punkter
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Kategorier:</span>
                    <div className="font-medium">
                      {template.budget_categories?.length || 0} st
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>Inga mallar tillgängliga.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
