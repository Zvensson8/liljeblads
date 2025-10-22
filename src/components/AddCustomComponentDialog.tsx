import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { Box } from 'lucide-react';

interface AddCustomComponentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (template: { name: string; type: string; description: string; icon: any; color: string }) => void;
}

export const AddCustomComponentDialog = ({ open, onOpenChange, onAdd }: AddCustomComponentDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Komponentnamn måste anges');
      return;
    }

    const type = name.toLowerCase().replace(/\s+/g, '_');
    
    onAdd({
      name: name.trim(),
      type,
      description: description.trim() || 'Anpassad komponent',
      icon: Box,
      color
    });

    toast.success('Komponent tillagd i biblioteket');
    setName('');
    setDescription('');
    setColor('#6366f1');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" aria-describedby="custom-component-description">
        <DialogHeader>
          <DialogTitle>Lägg till anpassad komponent</DialogTitle>
          <DialogDescription id="custom-component-description">
            Skapa en ny komponenttyp som du använder ofta
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Komponentnamn</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="t.ex. Hissmaskineri"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Beskrivning (valfritt)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beskriv komponenten..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="color">Färg</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-20 h-10"
                />
                <span className="text-sm text-muted-foreground">{color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit">Lägg till</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
