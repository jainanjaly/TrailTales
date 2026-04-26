import { useEffect, useRef, useState } from "react";
import Globe, { GlobeMethods } from "react-globe.gl";
import { useNavigate } from "react-router-dom";
import { Trip } from "../lib/trips";

type Props = {
  trips: Trip[];
  onPinClick?: (trip: Trip) => void;
};

type Point = {
  lat: number;
  lng: number;
  title: string;
  country: string | null;
  tripId: string;
  size: number;
  color: string;
};

export default function TripGlobe({ trips, onPinClick }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    // Gentle auto-rotation
    const controls = g.controls() as unknown as {
      autoRotate: boolean;
      autoRotateSpeed: number;
    };
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
  }, []);

  const points: Point[] = trips.map((t) => ({
    lat: t.location.lat,
    lng: t.location.lng,
    title: t.title,
    country: t.location.country ?? null,
    tripId: t.id,
    size: 0.8,
    color: "#f97316",
  }));

  function handleClick(pt: object) {
    const p = pt as Point;
    if (onPinClick) {
      const trip = trips.find((t) => t.id === p.tripId);
      if (trip) onPinClick(trip);
      return;
    }
    navigate(`/trips/${p.tripId}`);
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 420,
        background: "#0b1120",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="#0b1120"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.02}
        pointRadius="size"
        pointLabel={(d) => {
          const p = d as Point;
          return `<div style="font-family:system-ui;padding:6px 10px;background:rgba(17,24,39,0.9);color:white;border-radius:6px;font-size:13px;">
            <strong>${escapeHtml(p.title)}</strong>${p.country ? `<br/><span style="color:#9ca3af;font-size:11px;">${escapeHtml(p.country)}</span>` : ""}
          </div>`;
        }}
        onPointClick={handleClick}
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}
