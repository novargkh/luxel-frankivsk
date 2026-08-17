export type GeoPoint = { lat: number | null; lng: number | null; address: string };

// Approximate straight-line ("as the crow flies") distance in km.
// Real road distance is usually 15-30% longer; used only as an estimate
// since no paid routing API is configured.
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function routeLegs(points: GeoPoint[]): (number | null)[] {
  const legs: (number | null)[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      legs.push(
        haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })
      );
    } else {
      legs.push(null);
    }
  }
  return legs;
}

function encodePoint(p: GeoPoint): string {
  return p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.address;
}

// Builds a Google Maps deep link that opens turn-by-turn directions through
// the given ordered stops. No API key required.
export function buildGoogleMapsRouteUrl(points: GeoPoint[]): string {
  const valid = points.filter((p) => (p.lat != null && p.lng != null) || p.address);
  if (valid.length === 0) return "";

  if (valid.length === 1) {
    const params = new URLSearchParams({ api: "1", destination: encodePoint(valid[0]) });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  const origin = encodePoint(valid[0]);
  const destination = encodePoint(valid[valid.length - 1]);
  const waypoints = valid.slice(1, -1).map(encodePoint).join("|");

  const params = new URLSearchParams({ api: "1", origin, destination, travelmode: "driving" });
  if (waypoints) params.set("waypoints", waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
