import { useIsMobile } from '@/hooks/use-mobile';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  mobileWidth?: number;
  desktopWidth?: number;
}

export function OptimizedImage({ 
  src, 
  alt, 
  className = "",
  mobileWidth = 400,
  desktopWidth = 800
}: OptimizedImageProps) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // Optimize image size based on device
  const optimizedSrc = src.includes('?') 
    ? `${src}&width=${isMobile ? mobileWidth : desktopWidth}`
    : `${src}?width=${isMobile ? mobileWidth : desktopWidth}`;
    
  if (error) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <span className="text-sm text-muted-foreground">Bilden kunde inte laddas</span>
      </div>
    );
  }
  
  return (
    <div className="relative">
      {loading && (
        <div className={`absolute inset-0 flex items-center justify-center bg-muted ${className}`}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={optimizedSrc}
        alt={alt}
        loading="lazy"
        className={className}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
    </div>
  );
}
