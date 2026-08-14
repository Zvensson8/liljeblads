import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Plus, FolderArchive, Briefcase, Sparkles, Download } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectFormDialog } from '@/components/projects/ProjectFormDialog';
import { ProjectProposals } from '@/components/projects/ProjectProposals';
import { ProjectsFilters } from '@/components/projects/ProjectsFilters';
import {
  ProjectsTable,
  type ProjectsTableProject,
} from '@/components/projects/ProjectsTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { filterAndSortProjects } from '@/lib/projectsListFilter';
import { exportProjectsToExcel } from '@/lib/exportUtils';
import { EntityListHeader } from '@/components/list/EntityListHeader';
import {
  EntityListError,
  EntityListSkeleton,
} from '@/components/list/EntityListState';
import { useListSearchParams } from '@/hooks/useListSearchParams';
import { useProperties } from '@/hooks/useProperties';
import {
  useProject,
  useProjects,
  useUpdateProject,
  type ProjectWithRelations,
  type ProjectStatus,
  type ProjectType,
  type UpdateProjectInput,
} from '@/hooks/useProjects';

const PROJECT_TABS = ['active', 'proposals', 'archived'] as const;
type ProjectTab = (typeof PROJECT_TABS)[number];

const LIST_DEFAULTS = {
  tab: 'active',
  q: '',
  status: 'all',
  type: 'all',
  property: 'all',
};

function asTab(value: string): ProjectTab {
  return (PROJECT_TABS as readonly string[]).includes(value)
    ? (value as ProjectTab)
    : 'active';
}

function propertyName(p: ProjectWithRelations): string {
  return p.property?.name ?? p.properties?.name ?? '—';
}

export default function Projects() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [params, setParam] = useListSearchParams(LIST_DEFAULTS);
  const activeTab = asTab(params.tab);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingProject, setEditingProject] =
    useState<ProjectWithRelations | null>(null);
  const [sortField, setSortField] = useState('updated_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [editingCell, setEditingCell] = useState<{
    projectId: string;
    field: string;
  } | null>(null);
  const [tempValue, setTempValue] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);

  const archivedOnly = activeTab === 'archived';
  const {
    data: projects = [],
    isLoading,
    isError,
    refetch,
  } = useProjects({
    archivedOnly,
    showArchived: archivedOnly,
  });
  const { data: properties = [] } = useProperties();
  const updateProject = useUpdateProject();

  const editId = searchParams.get('edit');
  const { data: editFromUrl } = useProject(editId || undefined);

  useEffect(() => {
    if (!editFromUrl || formDialogOpen) return;
    setEditingProject(editFromUrl);
    setFormDialogOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      },
      { replace: true },
    );
  }, [editFromUrl, formDialogOpen, setSearchParams]);

  const tableProjects = useMemo((): ProjectsTableProject[] => {
    return filterAndSortProjects(
      projects.map((p) => ({
        id: String(p.id),
        project_number: p.project_number ?? '',
        name: p.name ?? '',
        type: p.type as ProjectType,
        status: p.status as ProjectStatus,
        property_id: String(p.property_id),
        year: p.year ?? 0,
        start_quarter: p.start_quarter ?? 0,
        budget: p.budget ?? 0,
        actual_cost: p.actual_cost ?? 0,
        updated_at: p.updated_at ?? '',
        property: { name: propertyName(p) },
        properties: p.properties ?? p.property ?? null,
      })),
      {
        searchQuery: params.q,
        statusFilter: params.status,
        typeFilter: params.type,
        propertyFilter: params.property,
        sortField,
        sortDirection,
      },
    );
  }, [
    projects,
    params.q,
    params.status,
    params.type,
    params.property,
    sortField,
    sortDirection,
  ]);

  const handleUpdateField = async (
    projectId: string,
    field: string,
    value: unknown,
  ) => {
    try {
      await updateProject.mutateAsync({
        id: projectId,
        patch: { [field]: value } as UpdateProjectInput,
      });
      toast.success('Projektet uppdaterades');
    } catch {
      /* hook toasts */
    } finally {
      setEditingCell(null);
      setTempValue(null);
    }
  };

  const startEditing = (
    projectId: string,
    field: string,
    currentValue: unknown,
  ) => {
    setEditingCell({ projectId, field });
    setTempValue(currentValue);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    projectId: string,
    field: string,
  ) => {
    if (e.key === 'Enter' && tempValue !== null) {
      void handleUpdateField(projectId, field, tempValue);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setTempValue(null);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExportExcel = async () => {
    const rows = tableProjects.length > 0 ? tableProjects : [];
    if (rows.length === 0) {
      toast.error('Inga projekt att exportera');
      return;
    }
    setExporting(true);
    try {
      await exportProjectsToExcel(
        rows.map((p) => {
          const full = projects.find((x) => x.id === p.id);
          return {
            project_number: p.project_number,
            name: p.name,
            type: p.type,
            status: p.status,
            property_name: p.property?.name ?? null,
            year: p.year,
            start_quarter: p.start_quarter,
            start_date: full?.start_date ?? null,
            end_date: full?.end_date ?? null,
            budget: p.budget,
            forecast: full?.forecast ?? null,
            actual_cost: p.actual_cost,
            description: full?.description ?? null,
          };
        }),
      );
      toast.success(`${rows.length} projekt exporterade`);
    } catch {
      toast.error('Kunde inte exportera projekt');
    } finally {
      setExporting(false);
    }
  };

  const tableProps = {
    projects: tableProjects,
    totalUnfilteredCount: projects.length,
    sortField,
    sortDirection,
    onSort: handleSort,
    editingCell,
    tempValue,
    setTempValue,
    updating: updateProject.isPending,
    onStartEditing: startEditing,
    onUpdateProject: handleUpdateField,
    onKeyDown: handleKeyDown,
    onRowClick: (id: string) =>
      navigate(`/projects/${id}`, { state: { fromProjectsTab: activeTab } }),
    onEditClick: (row: (typeof tableProjects)[number]) => {
      const full = projects.find((p) => p.id === row.id) ?? null;
      setEditingProject(full);
      setFormDialogOpen(true);
    },
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <EntityListHeader
              icon={<Briefcase className="h-5 w-5 text-primary shrink-0" />}
              title="Projekthantering"
              actions={
                <>
                  <Button
                    variant="outline"
                    onClick={() => void handleExportExcel()}
                    disabled={exporting}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {exporting ? 'Exporterar...' : 'Exportera XLSX'}
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingProject(null);
                      setFormDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nytt projekt
                  </Button>
                </>
              }
            />
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <Tabs
                value={activeTab}
                onValueChange={(tab) => setParam('tab', tab)}
                className="w-full"
              >
                <TabsList>
                  <TabsTrigger value="active">Aktiva projekt</TabsTrigger>
                  <TabsTrigger value="proposals" className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Förslag
                  </TabsTrigger>
                  <TabsTrigger value="archived">Arkiverade</TabsTrigger>
                </TabsList>

                <TabsContent value="proposals" className="space-y-6 mt-6">
                  <ProjectProposals />
                </TabsContent>

                <TabsContent value="active" className="space-y-6 mt-6">
                  <ProjectsFilters
                    searchQuery={params.q}
                    onSearchChange={(v) => setParam('q', v)}
                    statusFilter={params.status}
                    onStatusChange={(v) => setParam('status', v)}
                    typeFilter={params.type}
                    onTypeChange={(v) => setParam('type', v)}
                    propertyFilter={params.property}
                    onPropertyChange={(v) => setParam('property', v)}
                    properties={properties.map((p) => ({ id: p.id, name: p.name }))}
                  />
                  {isLoading ? (
                    <EntityListSkeleton />
                  ) : isError ? (
                    <EntityListError onRetry={() => void refetch()} />
                  ) : (
                    <ProjectsTable {...tableProps} />
                  )}
                </TabsContent>

                <TabsContent value="archived" className="space-y-6 mt-6">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FolderArchive className="h-4 w-4" />
                    Arkiverade projekt
                  </p>
                  {isLoading ? (
                    <EntityListSkeleton />
                  ) : isError ? (
                    <EntityListError onRetry={() => void refetch()} />
                  ) : (
                    <ProjectsTable
                      {...tableProps}
                      archived
                      emptyTitle="Inga arkiverade projekt"
                      emptyDescription=""
                      emptyIcon="archive"
                    />
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </SidebarInset>
      </div>

      <ProjectFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) setEditingProject(null);
        }}
        onSuccess={() => setEditingProject(null)}
        editingProject={editingProject}
      />
    </SidebarProvider>
  );
}
