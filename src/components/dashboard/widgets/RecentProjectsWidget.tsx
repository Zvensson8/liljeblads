import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useProjects } from '@/hooks/useProjects';

export const RecentProjectsWidget = () => {
  const { data: allProjects = [], isLoading } = useProjects();
  const navigate = useNavigate();

  const projects = useMemo(
    () =>
      [...allProjects]
        .sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        )
        .slice(0, 3),
    [allProjects],
  );

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      planerat: 'Planerad',
      pagaende: 'Pågående',
      pausat: 'Pausad',
      avslutat: 'Avslutad',
    };
    return labels[status] || status;
  };

  return (
    <Card className="h-full border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-primary" />
          <CardTitle>Senaste projekt</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laddar...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Inga projekt ännu
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((project: any) => (
              <div
                key={project.id}
                className="p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {project.properties?.name}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {getStatusLabel(project.status)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
