
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  Polyline,
  useMap,
  useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { useThemeColors, useThemeName } from '../theme';

// Fix Leaflet marker icons.
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

// Philippines boundaries.
const PH_BOUNDS = [
  [4.5, 116.0],
  [21.5, 127.0]
];

const PH_CENTER = [12.8797, 121.774];
const PH_MIN_ZOOM = 7;
// One step deeper than CARTO renders, so a pin can be placed precisely. Leaflet
// is told the provider's real ceiling through maxNativeZoom and scales those
// tiles up, because asking CARTO for z19 returns HTTP 403 and leaves grey gaps.
const PH_MAX_ZOOM = 19;

const PH_MAP_PROPS = {
  maxBounds: PH_BOUNDS,
  maxBoundsViscosity: 1.0,
  minZoom: PH_MIN_ZOOM,
  maxZoom: PH_MAX_ZOOM
};

// CARTO API key from client/.env.
// Vite exposes VITE_ variables in browser code.
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY;

// Without a valid key CARTO serves a placeholder tile that reads "API key
// required" instead of a map, so tiles only come from CARTO when a key exists.
// OpenStreetMap needs no key and is used whenever there isn't one.
const HAS_CARTO_KEY =
  typeof CARTO_API_KEY === 'string' &&
  CARTO_API_KEY.trim().length > 0 &&
  CARTO_API_KEY !== 'undefined';

const TILES = {
  dark: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
  light: `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
};

// The three selectable basemaps. All come from CARTO when a key is configured,
// so they share one attribution. `streets` is CARTO's Voyager style, the most
// detailed of the three: street names, building footprints and points of
// interest, which is what makes an exact location easy to pick out.
const STYLE_URLS = {
  night: TILES.dark,
  streets: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
  muted: TILES.light,
};

// Exported so the map page can render a switcher without repeating this list.
// These keys are also the accepted values of the `basemap` prop.
export const BASEMAPS = [
  { key: 'night', label: 'Night' },
  { key: 'streets', label: 'Streets' },
  { key: 'muted', label: 'Muted' },
];


// OpenStreetMap fallback when CARTO is unavailable or the theme is unknown.
const OSM_TILE_URL =
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// `basemap` is one of the BASEMAPS keys, or null to follow the theme.
function getTileConfig(basemap, theme) {
  const isDarkTheme = String(theme || '').toLowerCase() !== 'light';
  const style = basemap || (isDarkTheme ? 'night' : 'muted');

  if (HAS_CARTO_KEY) {
    return {
      url: STYLE_URLS[style],
      attribution: CARTO_ATTRIBUTION,
      // Measured against the live service: CARTO serves z18 and answers z19
      // with HTTP 403, so z18 is the deepest real tile.
      maxNativeZoom: 18,
      // CARTO styles are designed for their theme, so none of them is dimmed.
      dim: false,
    };
  }

  // With no key CARTO answers with an "API key required" placeholder instead of
  // a map, so OpenStreetMap is used. That is a bright map, so it is dimmed to
  // sit under the dark UI - unless the user picked the street style on purpose.
  return {
    url: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    maxNativeZoom: 19,
    dim: isDarkTheme && !basemap,
  };
}

function hasCoordinates(latitude, longitude) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    latitude === '' ||
    longitude === ''
  ) {
    return false;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function MapTiles({ config }) {
  // The key makes React rebuild the layer when the style changes, so the old
  // tiles are dropped instead of being left underneath the new ones.
  return (
    <TileLayer
      key={config.url}
      attribution={config.attribution}
      url={config.url}
      maxZoom={PH_MAX_ZOOM}
      maxNativeZoom={config.maxNativeZoom}
    />
  );
}

// Allows the admin to pick a route point straight off the map. Rendered only while
// a pick is armed, so ordinary map clicks stay ordinary.
function MapClickPicker({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    }
  });

  return null;
}

// Frames the route on the map, so a destination that is off screen is brought into
// view instead of being left for the admin to hunt for.
function RouteFrame({ path }) {
  const map = useMap();

  useEffect(() => {
    if (path && path.length > 1) {
      // Capped, because framing one short turn would otherwise zoom to street level.
      map.fitBounds(path, { padding: [40, 40], maxZoom: 17 });
    }
  }, [map, path]);

  return null;
}

// Frames every report on screen, so a small dashboard map opens on the data it
// is showing instead of on the whole country. A single report is centred at a
// fixed zoom, because fitting one point would jump to the deepest tile.
function FitToReports({ points, enabled }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(points, { padding: [30, 30], maxZoom: 13 });
    }
  }, [map, points, enabled]);

  return null;
}

// Severity drives the pin colour on the operations map, following the same
// green-to-red ramp the rest of the app uses for danger levels.
const SEVERITY_COLOR_KEYS = {
  minor: 'green',
  moderate: 'amber',
  major: 'orange',
  fatal: 'red'
};

function ReportPopup({ report, showDetailsButton = false, user }) {
  return (
    <Popup>
      <div style={{ minWidth: 200 }}>
        <strong>{report.report_reference}</strong>

        {/* Dashboard map rows carry no title, so the line is skipped rather than left blank. */}
        {report.title && <div>{report.title}</div>}

        <div
          style={{
            fontSize: '0.875rem',
            color: 'hsl(var(--text-3))'
          }}
        >
          {report.location}
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <span className={`badge badge-${report.status}`}>
            {String(report.status || '').replace(/_/g, ' ')}
          </span>
        </div>

        {showDetailsButton && user && user.role !== 'reporter' && (
          <button
            className="btn btn-primary"
            style={{
              marginTop: '0.5rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem'
            }}
            onClick={() =>
              window.open(
                `/reports/${report.id}`,
                '_blank',
                'noopener,noreferrer'
              )
            }
          >
            View Details
          </button>
        )}
      </div>
    </Popup>
  );
}

export function ReportMap({
  reports = [],
  center = PH_CENTER,
  zoom = PH_MIN_ZOOM,
  height = 400,
  focus = null,
  colorBySeverity = false,
  colorFor = null,
  fitToReports = false,
  basemap = null,
  routePath = null,
  activePath = null,
  pickedPoints = [],
  onMapPick = null
}) {
  const { user } = useAuth();
  const c = useThemeColors();
  const theme = useThemeName();
  const [mapRef, setMapRef] = useState(null);
  const tileConfig = getTileConfig(basemap, theme);

  const reportPoints = useMemo(
    () => reports
      .filter((r) => hasCoordinates(r.latitude, r.longitude))
      .map((r) => [Number(r.latitude), Number(r.longitude)]),
    [reports]
  );

  useEffect(() => {
    if (
      mapRef &&
      hasCoordinates(focus?.latitude, focus?.longitude)
    ) {
      mapRef.flyTo(
        [Number(focus.latitude), Number(focus.longitude)],
        15
      );
    }
  }, [mapRef, focus]);

  // Leaflet caches its own size, so it has to be told to re-measure whenever the
  // pane changes: the drawer opening, the alert bar wrapping onto another line,
  // or the window resizing. Otherwise tiles are laid out for the old size and
  // grey gaps appear. ResizeObserver fires once on observe, which also covers
  // the very first measurement.
  useEffect(() => {
    if (!mapRef) return undefined;

    const observer = new ResizeObserver(() => mapRef.invalidateSize());
    observer.observe(mapRef.getContainer());

    return () => observer.disconnect();
  }, [mapRef]);

  return (
    <div
      className={tileConfig.dim ? 'map--osm' : undefined}
      style={{
        height,
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        ref={setMapRef}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        {...PH_MAP_PROPS}
      >
        <MapTiles config={tileConfig} />

        {fitToReports && <FitToReports points={reportPoints} enabled />}

        {onMapPick && <MapClickPicker onPick={onMapPick} />}

        {routePath && routePath.length > 1 && (
          <>
            {/* While navigating, the map follows the current turn rather than the
                whole route, so the next instruction is the thing on screen. */}
            <RouteFrame path={activePath && activePath.length > 1 ? activePath : routePath} />
            {/* A dark casing under the line keeps it readable on the pale basemaps. */}
            <Polyline
              positions={routePath}
              pathOptions={{ color: '#0b1220', weight: 8, opacity: 0.5 }}
            />
            <Polyline
              positions={routePath}
              pathOptions={{ color: c.accent, weight: 4, opacity: 0.9 }}
            />
          </>
        )}

        {activePath && activePath.length > 1 && (
          <Polyline
            positions={activePath}
            pathOptions={{ color: c.amber, weight: 6, opacity: 1 }}
          />
        )}

        {pickedPoints.map(point => (
          <CircleMarker
            key={point.kind}
            center={[point.latitude, point.longitude]}
            radius={7}
            color="#0b1220"
            weight={2}
            fillColor={point.kind === 'start' ? c.green : c.red}
            fillOpacity={1}
          />
        ))}

        {hasCoordinates(focus?.latitude, focus?.longitude) && (
          <CircleMarker
            center={[
              Number(focus.latitude),
              Number(focus.longitude)
            ]}
            radius={18}
            color={c.amber}
            fillColor={c.amber}
            fillOpacity={0.35}
          />
        )}

        {reports.map((report) => {
          if (
            !hasCoordinates(report.latitude, report.longitude)
          ) {
            return null;
          }

          const position = [
            Number(report.latitude),
            Number(report.longitude)
          ];

          if (!colorBySeverity) {
            // `colorFor` lets a caller (the dashboard) colour pins by its own
            // field, such as verified versus still-pending.
            if (colorFor) {
              return (
                <CircleMarker
                  key={report.id}
                  center={position}
                  radius={7}
                  color="#0b1220"
                  weight={2}
                  fillColor={colorFor(report)}
                  fillOpacity={1}
                >
                  <ReportPopup
                    report={report}
                    showDetailsButton
                    user={user}
                  />
                </CircleMarker>
              );
            }

            return (
              <Marker key={report.id} position={position}>
                <ReportPopup
                  report={report}
                  showDetailsButton
                  user={user}
                />
              </Marker>
            );
          }

          // A wide translucent halo behind a solid core reads as a hotspot pin
          // over both the dark and the light tile sets. Both parts glow in the
          // severity colour; the halo also breathes (see .ops-pin--* in CSS).
          const severityKey = SEVERITY_COLOR_KEYS[report.severity]
            ? report.severity
            : 'unknown';
          const color = c[SEVERITY_COLOR_KEYS[report.severity]] || c.muted;

          return (
            <Fragment key={report.id}>
              <CircleMarker
                center={position}
                radius={16}
                stroke={false}
                fillColor={color}
                fillOpacity={0.22}
                className={`sev-${severityKey} ops-pin--halo`}
              />
              <CircleMarker
                center={position}
                radius={6}
                color={color}
                fillColor={color}
                fillOpacity={0.95}
                weight={1.5}
                className={`sev-${severityKey} ops-pin--core`}
              >
                <ReportPopup
                  report={report}
                  showDetailsButton
                  user={user}
                />
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

export function SingleReportMap({ report, height = 300 }) {
  const c = useThemeColors();
  const theme = useThemeName();
  const tileConfig = getTileConfig(null, theme);

  if (
    !report ||
    !hasCoordinates(report.latitude, report.longitude)
  ) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'hsl(var(--text-3))'
        }}
      >
        No location data
      </div>
    );
  }

  const position = [
    Number(report.latitude),
    Number(report.longitude)
  ];

  const statusColor = c.status?.[report.status] || c.muted;

  return (
    <div
      className={tileConfig.dim ? 'map--osm' : undefined}
      style={{
        height,
        width: '100%',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <MapContainer
        center={position}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        {...PH_MAP_PROPS}
      >
        <MapTiles config={tileConfig} />

        <Marker position={position}>
          <ReportPopup report={report} />
        </Marker>

        <CircleMarker
          center={position}
          radius={50}
          color={statusColor}
          fillColor={statusColor}
          fillOpacity={0.2}
        />
      </MapContainer>
    </div>
  );
}
