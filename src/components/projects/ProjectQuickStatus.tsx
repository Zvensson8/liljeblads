import { useState } from "react";
import { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateProject } from "@/hooks/useProjects";
import { useLogProjectActivity } from "@/hooks/useProjectActivityLog";

type ProjectStatus = Database["public"]["Enums"]["project_status"];

interface ProjectQuickStatusProps {
  projectId: string;
  currentStatus: ProjectStatus;
  onStatusChange: () => void;
}

const statusConfig: Record<ProjectStatus, { label: string; className: string }> = {
  forslag: { label: "Förslag", className: "bg-yellow-500 hover:bg-yellow-600" },
  planerat: { label: "Planerat", className: "bg-gray-500 hover:bg-gray-600" },
  invantar_offert: { label: "Inväntar offert", className: "bg-yellow-500 hover:bg-yellow-600" },
  offert_finns: { label: "Offert finns", className: "bg-blue-500 hover:bg-blue-600" },
  pagaende: { label: "Pågående", className: "bg-green-500 hover:bg-green-600" },
  pausat: { label: "Pausat", className: "bg-orange-500 hover:bg-orange-600" },
  avslutat: { label: "Avslutat", className: "bg-gray-700 hover:bg-gray-800" },
};

const statusOrder: ProjectStatus[] = [
  "forslag",
  "planerat",
  "invantar_offert",
  "offert_finns",
  "pagaende",
  "pausat",
  "avslutat",
];

export function ProjectQuickStatus({
  projectId,
  currentStatus,
  onStatusChange,
}: ProjectQuickStatusProps) {
  const [updating, setUpdating] = useState(false);
  const [open, setOpen] = useState(false);

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    if (newStatus === currentStatus) {
      setOpen(false);
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", projectId);

      if (error) throw error;

      // Log activity
      await supabase.from("project_activity_log").insert({
        project_id: projectId,
        activity_type: "status_change",
        description: `Status ändrad från "${statusConfig[currentStatus].label}" till "${statusConfig[newStatus].label}"`,
      });

      toast.success(`Status ändrad till "${statusConfig[newStatus].label}"`);
      onStatusChange();
    } catch (error) {
      toast.error("Kunde inte ändra status");
    } finally {
      setUpdating(false);
      setOpen(false);
    }
  };

  const config = statusConfig[currentStatus];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={updating}>
        <Badge 
          className={`${config.className} cursor-pointer flex items-center gap-1 transition-colors`}
        >
          {updating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              {config.label}
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {statusOrder.map((status) => {
          const statusInfo = statusConfig[status];
          const isActive = status === currentStatus;
          
          return (
            <DropdownMenuItem
              key={status}
              onClick={() => handleStatusChange(status)}
              className="flex items-center justify-between"
            >
              <span className={isActive ? "font-medium" : ""}>
                {statusInfo.label}
              </span>
              {isActive && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
