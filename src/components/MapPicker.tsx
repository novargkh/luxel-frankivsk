"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
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

// react-leaflet only honors the `center` prop at mount — it deliberately
// doesn't fight the user's own panning/zooming afterwards. To jump the map
// to a freshly-geocoded address (an external change, not a user click) we
// need to imperatively call map.setView. `recenterKey` is bumped by the
// parent only when it wants to force that jump (e.g. after geocoding
// resolves), so a plain click-driven lat/lng update doesn't yank the view.
function Recenter({
  lat,
  lng,
  recenterKey,
}: {
  lat: number;
  lng: number;
  recenterKey: number;
}) {
  const map = useMap();
  const prevKey = useRef(recenterKey);
  useEffect(() => {
    if (recenterKey !== prevKey.current) {
      prevKey.current = recenterKey;
      map.setView([lat, lng], 15);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);
  return null;
}

export default function MapPicker({
  lat,
  lng,
  onChange,
  height = 260,
  recenterKey = 0,
}: {
  lat?: number | null;
  lng?: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
  /** Bump this (e.g. increment a counter) to force the map to jump to lat/lng — used after geocoding an address. */
  recenterKey?: number;
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
          {hasPoint && (
            <Recenter lat={lat as number} lng={lng as number} recenterKey={recenterKey} />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Клацніть на карті, щоб поставити геомітку
        {hasPoint ? ` — обрано: ${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : ""}
      </p>
    </div>
  );
}
