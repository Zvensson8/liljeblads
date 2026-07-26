import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Task {
  id: string;
  name: string;
  description: string | null;
  planned_count: number;
  reported_count: number;
  category_id: string | null;
}

interface TaskObject {
  id: string;
  component_id: string | null;
  object_name: string | null;
  is_reported: boolean;
  component?: {
    id: string;
    name: string;
    type: string;
  } | null;
}

interface TaskMobileCardProps {
  task: Task;
  objects?: TaskObject[];
  onToggleReported: (objectId: string, isReported: boolean) => void;
  onMarkComplete: () => void;
  onDelete: () => void;
  onExpand: () => void;
  isExpanded: boolean;
}

export function TaskMobileCard({
  task,
  objects = [],
  onToggleReported,
  onMarkComplete,
  onDelete,
  onExpand,
  isExpanded,
}: TaskMobileCardProps) {
  const getStatus = () => {
    if (task.reported_count === 0) return "missing";
    if (task.reported_count >= task.planned_count) return "completed";
    return "remaining";
  };

  const status = getStatus();
  const progress = task.planned_count > 0 
    ? (task.reported_count / task.planned_count) * 100 
    : 0;

  const getStatusBadge = () => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/20 text-green-700 border-green-500/50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Klar
          </Badge>
        );
      case "remaining":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/50">
            <AlertCircle className="h-3 w-3 mr-1" />
            Kvar
          </Badge>
        );
      case "missing":
        return (
          <Badge className="bg-red-500/20 text-red-700 border-red-500/50">
            <XCircle className="h-3 w-3 mr-1" />
            Saknas
          </Badge>
        );
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    switch (status) {
      case "completed":
        return "border-l-green-500";
      case "remaining":
        return "border-l-yellow-500";
      case "missing":
        return "border-l-red-500";
      default:
        return "";
    }
  };

  return (
    <Card className={`border-l-4 ${getBorderColor()}`}>
      <Collapsible open={isExpanded} onOpenChange={() => onExpand()}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium truncate">{task.name}</h4>
                  {getStatusBadge()}
                </div>
                {task.description && (
                  <p className="text-sm text-muted-foreground truncate mb-2">
                    {task.description}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <Progress value={progress} className="h-2 flex-1 max-w-[100px]" />
                    <span className="text-sm font-medium">
                      {task.reported_count}/{task.planned_count}
                    </span>
                  </div>
                  {objects.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {objects.length} objekt
                    </span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t pt-3">
            {/* Quick actions */}
            <div className="flex gap-2">
              {status !== "completed" && (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkComplete();
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Markera klar
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                Ta bort
              </Button>
            </div>

            {/* Objects list */}
            {objects.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">Objekt</h5>
                <div className="space-y-1">
                  {objects.map((obj) => (
                    <div
                      key={obj.id}
                      className="flex items-center gap-2 p-2 rounded bg-muted/50"
                    >
                      <Checkbox
                        checked={obj.is_reported}
                        onCheckedChange={(checked) => {
                          onToggleReported(obj.id, !!checked);
                        }}
                      />
                      <span className="text-sm flex-1 truncate">
                        {obj.component?.name || obj.object_name || "Okänt objekt"}
                      </span>
                      {obj.is_reported && (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
