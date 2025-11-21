import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DeleteAccountDialog = ({ open, onOpenChange }: DeleteAccountDialogProps) => {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (confirmation !== 'RADERA') {
      toast.error('Vänligen skriv RADERA för att bekräfta');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // This would trigger CASCADE deletes on all related data
      // In production, you'd want to implement this via an edge function
      // that handles the deletion more carefully
      
      toast.info('Kontakta support för att radera ditt konto');
      onOpenChange(false);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Kunde inte radera kontot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Radera konto
          </DialogTitle>
          <DialogDescription>
            <strong className="block mb-2 text-destructive">Varning: Denna åtgärd kan inte ångras!</strong>
            All din data kommer att raderas permanent, inklusive:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Alla fastigheter och komponenter</li>
              <li>Alla projekt och arbetsordrar</li>
              <li>Alla dokument och ritningar</li>
              <li>Din profil och inställningar</li>
            </ul>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="confirmation">
              Skriv <strong>RADERA</strong> för att bekräfta
            </Label>
            <Input
              id="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="RADERA"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading || confirmation !== 'RADERA'}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Radera mitt konto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
