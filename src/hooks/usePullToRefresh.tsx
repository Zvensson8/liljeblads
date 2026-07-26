import { useState, useEffect, useRef } from 'react';

export function usePullToRefresh(onRefresh: () => Promise<void>, containerId: string = 'main-content') {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isRefreshing = useRef(false);
  
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const handleTouchStart = (e: TouchEvent) => {
      if (container.scrollTop === 0 && !isRefreshing.current) {
        startY.current = e.touches[0].clientY;
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === 0 || isRefreshing.current) return;
      
      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;
      
      if (distance > 0 && container.scrollTop === 0) {
        e.preventDefault();
        setPullDistance(Math.min(distance, 80));
        setIsPulling(true);
      }
    };
    
    const handleTouchEnd = async () => {
      if (pullDistance > 60 && !isRefreshing.current) {
        isRefreshing.current = true;
        try {
          await onRefresh();
        } finally {
          isRefreshing.current = false;
        }
      }
      setIsPulling(false);
      setPullDistance(0);
      startY.current = 0;
    };
    
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, onRefresh, containerId]);
  
  return { isPulling, pullDistance };
}
