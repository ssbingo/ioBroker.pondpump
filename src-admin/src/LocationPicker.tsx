import React, { useEffect, useRef, useState } from "react";

import { Box, Button, TextField, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** Fallback map centre (geographic centre of Germany) when no coordinates are set yet. */
const GERMANY_CENTER: [number, number] = [51.1657, 10.4515];

/**
 * A CSS/emoji marker, so we depend on no external marker-icon images (which Leaflet otherwise pulls
 * from a relative/CDN path — awkward under Module Federation and the admin CSP).
 */
const PIN_ICON = L.divIcon({
    className: "pondpump-pin",
    html: '<div style="font-size:22px;line-height:22px">📍</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
});

/** Resolve a geocoding query to coordinates (implemented by the parent via the backend). */
export type GeocodeFn = (query: string) => Promise<{ lat: number; lon: number; displayName?: string } | null>;

interface LocationPickerProps {
    /** Latitude as a string (may be empty). */
    latitude: string;
    /** Longitude as a string (may be empty). */
    longitude: string;
    /** Called with the new lat/lon (6 decimals) whenever the marker/fields/search change them. */
    onChange: (lat: string, lon: string) => void;
    /** Address → coordinates, run in the backend to avoid browser CORS/CSP. */
    onGeocode?: GeocodeFn;
    /** Optional system coordinates for the "use system location" button. */
    systemCoords?: { lat: number; lon: number } | null;
}

/**
 * Interactive location picker: an OpenStreetMap (Leaflet) map with a draggable marker, plus latitude/
 * longitude fields and an address search. Click the map or drag the marker to set the position.
 *
 * @param props - the picker props
 */
export default function LocationPicker(props: LocationPickerProps): React.JSX.Element {
    const { latitude, longitude, onChange, onGeocode, systemCoords } = props;
    const mapDiv = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const [address, setAddress] = useState("");
    const [status, setStatus] = useState("");
    // True once the OSM tiles fail to load (usually the admin CSP blocking the external tile host).
    const [tilesFailed, setTilesFailed] = useState(false);

    // Create the map exactly once.
    useEffect(() => {
        if (!mapDiv.current || mapRef.current) {
            return undefined;
        }
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        const center: [number, number] = Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : GERMANY_CENTER;
        const map = L.map(mapDiv.current).setView(center, Number.isFinite(lat) ? 11 : 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        })
            .on("tileerror", () => setTilesFailed(true))
            .addTo(map);
        const marker = L.marker(center, { draggable: true, icon: PIN_ICON }).addTo(map);
        marker.on("dragend", () => {
            const p = marker.getLatLng();
            onChange(p.lat.toFixed(6), p.lng.toFixed(6));
        });
        map.on("click", (e: L.LeafletMouseEvent) => {
            marker.setLatLng(e.latlng);
            onChange(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
        });
        mapRef.current = map;
        markerRef.current = marker;
        // The container is often laid out after mount (tabs/accordions) — recompute size shortly after.
        setTimeout(() => map.invalidateSize(), 250);
        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep the marker/view in sync when the coordinates change from outside (fields, search, system).
    useEffect(() => {
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        if (mapRef.current && markerRef.current && Number.isFinite(lat) && Number.isFinite(lon)) {
            markerRef.current.setLatLng([lat, lon]);
            mapRef.current.setView([lat, lon]);
        }
    }, [latitude, longitude]);

    const runSearch = async (): Promise<void> => {
        if (!onGeocode || !address.trim()) {
            return;
        }
        setStatus(I18n.t("Searching…"));
        try {
            const r = await onGeocode(address.trim());
            if (r) {
                onChange(r.lat.toFixed(6), r.lon.toFixed(6));
                setStatus(r.displayName ?? "");
            } else {
                setStatus(I18n.t("No location found"));
            }
        } catch (e) {
            setStatus(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <Box sx={{ maxWidth: "50%", minWidth: 320 }}>
            <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap", alignItems: "center" }}>
                <TextField
                    size="small"
                    label={I18n.t("Search address")}
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            void runSearch();
                        }
                    }}
                    sx={{ minWidth: 260, flex: 1 }}
                />
                <Button
                    variant="outlined"
                    size="small"
                    onClick={() => void runSearch()}
                >
                    {I18n.t("Search")}
                </Button>
                {systemCoords ? (
                    <Button
                        size="small"
                        onClick={() => onChange(systemCoords.lat.toFixed(6), systemCoords.lon.toFixed(6))}
                    >
                        {I18n.t("Use system location")}
                    </Button>
                ) : null}
            </Box>
            {status ? <Typography sx={{ mb: 1, color: "text.secondary", fontSize: 12 }}>{status}</Typography> : null}
            <Box sx={{ position: "relative" }}>
                <div
                    ref={mapDiv}
                    style={{ height: 260, width: "100%", borderRadius: 4, overflow: "hidden" }}
                />
                {tilesFailed ? (
                    <Typography
                        sx={{
                            position: "absolute",
                            left: 8,
                            right: 8,
                            bottom: 8,
                            p: 1,
                            borderRadius: 1,
                            bgcolor: "rgba(0,0,0,0.65)",
                            color: "#fff",
                            fontSize: 12,
                        }}
                    >
                        {I18n.t(
                            "Map tiles could not load (the admin may block the external tile server). You can still set the location by clicking/dragging the marker, or via the coordinates and address search below.",
                        )}
                    </Typography>
                ) : null}
            </Box>
            <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                <TextField
                    size="small"
                    label={I18n.t("Latitude")}
                    value={latitude}
                    onChange={e => onChange(e.target.value, longitude)}
                    sx={{ width: 170 }}
                />
                <TextField
                    size="small"
                    label={I18n.t("Longitude")}
                    value={longitude}
                    onChange={e => onChange(latitude, e.target.value)}
                    sx={{ width: 170 }}
                />
            </Box>
            <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: 12 }}>
                {I18n.t("Click the map or drag the marker to set the location.")}
            </Typography>
        </Box>
    );
}
