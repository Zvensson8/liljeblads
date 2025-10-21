import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Keyboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Shortcut {
  keys: string[];
  description: string;
}

const shortcuts: Shortcut[] = [
  { keys: ["Ctrl/Cmd", "K"], description: "Sök" },
  { keys: ["Ctrl/Cmd", "H"], description: "Gå till Dashboard" },
  { keys: ["Ctrl/Cmd", "P"], description: "Gå till Fastigheter" },
  { keys: ["Ctrl/Cmd", "W"], description: "Gå till Arbetsordrar" },
  { keys: ["Ctrl/Cmd", "C"], description: "Gå till Komponenter" },
  { keys: ["Ctrl/Cmd", "O"], description: "Gå till Drift" },
  { keys: ["Esc"], description: "Stäng dialog" },
  { keys: ["?"], description: "Visa denna hjälp" },
];

export const KeyboardShortcutsDialog = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Keyboard className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tangentbordsgenvägar</DialogTitle>
          <DialogDescription>
            Använd dessa genvägar för att navigera snabbare
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm">{shortcut.description}</span>
              <div className="flex gap-1">
                {shortcut.keys.map((key, i) => (
                  <Badge key={i} variant="secondary" className="font-mono">
                    {key}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
