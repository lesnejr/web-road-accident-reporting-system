// Route planning for the operations map.
//
// This project has no routing engine and no routing API key, so routes are asked
// of Valhalla, the routing engine behind OpenStreetMap run by FOSSGIS. It is free
// and needs no key. It is somebody else's service, so every failure surfaces as an
// error the admin can read: no distance, travel time or turn is ever invented.

const ROUTE_ENDPOINT = 'https://valhalla1.openstreetmap.de/route';

// The vehicles an admin can send a responder with. Google Maps has no motorcycle
// routing mode, so both hand off to Google as `driving`; the difference is made by
// the routing engine below.
export const VEHICLES = [
  { key: 'car', label: 'Car' },
  { key: 'motorcycle', label: 'Motorcycle' }
];

function hasCoordinates(point) {
  return (
    Boolean(point) &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

function metresApart(a, b) {
  const toRad = degrees => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  // Equirectangular distance: accurate to well under a metre at this scale, and
  // this is only ever asked about points a few metres apart.
  const x = dLng * Math.cos(toRad((a.latitude + b.latitude) / 2));

  return Math.hypot(dLat, x) * earthRadius;
}

// Two points on the same spot cannot be routed between, and Google Maps answers
// "could not calculate driving directions" when both ends are one place. Reports
// filed at the same corner are separate records with identical coordinates, so
// this is a normal case rather than a bad one.
export function isSamePlace(a, b) {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return false;

  return metresApart(a, b) < 10;
}

// Valhalla returns the route geometry as an encoded polyline at six decimal places:
// the Google polyline algorithm with a 1e6 factor. Decoded into [lat, lng] pairs
// that Leaflet can draw directly.
export function decodePolyline(encoded, precision = 6) {
  const factor = 10 ** precision;
  const coordinates = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += readDelta();
    longitude += readDelta();
    coordinates.push([latitude / factor, longitude / factor]);
  }

  return coordinates;
}

// Plans a real road route between two points and returns
// { distanceKm, durationMin, path, steps }. Throws a readable message when the
// service cannot answer.
export async function planRoute({ from, to, vehicle, signal }) {
  if (!hasCoordinates(from) || !hasCoordinates(to)) {
    throw new Error('A start and an end point are both needed.');
  }

  const motorcycle = vehicle === 'motorcycle';

  const body = {
    locations: [
      { lat: from.latitude, lon: from.longitude },
      { lat: to.latitude, lon: to.longitude }
    ],
    costing: motorcycle ? 'motorcycle' : 'auto',
    directions_options: { units: 'kilometers' }
  };

  // Motorcycles are banned from Philippine expressways, so the motorcycle route is
  // asked to avoid them rather than being handed the car route unchanged.
  if (motorcycle) {
    body.costing_options = { motorcycle: { use_highways: 0 } };
  }

  let response;

  try {
    response = await fetch(ROUTE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    // An aborted request is a normal React cleanup, not a failure to report.
    if (err.name === 'AbortError') throw err;
    throw new Error('The routing service could not be reached.');
  }

  if (!response.ok) {
    throw new Error(`The routing service answered with ${response.status}.`);
  }

  const data = await response.json();
  const summary = data?.trip?.summary;
  // Two locations always produce exactly one leg, so only the first is read.
  const leg = data?.trip?.legs?.[0];

  if (!summary || !Number.isFinite(summary.length) || !Number.isFinite(summary.time)) {
    throw new Error('The routing service found no road route between those points.');
  }

  if (!leg || typeof leg.shape !== 'string') {
    throw new Error('The routing service returned a route without any geometry.');
  }

  const steps = (leg.maneuvers || []).map(maneuver => ({
    instruction: maneuver.instruction,
    distanceKm: maneuver.length,
    durationMin: maneuver.time / 60,
    // Where this turn starts and ends within `path`, so the map can highlight it.
    beginIndex: maneuver.begin_shape_index,
    endIndex: maneuver.end_shape_index
  }));

  return {
    distanceKm: summary.length,
    durationMin: summary.time / 60,
    path: decodePolyline(leg.shape),
    steps
  };
}

// Google Maps URLs API, so the responder can also navigate with live traffic.
// https://developers.google.com/maps/documentation/urls/get-started
export function googleMapsDirectionsUrl(from, to) {
  const params = new URLSearchParams({
    api: '1',
    origin: `${from.latitude},${from.longitude}`,
    destination: `${to.latitude},${to.longitude}`,
    travelmode: 'driving'
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

const SEARCH_ENDPOINT = 'https://photon.komoot.io/api/';

// Philippines bounding box in the order Photon wants it: minLon, minLat, maxLon,
// maxLat. Photon biases results towards this box, and toPlace drops anything
// outside it, because this system only ever handles Philippine locations.
const PH_BBOX = '116.0,4.5,127.0,21.5';

// Turns one Photon feature into a route point, or null when it cannot be used.
//
// Kept separate from the request so it can be tested directly: Photon returns
// coordinates as [longitude, latitude], and reading that the other way round would
// place every result in the wrong part of the world without any error appearing.
export function toPlace(feature, index = 0) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties || {};
  const [longitude, latitude] = Array.isArray(coordinates) ? coordinates : [];

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const outsidePhilippines =
    latitude < 4.5 || latitude > 21.5 || longitude < 116 || longitude > 127;
  if (outsidePhilippines) return null;

  // Duplicate names are common, so the surrounding area is kept to tell apart the
  // several places called Buenavista. The country is dropped as noise.
  const parts = [properties.name, properties.street, properties.city, properties.state]
    .filter(Boolean);
  const label = Array.from(new Set(parts)).join(', ');

  if (!label) return null;

  return {
    key: `search-${index}`,
    label,
    latitude,
    longitude,
    source: 'search'
  };
}

// Type-ahead place search for the route card, so a start or end point can be typed
// instead of only picked from a list. Photon is Komoot's free OpenStreetMap
// geocoder: no key, and it sends Access-Control-Allow-Origin: *.
export async function searchPlaces(query, signal) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    limit: '8',
    lang: 'en',
    bbox: PH_BBOX
  });

  let response;

  try {
    response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Place search could not be reached.');
  }

  if (!response.ok) {
    throw new Error(`Place search answered with ${response.status}.`);
  }

  const data = await response.json();
  const seen = new Set();

  return (data?.features || [])
    .map(toPlace)
    .filter(place => {
      if (!place || seen.has(place.label)) return false;
      seen.add(place.label);
      return true;
    });
}
