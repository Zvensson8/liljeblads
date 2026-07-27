import { FloorCanvas } from '@/components/FloorCanvas';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Upload } from 'lucide-react';

export interface PropertyFloor {
  id: string;
  name: string;
  level: number | null;
  drawing_url: string | null;
}

interface PropertyDrawingsTabProps {
  floors: PropertyFloor[];
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  floorName: string;
  floorLevel: string;
  onFloorNameChange: (v: string) => void;
  onFloorLevelChange: (v: string) => void;
  onCreateFloor: (e: React.FormEvent) => void;
  onDeleteFloor: (floorId: string) => void;
  onDeleteDrawing: (floor: PropertyFloor) => void;
  onUploadDrawing: (floorId: string, file: File) => void;
  uploadingFile: boolean;
  onCanvasUpdate: () => void;
  onBackToOverview: () => void;
}

function CreateFloorForm({
  floorName,
  floorLevel,
  onFloorNameChange,
  onFloorLevelChange,
  onCreateFloor,
  onCancel,
}: {
  floorName: string;
  floorLevel: string;
  onFloorNameChange: (v: string) => void;
  onFloorLevelChange: (v: string) => void;
  onCreateFloor: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onCreateFloor} className="space-y-4">
      <div>
        <Label htmlFor="floorName">Våningsnamn</Label>
        <Input
          id="floorName"
          value={floorName}
          onChange={(e) => onFloorNameChange(e.target.value)}
          placeholder="t.ex. Entréplan, Våning 2"
          required
        />
      </div>
      <div>
        <Label htmlFor="floorLevel">Våningsnummer (valfritt)</Label>
        <Input
          id="floorLevel"
          type="number"
          value={floorLevel}
          onChange={(e) => onFloorLevelChange(e.target.value)}
          placeholder="t.ex. 1, 2, 3"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit">Skapa våning</Button>
      </div>
    </form>
  );
}

export function PropertyDrawingsTab({
  floors,
  dialogOpen,
  onDialogOpenChange,
  floorName,
  floorLevel,
  onFloorNameChange,
  onFloorLevelChange,
  onCreateFloor,
  onDeleteFloor,
  onDeleteDrawing,
  onUploadDrawing,
  uploadingFile,
  onCanvasUpdate,
  onBackToOverview,
}: PropertyDrawingsTabProps) {
  if (floors.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <p className="mb-4">Inga våningar har skapats än.</p>
          <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Skapa våning
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Skapa ny våning</DialogTitle>
              </DialogHeader>
              <CreateFloorForm
                floorName={floorName}
                floorLevel={floorLevel}
                onFloorNameChange={onFloorNameChange}
                onFloorLevelChange={onFloorLevelChange}
                onCreateFloor={onCreateFloor}
                onCancel={() => onDialogOpenChange(false)}
              />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Ritningar</h2>
        <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till våning
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Skapa ny våning</DialogTitle>
            </DialogHeader>
            <CreateFloorForm
              floorName={floorName}
              floorLevel={floorLevel}
              onFloorNameChange={onFloorNameChange}
              onFloorLevelChange={onFloorLevelChange}
              onCreateFloor={onCreateFloor}
              onCancel={() => onDialogOpenChange(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {floors.map((floor) => (
        <Card key={floor.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{floor.name}</CardTitle>
                <CardDescription>
                  {floor.level !== null ? `Våning ${floor.level}` : 'Ingen nivå angiven'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {floor.drawing_url && (
                  <Button variant="outline" size="sm" onClick={() => onDeleteDrawing(floor)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Ta bort ritning
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDeleteFloor(floor.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Ta bort våning
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {floor.drawing_url ? (
              <FloorCanvas
                key={`${floor.id}:${floor.drawing_url}`}
                floorId={floor.id}
                drawingUrl={floor.drawing_url}
                onUpdate={onCanvasUpdate}
                onBack={onBackToOverview}
              />
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground mb-4">
                  Ingen ritning uppladdad för denna våning
                </p>
                <Label htmlFor={`upload-${floor.id}`}>
                  <Button
                    variant="outline"
                    disabled={uploadingFile}
                    onClick={() => document.getElementById(`upload-${floor.id}`)?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingFile ? 'Laddar upp...' : 'Ladda upp ritning'}
                  </Button>
                </Label>
                <Input
                  id={`upload-${floor.id}`}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadDrawing(floor.id, file);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
