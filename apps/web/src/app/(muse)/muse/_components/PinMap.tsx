'use client';

/**
 * Reusable Leaflet + OpenStreetMap pin map (no API key, no account — free).
 * Used by the Suppliers map and the Sales (schools) map. Vector circle markers
 * only, so nothing breaks under the bundler. Co-located pins are fanned out on
 * a small ring so each stays clickable. Selecting a pin draws a straight line
 * to the home pin; the parent renders the distance.
 *
 * Tiles require `img-src https://*.tile.openstreetmap.org` in the CSP
 * (apps/web/next.config.ts).
 */

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, CircleMarker, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPin {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

interface Home {
  name: string;
  lat: number;
  lng: number;
}

interface Props {
  pins: MapPin[];
  home: Home;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const FOREST = '#1e3a2b';
const FOREST_SOFT = '#2b4d39';
const TERRACOTTA = '#b0562f';

/** Fan out pins that share a coordinate so each is individually clickable. */
function withDisplayOffsets(pins: MapPin[]): Array<{ p: MapPin; lat: number; lng: number }> {
  const groups = new Map<string, MapPin[]>();
  for (const p of pins) {
    if (p.lat == null || p.lng == null) continue;
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  const out: Array<{ p: MapPin; lat: number; lng: number }> = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      const p = members[0];
      out.push({ p, lat: p.lat!, lng: p.lng! });
      continue;
    }
    const rDeg = 0.013 + Math.min(members.length, 12) * 0.0009;
    members.forEach((p, i) => {
      const theta = (2 * Math.PI * i) / members.length;
      const lat = p.lat! + rDeg * Math.cos(theta);
      const lng = p.lng! + (rDeg * Math.sin(theta)) / Math.cos((p.lat! * Math.PI) / 180);
      out.push({ p, lat, lng });
    });
  }
  return out;
}

export default function PinMap({ pins, home, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, { marker: CircleMarker; lat: number; lng: number }>>(
    new Map(),
  );
  const lineRef = useRef<Polyline | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Build the map once, on mount, with all markers.
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    const markers = markersRef.current;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([home.lat, home.lng], 9);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      L.circleMarker([home.lat, home.lng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: TERRACOTTA,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip(`${home.name} (home)`, { direction: 'top' });

      const placed = withDisplayOffsets(pins);
      const bounds: Array<[number, number]> = [[home.lat, home.lng]];

      for (const { p, lat, lng } of placed) {
        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          color: '#fff',
          weight: 1.5,
          fillColor: FOREST_SOFT,
          fillOpacity: 0.95,
        })
          .addTo(map)
          .bindTooltip(p.name, { direction: 'top' });
        marker.on('click', () => onSelectRef.current(p.id));
        markers.set(p.id, { marker, lat, lng });
        bounds.push([lat, lng]);
      }

      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
      requestAnimationFrame(() => map?.invalidateSize());
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markers.clear();
      lineRef.current = null;
    };
  }, [pins, home.lat, home.lng, home.name]);

  // React to selection: highlight marker + draw the straight line home→pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !mapRef.current) return;

      for (const { marker } of markersRef.current.values()) {
        marker.setStyle({ fillColor: FOREST_SOFT });
        marker.setRadius(6);
      }
      if (lineRef.current) {
        lineRef.current.remove();
        lineRef.current = null;
      }

      if (!selectedId) return;
      const hit = markersRef.current.get(selectedId);
      if (!hit) return;

      hit.marker.setStyle({ fillColor: FOREST });
      hit.marker.setRadius(9);
      hit.marker.bringToFront();

      lineRef.current = L.polyline(
        [
          [home.lat, home.lng],
          [hit.lat, hit.lng],
        ],
        { color: TERRACOTTA, weight: 2, dashArray: '6 5', opacity: 0.85 },
      ).addTo(map);

      map.fitBounds(
        [
          [home.lat, home.lng],
          [hit.lat, hit.lng],
        ],
        { padding: [60, 60], maxZoom: 12 },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, home.lat, home.lng]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Location map"
      className="h-128 w-full rounded-[0.5rem] overflow-hidden border border-[color:var(--muse-line)] bg-[color:var(--muse-surface-2)]"
    />
  );
}
