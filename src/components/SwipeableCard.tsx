import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Trash2, Edit2 } from 'lucide-react';

interface SwipeableCardProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}

export function SwipeableCard({ 
  onSwipeLeft, 
  onSwipeRight, 
  children,
  className = "",
  threshold = 50
}: SwipeableCardProps) {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      setIsSwiping(true);
      setOffset(Math.max(-100, Math.min(100, eventData.deltaX)));
    },
    onSwipedLeft: () => {
      setIsSwiping(false);
      if (Math.abs(offset) > threshold && onSwipeLeft) {
        onSwipeLeft();
      }
      setOffset(0);
    },
    onSwipedRight: () => {
      setIsSwiping(false);
      if (Math.abs(offset) > threshold && onSwipeRight) {
        onSwipeRight();
      }
      setOffset(0);
    },
    onSwiped: () => {
      setIsSwiping(false);
      setOffset(0);
    },
    trackMouse: false,
    preventScrollOnSwipe: true,
  });
  
  return (
    <div className="relative overflow-hidden">
      <div
        {...handlers}
        style={{ 
          transform: `translateX(${offset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        className={className}
      >
        {children}
      </div>
      
      {/* Swipe indicators */}
      {offset < -threshold && onSwipeLeft && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-destructive pointer-events-none">
          <Trash2 className="h-5 w-5" />
        </div>
      )}
      {offset > threshold && onSwipeRight && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary pointer-events-none">
          <Edit2 className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
