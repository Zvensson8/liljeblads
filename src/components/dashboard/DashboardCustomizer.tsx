import { Button } from '@/components/ui/button';
import { Edit, Save, RotateCcw } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboardStore';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { toast } from 'sonner';

export const DashboardCustomizer = () => {
  const { isEditing, setEditing, resetToDefault } = useDashboardStore();
  const { saveLayout, isSaving } = useDashboardLayout();

  const handleSave = () => {
    saveLayout();
    setEditing(false);
    toast.success('Dashboard-layout sparad');
  };

  const handleReset = () => {
    resetToDefault();
    toast.success('Återställt till standardlayout');
  };

  return (
    <div className="flex gap-2">
      {!isEditing ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
        >
          <Edit className="h-4 w-4 mr-2" />
          Anpassa Dashboard
        </Button>
      ) : (
        <>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            Spara Layout
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(false)}
          >
            Avbryt
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Återställ
          </Button>
        </>
      )}
    </div>
  );
};
