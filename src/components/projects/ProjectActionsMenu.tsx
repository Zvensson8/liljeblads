import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  Mail, 
  Download, 
  FileText, 
  Archive, 
  RefreshCw,
  Loader2
} from "lucide-react";

interface ProjectActionsMenuProps {
  isArchived: boolean;
  exporting: boolean;
  sendingDraft: boolean;
  onExport: () => void;
  onSendDraft: () => void;
  onArchive: () => void;
  onReactivate: () => void;
  onGenerateReport: () => void;
}

export function ProjectActionsMenu({
  isArchived,
  exporting,
  sendingDraft,
  onExport,
  onSendDraft,
  onArchive,
  onReactivate,
  onGenerateReport,
}: ProjectActionsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <MoreHorizontal className="h-4 w-4 mr-2" />
          Åtgärder
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem 
          onClick={() => { onSendDraft(); setOpen(false); }}
          disabled={sendingDraft}
        >
          {sendingDraft ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Mail className="h-4 w-4 mr-2" />
          )}
          Beställningsutkast
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => { onExport(); setOpen(false); }}
          disabled={exporting}
        >
          <Download className="h-4 w-4 mr-2" />
          {exporting ? "Exporterar..." : "Exportera ZIP"}
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => { onGenerateReport(); setOpen(false); }}>
          <FileText className="h-4 w-4 mr-2" />
          Generera rapport
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {isArchived ? (
          <DropdownMenuItem onClick={() => { onReactivate(); setOpen(false); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Återaktivera
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem 
            onClick={() => { onArchive(); setOpen(false); }}
            className="text-destructive focus:text-destructive"
          >
            <Archive className="h-4 w-4 mr-2" />
            Arkivera projekt
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
