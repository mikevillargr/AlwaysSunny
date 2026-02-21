import React, { useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Circle, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon (leaflet CSS path issue with bundlers)
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface LocationMapProps {
  lat: number
  lon: number
  radiusM: number
  onPositionChange: (lat: string, lon: string) => void
}

function MapUpdater({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  const prevRef = useRef({ lat, lon })

  useEffect(() => {
    const prev = prevRef.current
    // Only fly to new position if it changed significantly (> ~50m)
    const dLat = Math.abs(lat - prev.lat)
    const dLon = Math.abs(lon - prev.lon)
    if (dLat > 0.0005 || dLon > 0.0005) {
      map.flyTo([lat, lon], map.getZoom(), { duration: 0.5 })
      prevRef.current = { lat, lon }
    }
  }, [lat, lon, map])

  return null
}

function DraggableMarker({
  lat,
  lon,
  onPositionChange,
}: {
  lat: number
  lon: number
  onPositionChange: (lat: string, lon: string) => void
}) {
  const markerRef = useRef<L.Marker>(null)

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current
        if (marker) {
          const pos = marker.getLatLng()
          onPositionChange(pos.lat.toFixed(6), pos.lng.toFixed(6))
        }
      },
    }),
    [onPositionChange]
  )

  return (
    <Marker
      draggable
      eventHandlers={eventHandlers}
      position={[lat, lon]}
      ref={markerRef}
      icon={markerIcon}
    >
      <Tooltip direction="top" offset={[0, -42]} permanent={false}>
        Drag to refine location
      </Tooltip>
    </Marker>
  )
}

function ReactiveCircle({ lat, lon, radiusM }: { lat: number; lon: number; radiusM: number }) {
  const circleRef = useRef<L.Circle>(null)

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusM)
      circleRef.current.setLatLng([lat, lon])
    }
  }, [lat, lon, radiusM])

  return (
    <Circle
      ref={circleRef}
      center={[lat, lon]}
      radius={radiusM}
      pathOptions={{
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '6 4',
      }}
    />
  )
}

export function LocationMap({ lat, lon, radiusM, onPositionChange }: LocationMapProps) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={16}
      style={{ height: '100%', width: '100%', borderRadius: 8 }}
      scrollWheelZoom
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapUpdater lat={lat} lon={lon} />
      <DraggableMarker lat={lat} lon={lon} onPositionChange={onPositionChange} />
      <ReactiveCircle lat={lat} lon={lon} radiusM={radiusM} />
    </MapContainer>
  )
}
