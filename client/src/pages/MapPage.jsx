import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  VEHICLES,
  googleMapsDirectionsUrl,
  isSamePlace,
  planRoute,
  searchPlaces
} from '../services/routing';
import { BASEMAPS, ReportMap } from '../components/MapView';
import PlacePicker from '../components/PlacePicker';
import { useThemeName } from '../theme';

// The Philippines uses one national emergency number. Agency-specific hotlines
// are not configured anywhere in this system, so every contact card dials 911
// and says so rather than displaying a number that could be wrong.
const EMERGENCY_NUMBER = '911';

const ICONS = {
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  route: 'M3 11l19-8-8 19-2-9-9-2z',
  phone: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z',
  police: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z',
  fire: 'M12 3c3 4 5 6 5 9a5 5 0 01-10 0c0-2 1-3.4 2-4.4 0 2 1 3 2 3 0-3 1-4.6 1-7.6z',
  medical: 'M12 5v14M5 12h14',
  disaster: 'M12 4l9 16H3l9-16zM12 10v4M12 17.5h.01',
  coastguard: 'M12 8v12M12 8a2 2 0 100-4 2 2 0 000 4zM5 13a7 7 0 0014 0',
  weather: 'M7 18a4 4 0 010-8 5 5 0 019.6-1A3.5 3.5 0 0117 18H7z'
};

const EMERGENCY_CONTACTS = [
  { key: 'police', name: 'Police', agency: 'PNP' },
  { key: 'fire', name: 'Fire protection', agency: 'BFP' },
  { key: 'medical', name: 'Medical rescue', agency: 'EMS' },
  { key: 'disaster', name: 'Disaster response', agency: 'NDRRMC' },
  { key: 'coastguard', name: 'Coast guard', agency: 'PCG' },
  { key: 'weather', name: 'Weather service', agency: 'PAGASA' }
];

// Ordered worst first so the layer list matches the severity ramp.
const SEVERITIES = [
  { key: 'fatal', label: 'Fatal' },
  { key: 'major', label: 'Major' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'minor', label: 'Minor' },
  { key: 'unknown', label: 'Unclassified' }
];

const LOCATION_LABEL = {
  idle: 'Location access has not been requested yet.',
  locating: 'Requesting location permission...',
  granted: 'Location permission granted.',
  denied: 'Permission denied. Allow location access in your browser, then retry.',
  unsupported: 'This browser does not support location access.',
  error: 'Your location could not be read. Try again.'
};

function severityKey(report) {
  return report.severity || 'unknown';
}

function timeAgo(value) {
  if (!value) return 'time unknown';

  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'time unknown';

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.round(hours / 24)} d ago`;
}

// Travelling times from the routing service are in minutes and can run into
// hours, so they are shown as hours and minutes once they pass an hour.
function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return 'unknown';

  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  return `${hours} h ${Math.round(minutes % 60)} min`;
}

// Single turns are usually a few hundred metres, which reads better in metres.
function formatDistance(km) {
  if (!Number.isFinite(km)) return 'unknown';

  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function Icon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function MapPage() {
  const navigate = useNavigate();
  const theme = useThemeName();
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState([]);
  const [geo, setGeo] = useState({ state: 'idle' });
  const [sideOpen, setSideOpen] = useState(false);
  const [hotlinesOpen, setHotlinesOpen] = useState(false);
  // The layers card (basemap + severity filters) starts folded away so the map
  // keeps the space, and unfolds from its own button.
  const [layersOpen, setLayersOpen] = useState(false);
  // Same idea for the route card: folded away until its button is used.
  const [routeOpen, setRouteOpen] = useState(false);
  // Route planning. `routeFrom` holds a point key, or 'gps' for the admin's own
  // position. `routeTo` is null until the admin picks a destination, which lets
  // the card follow whichever report is selected on the map.
  const [routeFrom, setRouteFrom] = useState('gps');
  // The text shown in each field. null means "not typed", so the field shows
  // whichever point is currently chosen; '' means the admin cleared it.
  const [fromText, setFromText] = useState(null);
  const [toText, setToText] = useState(null);
  const [routeTo, setRouteTo] = useState(null);
  const [vehicle, setVehicle] = useState('car');
  const [route, setRoute] = useState({ state: 'idle' });
  // Points the admin drops on the map instead of choosing a report, and which of
  // the two ends the next map click fills in.
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);
  const [pickTarget, setPickTarget] = useState(null);
  // The turn currently being followed, or null when the route is only being viewed.
  const [navStep, setNavStep] = useState(null);
  // Chosen basemap, remembered between visits like the theme is. Until the user
  // picks one, the map follows the theme: night on dark, muted on light.
  const [basemap, setBasemap] = useState(() => {
    const saved = localStorage.getItem('mapBasemap');
    return BASEMAPS.some(option => option.key === saved) ? saved : null;
  });
  const activeBasemap = basemap || (theme === 'light' ? 'muted' : 'night');
  // Shown on the folded layers card, so the current basemap stays readable while
  // the switcher itself is hidden.
  const activeBasemapLabel = BASEMAPS.find(option => option.key === activeBasemap)?.label || activeBasemap;
  // Shown on the folded route card, so a planned route stays readable while the
  // fields are put away. Kept short: a full turn instruction would wrap the header.
  const routeSummary = route.state === 'ok'
    ? navStep === null
      ? `${route.distanceKm.toFixed(1)} km · ${formatDuration(route.durationMin)}`
      : `Step ${navStep + 1} of ${route.steps.length}`
    : VEHICLES.find(option => option.key === vehicle)?.label || 'Not planned';

  const chooseBasemap = useCallback(key => {
    setBasemap(key);
    localStorage.setItem('mapBasemap', key);
  }, []);

  // On desktop the map fills the viewport, so Leaflet's own controls and the two
  // floating stacks would otherwise start underneath the top bar. The height of
  // that chrome changes with the window width and with how many links the signed
  // in role shows, so it is measured from the alert bar rather than assumed. A
  // callback ref does the first measurement, not a mount effect: StrictMode's
  // simulated remount detaches the ref before the effect body runs, so a mount
  // effect would read null and leave the variable unset until the first resize.
  const alertRef = useRef(null);
  const measureChrome = useCallback(() => {
    const alert = alertRef.current;
    if (!alert) return;
    document.documentElement.style.setProperty(
      '--ops-chrome-h',
      `${Math.round(alert.getBoundingClientRect().bottom)}px`
    );
  }, []);
  const attachAlert = useCallback(node => {
    alertRef.current = node;
    if (node) measureChrome();
  }, [measureChrome]);

  useLayoutEffect(() => {
    measureChrome();
    window.addEventListener('resize', measureChrome);
    const nav = document.querySelector('.navbar');
    const observer = new ResizeObserver(measureChrome);
    if (nav) observer.observe(nav);

    return () => {
      window.removeEventListener('resize', measureChrome);
      observer.disconnect();
    };
  }, [measureChrome]);

  useEffect(() => {
    let active = true;

    api.get('/reports')
      .then(res => {
        if (active) setReports(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (active) setError('Reports could not be loaded. Check that the API is running.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  // Only reports with coordinates can be pinned.
  const located = useMemo(
    () => reports.filter(r => r.latitude && r.longitude),
    [reports]
  );

  const visible = useMemo(
    () => located.filter(r => !hidden.includes(severityKey(r))),
    [located, hidden]
  );

  const counts = useMemo(() => {
    const bySeverity = { fatal: 0, major: 0, moderate: 0, minor: 0, unknown: 0 };
    located.forEach(r => { bySeverity[severityKey(r)] += 1; });
    return bySeverity;
  }, [located]);

  const pending = useMemo(
    () => reports.filter(r => r.status === 'submitted' || r.status === 'under_review').length,
    [reports]
  );

  const resolved = useMemo(
    () => reports.filter(r => r.status === 'resolved').length,
    [reports]
  );

  const critical = counts.fatal + counts.major;

  const latestCritical = useMemo(
    () => located
      .filter(r => r.severity === 'fatal' || r.severity === 'major')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null,
    [located]
  );

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ state: 'unsupported' });
      return;
    }

    setGeo({ state: 'locating' });

    navigator.geolocation.getCurrentPosition(
      position => {
        setGeo({
          state: 'granted',
          accuracy: Math.round(position.coords.accuracy),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setSelected(null);
        setFocus({
          id: 'current-location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      err => setGeo({ state: err.code === 1 ? 'denied' : 'error' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const selectReport = useCallback(report => {
    setSelected(report);
    setFocus(report);
  }, []);

  // Every point a route can start or end at: the reports that carry coordinates,
  // plus the admin's own position once it has been shared. A Map keeps the point
  // objects stable between renders, so the fetch below only reruns when the
  // chosen points or the vehicle actually change.
  const pointsByKey = useMemo(() => {
    const map = new Map();

    located.forEach(report => {
      map.set(`report-${report.id}`, {
        key: `report-${report.id}`,
        label: `${report.report_reference} - ${report.location}`,
        latitude: Number(report.latitude),
        longitude: Number(report.longitude)
      });
    });

    if (Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)) {
      map.set('gps', {
        key: 'gps',
        label: 'My location (GPS)',
        latitude: geo.latitude,
        longitude: geo.longitude
      });
    }

    if (customStart) {
      map.set('pick-start', { key: 'pick-start', ...customStart });
    }

    if (customEnd) {
      map.set('pick-end', { key: 'pick-end', ...customEnd });
    }

    return map;
  }, [located, geo.latitude, geo.longitude, customStart, customEnd]);

  const fromPoint = pointsByKey.get(routeFrom) || null;

  const toKey = routeTo === null
    ? (selected ? `report-${selected.id}` : located[0] ? `report-${located[0].id}` : null)
    : routeTo || null;
  const toPoint = toKey ? pointsByKey.get(toKey) || null : null;

  // Reports filed at the same corner are separate records at one spot, so the two
  // ends can legitimately be the same place. Neither the routing engine nor Google
  // Maps can route from a place to itself, so it is reported rather than attempted.
  const samePlace = isSamePlace(fromPoint, toPoint);

  // What each field shows: the typed text once there is any, otherwise the label of
  // the point currently chosen, so the field always describes the actual route.
  const fromDisplay = fromText === null ? (fromPoint?.label || '') : fromText;
  const toDisplay = toText === null ? (toPoint?.label || '') : toText;

  // Everything already known locally: the admin's own position, then the mapped
  // reports. Typing narrows this list, so focusing an empty field shows the whole
  // list, which is the dropdown behaviour this replaced.
  const localOptions = useMemo(() => {
    const items = [];

    const gps = pointsByKey.get('gps');
    if (gps) items.push({ ...gps, hint: 'Your location' });

    located.forEach(report => {
      items.push({
        key: `report-${report.id}`,
        label: `${report.report_reference} - ${report.location}`,
        latitude: Number(report.latitude),
        longitude: Number(report.longitude),
        hint: 'Report'
      });
    });

    return items;
  }, [pointsByKey, located]);

  const narrow = (items, text, chosenLabel) => {
    const query = (text || '').trim();
    if (!query || query === chosenLabel) return items;
    const lower = query.toLowerCase();
    return items.filter(item => item.label.toLowerCase().includes(lower));
  };

  // Typing abandons the previous choice, so a half-typed place never quietly routes
  // to whatever was selected before.
  const changeFrom = useCallback(value => {
    setFromText(value);
    setRouteFrom('');
    setCustomStart(null);
  }, []);

  const chooseFrom = useCallback(point => {
    setFromText(point.label);

    if (point.source === 'search') {
      setCustomStart({ latitude: point.latitude, longitude: point.longitude, label: point.label });
      setRouteFrom('pick-start');
      return;
    }

    setRouteFrom(point.key);
    setCustomStart(null);
  }, []);

  const changeTo = useCallback(value => {
    setToText(value);
    setRouteTo('');
    setCustomEnd(null);
  }, []);

  const chooseTo = useCallback(point => {
    setToText(point.label);

    if (point.source === 'search') {
      setCustomEnd({ latitude: point.latitude, longitude: point.longitude, label: point.label });
      setRouteTo('pick-end');
      return;
    }

    setRouteTo(point.key);
    setCustomEnd(null);
  }, []);

  const handleMapPick = useCallback((latitude, longitude) => {
    const label = `Map point (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

    if (pickTarget === 'start') {
      setCustomStart({ latitude, longitude, label });
      setRouteFrom('pick-start');
      setFromText(label);
    } else {
      setCustomEnd({ latitude, longitude, label });
      setRouteTo('pick-end');
      setToText(label);
    }

    setPickTarget(null);
  }, [pickTarget]);

  useEffect(() => {
    if (!fromPoint || !toPoint || samePlace) {
      setRoute({ state: 'idle' });
      return undefined;
    }

    const controller = new AbortController();
    setRoute({ state: 'loading' });

    planRoute({ from: fromPoint, to: toPoint, vehicle, signal: controller.signal })
      .then(result => {
        setRoute({ state: 'ok', ...result });
        // A new route means the old turn numbers no longer apply.
        setNavStep(null);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setRoute({ state: 'error', message: err.message });
      });

    return () => controller.abort();
  }, [fromPoint, toPoint, samePlace, vehicle]);

  // The stretch of road the current turn covers, so the map can highlight it.
  const activePath = useMemo(() => {
    if (route.state !== 'ok' || navStep === null) return null;

    const step = route.steps[navStep];
    if (!step || !Number.isFinite(step.beginIndex) || !Number.isFinite(step.endIndex)) {
      return null;
    }

    return route.path.slice(step.beginIndex, step.endIndex + 1);
  }, [route, navStep]);

  const remaining = useMemo(() => {
    if (route.state !== 'ok' || navStep === null) return null;

    return route.steps.slice(navStep).reduce(
      (total, step) => ({
        distanceKm: total.distanceKm + (step.distanceKm || 0),
        minutes: total.minutes + (step.durationMin || 0)
      }),
      { distanceKm: 0, minutes: 0 }
    );
  }, [route, navStep]);

  const toggleLayer = useCallback(key => {
    setHidden(prev => (
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    ));
  }, []);

  if (loading) return <div className="container">Loading operations map...</div>;

  return (
    <div className="ops-page">
      <div
        ref={attachAlert}
        className={`ops-alert ${critical ? 'is-critical' : 'is-clear'}`}
        role="status"
      >
        <span className="ops-alert-icon" aria-hidden="true">!</span>

        {critical > 0 ? (
          <>
            <strong>
              {critical} major or fatal accident {critical === 1 ? 'report' : 'reports'}
            </strong>
            {latestCritical && (
              <span className="ops-alert-detail">
                Most recent: {latestCritical.report_reference} at {latestCritical.location},{' '}
                {timeAgo(latestCritical.created_at)}
              </span>
            )}
            {critical > 1 && <span className="ops-alert-more">+{critical - 1} more</span>}
          </>
        ) : (
          <>
            <strong>No major or fatal accidents on record</strong>
            <span className="ops-alert-detail">
              {pending} {pending === 1 ? 'report' : 'reports'} awaiting review
            </span>
          </>
        )}

        {error && <span className="ops-alert-more">{error}</span>}
      </div>

      <div className={`ops-body ${sideOpen ? 'is-side-open' : ''}`}>
        <aside className="ops-side" aria-label="Operations sidebar">
          <button
            type="button"
            className="ops-drawer-close"
            onClick={() => setSideOpen(false)}
          >
            Close panel
          </button>

          <div className="ops-brand">
            <span className="ops-brand-mark" aria-hidden="true">
              <Icon name="disaster" />
            </span>
            <div>
              <strong>Road Accident Reporting</strong>
              <span className="muted">Operations map</span>
            </div>
          </div>

          <section className="ops-section">
            <h2 className="ops-sec-title">Current situation</h2>
            <div className="ops-stat-grid">
              <div className="ops-stat">
                <span className="ops-stat-value numeric">{reports.length}</span>
                <span className="ops-stat-label">Visible to you</span>
              </div>
              <div className="ops-stat">
                <span className="ops-stat-value numeric">{pending}</span>
                <span className="ops-stat-label">Awaiting review</span>
              </div>
              <div className="ops-stat">
                <span className="ops-stat-value numeric">{located.length}</span>
                <span className="ops-stat-label">Mapped</span>
              </div>
              <div className="ops-stat">
                <span className="ops-stat-value numeric">{resolved}</span>
                <span className="ops-stat-label">Resolved</span>
              </div>
            </div>
          </section>

          <section className="ops-section">
            <h2 className="ops-sec-title">Severity mix</h2>
            <ul className="ops-mix">
              {SEVERITIES.map(severity => {
                const value = counts[severity.key];
                const width = located.length ? (value / located.length) * 100 : 0;

                return (
                  <li key={severity.key} className={`ops-mix-row sev-${severity.key}`}>
                    <span className="ops-mix-label">{severity.label}</span>
                    <span className="ops-mix-bar">
                      <span style={{ width: `${width}%` }} />
                    </span>
                    <span className="ops-mix-value numeric">{value}</span>
                  </li>
                );
              })}
            </ul>
            <p className="ops-note">Counts cover only the reports your account can see.</p>
          </section>

          <section className="ops-section">
            <h2 className="ops-sec-title">Mapped reports ({visible.length})</h2>

            {located.length === 0 ? (
              <p className="ops-empty">
                No report carries coordinates yet. A report needs a latitude and
                longitude before it can appear on the map.
              </p>
            ) : visible.length === 0 ? (
              <p className="ops-empty">
                Every severity layer is hidden. Turn one back on in the map controls.
              </p>
            ) : (
              <ul className="map-list">
                {visible.map(report => (
                  <li key={report.id}>
                    <button
                      type="button"
                      className={`map-list-item ${selected?.id === report.id ? 'is-selected' : ''}`}
                      onClick={() => selectReport(report)}
                    >
                      <span className="map-list-ref">{report.report_reference}</span>
                      <span className="map-list-title">{report.title}</span>
                      <span className="map-list-loc muted">
                        {report.location} - {timeAgo(report.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ops-section">
            <h2 className="ops-sec-title">Your location</h2>
            <p className={`ops-loc is-${geo.state}`}>
              {LOCATION_LABEL[geo.state]}
              {geo.state === 'granted' && geo.accuracy ? ` Accurate to about ${geo.accuracy} m.` : ''}
            </p>
            <button
              type="button"
              className="btn btn-secondary ops-wide"
              onClick={requestLocation}
              disabled={geo.state === 'locating' || geo.state === 'unsupported'}
            >
              {geo.state === 'locating' ? 'Locating...' : 'Use my location'}
            </button>
          </section>

          <section className="ops-section">
            <button
              type="button"
              className={`ops-expander ${hotlinesOpen ? 'is-open' : ''}`}
              aria-expanded={hotlinesOpen}
              aria-controls="ops-hotlines"
              onClick={() => setHotlinesOpen(open => !open)}
            >
              <span className="ops-contact-icon" aria-hidden="true">
                <Icon name="phone" />
              </span>
              <span className="ops-expander-text">
                <strong>Emergency hotlines</strong>
                <span className="muted">{hotlinesOpen ? 'Hide' : 'Call 911'}</span>
              </span>
              <span className="ops-expander-chevron" aria-hidden="true">
                {hotlinesOpen ? '−' : '+'}
              </span>
            </button>

            {hotlinesOpen && (
              <div id="ops-hotlines" className="ops-hotlines">
                <a className="ops-hotline" href={`tel:${EMERGENCY_NUMBER}`}>
                  <Icon name="medical" />
                  <span>
                    <strong className="numeric">{EMERGENCY_NUMBER}</strong>
                    <span className="muted">National emergency line</span>
                  </span>
                </a>

                <ul className="ops-contacts">
                  {EMERGENCY_CONTACTS.map(contact => (
                    <li key={contact.key} className="ops-contact">
                      <span className="ops-contact-icon" aria-hidden="true">
                        <Icon name={contact.key} />
                      </span>
                      <span className="ops-contact-text">
                        <strong>{contact.name}</strong>
                        <span className="muted">{contact.agency}</span>
                      </span>
                      <a
                        className="btn btn-danger ops-call"
                        href={`tel:${EMERGENCY_NUMBER}`}
                        aria-label={`Call ${contact.name} on the national emergency line`}
                      >
                        Call
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="ops-note">
                  Agency-specific numbers are not configured, so every card dials the
                  national emergency line.
                </p>
              </div>
            )}
          </section>
        </aside>

        <div className="ops-map">
          <button
            type="button"
            className="ops-side-toggle"
            onClick={() => setSideOpen(open => !open)}
            aria-expanded={sideOpen}
          >
            {sideOpen ? 'Hide panel' : 'Panel'}
          </button>

          <ReportMap
            reports={visible}
            focus={focus}
            height="100%"
            colorBySeverity
            basemap={activeBasemap}
            routePath={route.state === 'ok' ? route.path : null}
            activePath={activePath}
            pickedPoints={[
              customStart && { kind: 'start', ...customStart },
              customEnd && { kind: 'end', ...customEnd }
            ].filter(Boolean)}
            onMapPick={pickTarget ? handleMapPick : null}
          />

          {selected && (
            <article className="ops-float ops-float--detail">
              <header className="ops-float-head">
                <span className="map-list-ref">{selected.report_reference}</span>
                <button
                  type="button"
                  className="ops-close"
                  onClick={() => { setSelected(null); setFocus(null); }}
                  aria-label="Close report card"
                >
                  x
                </button>
              </header>

              <h3>{selected.title}</h3>
              <p className="muted ops-detail-loc">{selected.location}</p>

              <dl className="ops-rows">
                <div>
                  <dt>Reported</dt>
                  <dd>{timeAgo(selected.created_at)}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd>
                    <span className={`ops-sev sev-${severityKey(selected)}`}>
                      {selected.severity || 'unclassified'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`badge badge-${selected.status}`}>
                      {String(selected.status || '').replace(/_/g, ' ')}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{selected.category_name || 'Not set'}</dd>
                </div>
                <div>
                  <dt>Vehicles</dt>
                  <dd className="numeric">{selected.vehicles_involved || 0}</dd>
                </div>
                <div>
                  <dt>Injuries</dt>
                  <dd className="numeric">{selected.injuries || 0}</dd>
                </div>
                <div>
                  <dt>Fatalities</dt>
                  <dd className="numeric">{selected.fatalities || 0}</dd>
                </div>
                <div>
                  <dt>Reporter</dt>
                  <dd>{selected.reporter_name || 'Unknown'}</dd>
                </div>
              </dl>

              <button
                type="button"
                className="btn btn-primary ops-wide"
                onClick={() => navigate(`/reports/${selected.id}`)}
              >
                Open full report
              </button>
            </article>
          )}

          <div className="ops-rail">
            <div className={`ops-float ops-float--route ${routeOpen ? '' : 'is-folded'}`}>
              <button
                type="button"
                className="ops-expander ops-expander--plain ops-route-head"
                aria-expanded={routeOpen}
                onClick={() => setRouteOpen(open => !open)}
              >
                <span className="ops-contact-icon" aria-hidden="true">
                  <Icon name="route" />
                </span>
                <span className="ops-expander-text">
                  <strong>Plan your route</strong>
                  <span className="muted">{routeSummary}</span>
                </span>
                <span className="ops-expander-chevron" aria-hidden="true">
                  {routeOpen ? '−' : '+'}
                </span>
              </button>

              <div className="ops-route-field">
                <PlacePicker
                  id="route-from"
                  label="Start"
                  text={fromDisplay}
                  placeholder="Type a place, or pick a report"
                  options={narrow(localOptions, fromDisplay, fromPoint?.label)}
                  search={searchPlaces}
                  onTextChange={changeFrom}
                  onChoose={chooseFrom}
                />
                <button
                  type="button"
                  className={`ops-pick ${pickTarget === 'start' ? 'is-armed' : ''}`}
                  aria-pressed={pickTarget === 'start'}
                  onClick={() => setPickTarget(target => (target === 'start' ? null : 'start'))}
                >
                  {pickTarget === 'start' ? 'Click the map to set the start' : 'Set start on the map'}
                </button>
              </div>

              <div className="ops-route-field">
                <PlacePicker
                  id="route-to"
                  label="End"
                  text={toDisplay}
                  placeholder="Type a place, or pick a report"
                  options={narrow(localOptions, toDisplay, toPoint?.label)}
                  search={searchPlaces}
                  onTextChange={changeTo}
                  onChoose={chooseTo}
                />
                <button
                  type="button"
                  className={`ops-pick ${pickTarget === 'end' ? 'is-armed' : ''}`}
                  aria-pressed={pickTarget === 'end'}
                  onClick={() => setPickTarget(target => (target === 'end' ? null : 'end'))}
                >
                  {pickTarget === 'end' ? 'Click the map to set the end' : 'Set end on the map'}
                </button>
              </div>

              <div className="ops-route-field">
                <span className="ops-layers-title">Vehicle</span>
                <div className="ops-vehicles" role="group" aria-label="Vehicle">
                  {VEHICLES.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      className={`ops-vehicle ${vehicle === option.key ? 'is-active' : ''}`}
                      aria-pressed={vehicle === option.key}
                      onClick={() => setVehicle(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {route.state === 'loading' && <p className="ops-note">Finding the best road route...</p>}

              {route.state === 'ok' && (
                <dl className="ops-rows">
                  <div>
                    <dt>Distance</dt>
                    <dd className="numeric">{route.distanceKm.toFixed(1)} km</dd>
                  </div>
                  <div>
                    <dt>{vehicle === 'motorcycle' ? 'Riding time' : 'Driving time'}</dt>
                    <dd className="numeric">{formatDuration(route.durationMin)}</dd>
                  </div>
                  <div>
                    <dt>Turns</dt>
                    <dd className="numeric">{route.steps.length}</dd>
                  </div>
                </dl>
              )}

              {route.state === 'error' && <p className="ops-note">{route.message}</p>}

              {route.state === 'idle' && (
                <p className="ops-note">
                  {!fromPoint || !toPoint
                    ? 'Type a start and an end, or pick a report. A point can also be set on the map.'
                    : 'The start and the end are the same place, so there is no route between them. Google Maps cannot plan one either.'}
                </p>
              )}

              {route.state === 'ok' && navStep === null && (
                <button
                  type="button"
                  className="btn btn-primary ops-wide"
                  onClick={() => setNavStep(0)}
                >
                  Navigate in this page
                </button>
              )}

              {route.state === 'ok' && navStep !== null && (
                <div className="ops-nav">
                  <div className="ops-nav-head">
                    <span className="ops-layers-title">
                      {`Step ${navStep + 1} of ${route.steps.length}`}
                    </span>
                    {remaining && (
                      <span className="numeric ops-nav-remaining">
                        {`${formatDistance(remaining.distanceKm)} left`}
                      </span>
                    )}
                  </div>

                  <p className="ops-nav-turn">{route.steps[navStep]?.instruction}</p>

                  <div className="ops-nav-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={navStep === 0}
                      onClick={() => setNavStep(step => Math.max(0, step - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={navStep >= route.steps.length - 1}
                      onClick={() => setNavStep(step => Math.min(route.steps.length - 1, step + 1))}
                    >
                      Next
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary ops-wide"
                    onClick={() => setNavStep(null)}
                  >
                    End navigation
                  </button>
                </div>
              )}

              {fromPoint && toPoint && !samePlace ? (
                <a
                  className="btn btn-secondary ops-wide"
                  href={googleMapsDirectionsUrl(fromPoint, toPoint)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps
                </a>
              ) : (
                <button type="button" className="btn btn-secondary ops-wide" disabled>
                  Open in Google Maps
                </button>
              )}

              <p className="ops-note">
                Distances and turns come from OpenStreetMap's Valhalla engine. Motorcycle
                routes avoid expressways, which motorcycles are banned from.
              </p>
            </div>

            <div className="ops-actions">
              <div className="ops-layers">
                <button
                  type="button"
                  className="ops-expander ops-expander--plain"
                  aria-expanded={layersOpen}
                  aria-controls="ops-layers-body"
                  onClick={() => setLayersOpen(open => !open)}
                >
                  <span className="ops-contact-icon" aria-hidden="true">
                    <Icon name="layers" />
                  </span>
                  <span className="ops-expander-text">
                    <strong>Map layers</strong>
                    <span className="muted">{activeBasemapLabel}</span>
                  </span>
                  <span className="ops-expander-chevron" aria-hidden="true">
                    {layersOpen ? '−' : '+'}
                  </span>
                </button>

                {layersOpen && (
                  <div id="ops-layers-body" className="ops-layers-body">
                    <div className="ops-basemaps" role="group" aria-label="Basemap style">
                      {BASEMAPS.map(option => (
                        <button
                          key={option.key}
                          type="button"
                          className={`ops-basemap ${activeBasemap === option.key ? 'is-active' : ''}`}
                          aria-pressed={activeBasemap === option.key}
                          onClick={() => chooseBasemap(option.key)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="ops-layers-list">
                      <span className="ops-layers-title">Severity</span>
                      {SEVERITIES.map(severity => (
                        <label key={severity.key} className="ops-layer">
                          <input
                            type="checkbox"
                            checked={!hidden.includes(severity.key)}
                            onChange={() => toggleLayer(severity.key)}
                          />
                          <span>{severity.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-primary ops-report-btn"
                onClick={() => navigate('/reports/new')}
              >
                Report accident
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
