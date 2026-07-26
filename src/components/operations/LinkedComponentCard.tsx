import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Edit, ExternalLink, Unlink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LinkedComponent {
  id: string;
  component_id: string | null;
  series_id: string | null;
  registration_number: string | null;
  object_name: string | null;
  is_reported: boolean;
  auto_detected_from: string | null;
  manually_edited: boolean;
  component?: {
    id: string;
    name: string;
    type: string;
    room_zone: string | null;
    floor_id: string;
  };
}

interface LinkedComponentCardProps {
  taskObject: LinkedComponent;
  onEdit: () => void;
  onUnlink: () => void;
  onToggleReported: () => void;
}

export function LinkedComponentCard({
  taskObject,
  onEdit,
  onUnlink,
  onToggleReported,
}: LinkedComponentCardProps) {
  const navigate = useNavigate();

  const handleViewOnCanvas = () => {
    if (taskObject.component?.floor_id) {
      navigate(`/properties?floor=${taskObject.component.floor_id}`);
    }
  };

  const isComponentBased = taskObject.component_id && taskObject.component;
  const displayName = isComponentBased
    ? taskObject.component!.name
    : taskObject.object_name || "Namnlöst objekt";

  return (
    <div className="p-3 border rounded-lg bg-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium truncate">{displayName}</h4>
            {isComponentBased && (
              <Badge variant="outline" className="text-xs">
                {taskObject.component!.type}
              </Badge>
            )}
            {taskObject.auto_detected_from && !taskObject.manually_edited ? (
              <Badge variant="secondary" className="text-xs">
                Auto-detekterad
              </Badge>
            ) : taskObject.manually_edited ? (
              <Badge variant="default" className="text-xs">
                Manuellt länkad
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Fristående
              </Badge>
            )}
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {taskObject.registration_number && (
              <div>Reg.nr: {taskObject.registration_number}</div>
            )}
            {taskObject.series_id && <div>Serie: {taskObject.series_id}</div>}
            {isComponentBased && taskObject.component!.room_zone && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {taskObject.component!.room_zone}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1 ml-2">
          <Button
            size="sm"
            variant={taskObject.is_reported ? "default" : "outline"}
            onClick={onToggleReported}
          >
            {taskObject.is_reported ? "Redovisad" : "Markera"}
          </Button>
          {isComponentBased && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleViewOnCanvas}
              title="Visa i ritning"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} title="Redigera">
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onUnlink}
            title="Ta bort länkning"
          >
            <Unlink className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
