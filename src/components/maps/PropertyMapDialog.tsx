import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PropertyMap } from './PropertyMap';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

interface PropertyMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PropertyMapDialog = ({ open, onOpenChange }: PropertyMapDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Fastighetskarta
          </DialogTitle>
        </DialogHeader>
        <PropertyMap />
      </DialogContent>
    </Dialog>
  );
};
