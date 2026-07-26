import { Button } from './ui/button';
import { 
  MousePointer2, 
  Circle, 
  Square, 
  Minus, 
  Pen, 
  Type, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Download,
  RotateCcw,
  RotateCw,
  Grid3x3,
  Move
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Separator } from './ui/separator';

interface CanvasToolbarProps {
  activeTool: string;
  onToolClick: (tool: string) => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleGrid: () => void;
  canUndo: boolean;
  canRedo: boolean;
  gridEnabled: boolean;
}

export const CanvasToolbar = ({
  activeTool,
  onToolClick,
  onClear,
  onZoomIn,
  onZoomOut,
  onExport,
  onUndo,
  onRedo,
  onToggleGrid,
  canUndo,
  canRedo,
  gridEnabled
}: CanvasToolbarProps) => {
  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Välj (V)', shortcut: 'V' },
    { id: 'pan', icon: Move, label: 'Panorera (H)', shortcut: 'H' },
    { id: 'draw', icon: Pen, label: 'Rita (D)', shortcut: 'D' },
    { id: 'circle', icon: Circle, label: 'Cirkel (C)', shortcut: 'C' },
    { id: 'rectangle', icon: Square, label: 'Rektangel (R)', shortcut: 'R' },
    { id: 'line', icon: Minus, label: 'Linje (L)', shortcut: 'L' },
    { id: 'text', icon: Type, label: 'Text (T)', shortcut: 'T' },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 p-2 bg-card border border-border rounded-lg shadow-lg">
        {/* Selection and drawing tools */}
        <div className="flex items-center gap-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeTool === tool.id ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => onToolClick(tool.id)}
                    className="transition-all"
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tool.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onUndo}
                disabled={!canUndo}
                className="transition-all"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Ångra (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRedo}
                disabled={!canRedo}
                className="transition-all"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Gör om (Ctrl+Y)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* View controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onZoomIn}
                className="transition-all"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zooma in (+)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onZoomOut}
                className="transition-all"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zooma ut (-)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={gridEnabled ? 'default' : 'ghost'}
                size="icon"
                onClick={onToggleGrid}
                className="transition-all"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Visa rutnät (G)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onExport}
                className="transition-all"
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Exportera som PNG</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClear}
                className="transition-all hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rensa canvas (Delete)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};
