"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const KYIV: [number, number] = [50.4501, 30.5234];

export type CoveragePoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  address: string;
  subtitle?: string;
  workingHours?: string;
};

function FitBounds({ points }: { points: CoveragePoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);
  return null;
}

export default function CoverageMap({
  points,
  height = 420,
}: {
  points: CoveragePoint[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border border-slate-300">
      <MapContainer
        center={KYIV}
        zoom={6}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FitBounds points={points} />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon}>
            <Popup>
              <div className="text-sm font-medium">{p.label}</div>
              {p.subtitle && <div className="text-xs">{p.subtitle}</div>}
              <div className="text-xs">{p.address}</div>
              {p.workingHours && <div className="text-xs text-slate-500">{p.workingHours}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
