/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { usePropertyLocations } from '@/hooks/usePropertyLocations';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const PropertyMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const { locations, isLoading } = usePropertyLocations();

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current) return;

      try {
        const loader = new Loader({
          apiKey: GOOGLE_MAPS_API_KEY,
          version: 'weekly',
        });

        await loader.load();

        const mapInstance = new google.maps.Map(mapRef.current, {
          center: { lat: 59.3293, lng: 18.0686 }, // Stockholm
          zoom: 12,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });

        setMap(mapInstance);
      } catch (error) {
        console.error('Error loading Google Maps:', error);
        toast.error('Kunde inte ladda kartan');
      }
    };

    initMap();
  }, []);

  useEffect(() => {
    if (!map || !locations) return;

    // Clear existing markers
    // Add markers for each property
    locations.forEach((location: any) => {
      if (location.latitude && location.longitude) {
        const marker = new google.maps.Marker({
          position: { lat: location.latitude, lng: location.longitude },
          map,
          title: location.properties?.name || 'Fastighet',
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="font-weight: 600; margin-bottom: 4px;">${location.properties?.name || 'Fastighet'}</h3>
              <p style="color: #666; font-size: 14px;">${location.formatted_address || location.properties?.address || 'Ingen adress'}</p>
            </div>
          `,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });
      }
    });
  }, [map, locations]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="w-full h-[500px]" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div ref={mapRef} className="w-full h-[500px]" />
    </Card>
  );
};
