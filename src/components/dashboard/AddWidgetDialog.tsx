import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDashboardStore } from '@/store/dashboardStore';
import { Building2, Wrench, FolderKanban, CheckSquare, TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface AddWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const availableWidgets = [
  {
    id: 'kpi-properties',
    type: 'kpi-card',
    title: 'Fastigheter',
    description: 'KPI-kort för fastighetsöversikt',
    icon: Building2,
    config: { metric: 'properties' },
  },
  {
    id: 'kpi-workorders',
    type: 'kpi-card',
    title: 'Arbetsordrar',
    description: 'KPI-kort för arbetsordrar',
    icon: Wrench,
    config: { metric: 'workorders' },
  },
  {
    id: 'kpi-projects',
    type: 'kpi-card',
    title: 'Projekt',
    description: 'KPI-kort för projekt',
    icon: FolderKanban,
    config: { metric: 'projects' },
  },
  {
    id: 'kpi-todos',
    type: 'kpi-card',
    title: 'Att göra',
    description: 'KPI-kort för uppgifter',
    icon: CheckSquare,
    config: { metric: 'todos' },
  },
  {
    id: 'activity-feed',
    type: 'activity',
    title: 'Aktivitetsflöde',
    description: 'Senaste aktiviteter i projekten',
    icon: TrendingUp,
    config: {},
  },
  {
    id: 'quick-stats',
    type: 'quick-stats',
    title: 'Snabbstatistik',
    description: 'Översikt av alla resurser',
    icon: TrendingUp,
    config: {},
  },
  {
    id: 'recent-projects',
    type: 'recent-projects',
    title: 'Senaste projekt',
    description: 'Nyligen skapade projekt',
    icon: FolderKanban,
    config: {},
  },
  {
    id: 'upcoming-tasks',
    type: 'upcoming-tasks',
    title: 'Kommande uppgifter',
    description: 'Uppgifter med närmaste deadline',
    icon: Calendar,
    config: {},
  },
];

export const AddWidgetDialog = ({ open, onOpenChange }: AddWidgetDialogProps) => {
  const { widgets, addWidget } = useDashboardStore();

  const handleAddWidget = (widget: typeof availableWidgets[0]) => {
    const existingWidget = widgets.find(w => w.id === widget.id);
    
    if (existingWidget) {
      toast.error('Widget finns redan på dashboarden');
      return;
    }

    addWidget({
      id: widget.id,
      type: widget.type,
      config: widget.config,
    });

    toast.success(`${widget.title} tillagd`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lägg till widget</DialogTitle>
          <DialogDescription>
            Välj en widget att lägga till på din dashboard
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 md:grid-cols-2">
          {availableWidgets.map((widget) => {
            const Icon = widget.icon;
            const isAdded = widgets.some(w => w.id === widget.id);
            
            return (
              <div
                key={widget.id}
                className="flex flex-col p-4 border rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-1">{widget.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {widget.description}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAddWidget(widget)}
                  disabled={isAdded}
                  className="w-full"
                >
                  {isAdded ? 'Redan tillagd' : 'Lägg till'}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
