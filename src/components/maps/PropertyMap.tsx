import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { usePropertyLocations } from '@/hooks/usePropertyLocations';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapLocation {
  property_id: string;
  latitude: number | null;
  longitude: number | null;
  formatted_address?: string | null;
  properties?: { name?: string | null; address?: string | null } | null;
}

function MapUpdater({ locations }: { locations: MapLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations && locations.length > 0) {
      const bounds = L.latLngBounds(
        locations
          .filter((loc): loc is MapLocation & { latitude: number; longitude: number } =>
            loc.latitude != null && loc.longitude != null,
          )
          .map((loc) => [loc.latitude, loc.longitude] as [number, number]),
      );
      
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [locations, map]);

  return null;
}

export const PropertyMap = () => {
  const { locations, isLoading } = usePropertyLocations();

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="w-full h-[500px]" />
      </Card>
    );
  }

  const validLocations: MapLocation[] = ((locations ?? []) as MapLocation[]).filter(
    (loc) => loc.latitude != null && loc.longitude != null,
  );

  return (
    <Card className="overflow-hidden">
      <MapContainer
        center={[59.3293, 18.0686]}
        zoom={12}
        style={{ height: '500px', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validLocations.map((location) => (
          <Marker
            key={location.property_id}
            position={[location.latitude, location.longitude]}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold mb-1">
                  {location.properties?.name || 'Fastighet'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {location.formatted_address || location.properties?.address || 'Ingen adress'}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
        <MapUpdater locations={validLocations} />
      </MapContainer>
    </Card>
  );
};
