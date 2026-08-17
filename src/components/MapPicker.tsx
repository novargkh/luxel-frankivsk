"use client";

import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
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

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPicker({
  lat,
  lng,
  onChange,
  height = 260,
}: {
  lat?: number | null;
  lng?: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}) {
  const hasPoint = typeof lat === "number" && typeof lng === "number";
  const center: [number, number] = hasPoint ? [lat as number, lng as number] : KYIV;

  return (
    <div>
      <div
        style={{ height }}
        className="rounded-lg overflow-hidden border border-slate-300"
      >
        <MapContainer
          center={center}
          zoom={hasPoint ? 15 : 6}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <ClickHandler onPick={onChange} />
          {hasPoint && <Marker position={[lat as number, lng as number]} icon={markerIcon} />}
        </MapContainer>
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Клацніть на карті, щоб поставити геомітку
        {hasPoint ? ` — обрано: ${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : ""}
      </p>
    </div>
  );
}
