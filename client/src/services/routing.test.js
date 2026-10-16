// Tests for the route geometry decoder.
//
// The fixture is a real Valhalla response for a 6 km route across Manila. Its
// endpoints are asserted exactly, and every point must fall inside the Philippines,
// which is what catches a broken decoder: a wrong bit shift yields coordinates that
// are nowhere near the route.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodePolyline, isSamePlace, toPlace } from './routing.js';

const MANILA_ROUTE =
  'ouazZ{ghweFW~BgDxXq@pPwX]sc@m@sQ]oJ[sX}@mRo@cc@yAuLa@kEOcd@{AkDQLyAjEch@~AoMtDaNj@kBbFkMdCeHbFsMlBeFlI_Vn@eB|Zoz@nA}CfA{CsEu@sB[eZ{Ec^cGcp@yKwMyBuTgEmIuAiRoDsF_AuGaAmToXi^wa@gL}MyLaNqB{B_CgCsYy[g]o`@mNwOyNaPsNeP[_@{GgHqA}AiBsB{RwT_J_KaLeMsD}DeIuJkD{DaCuCwBeC{UwWgE}E{LuO_OoPqN_P}JwL}AmBgCoC}ImJ{KiMqByB_CkC_J}J_NcPkN{O_NaPeDuDe@i@q@y@cAkAqDaEwMoOqNwOaCoCyA_B{B_C{B}BgN_PeNmOeJkKaDsDqCkDw@aA_HuH{MaO{MoOsA}AkFsFcEwEaDsDwDmEy]s`@cMkNe\\{_@kGmHaa@wf@mE}FgCeFC{AUyAk@oAa@k@e@e@aAk@gA]m@Iq@Eo@@o@FkDgCiD{Cuo@_v@wG{HmRsU}r@yv@am@qq@gF_GuPkRkRcT_NuOgP_SsHuI}D}EmG_Hq]e`@{b@af@mRcToHoI}JeLqM}M{CeDcDcDu@Gs@Jo@Za@h@Qr@Av@Nr@^l@n\\~_@rUdWrIjJeCdC_HhGgHbHc^p]ek@bi@aw@bt@qVfVo\\d[qb@``@iNpF_PrGmHhCqLrEg]dMyi@rSkj@jS_h@`Sig@fRge@hQwc@tP_{@|GuiAjI';

test('decodes a real polyline6 route into leaflet-ready coordinates', () => {
  const path = decodePolyline(MANILA_ROUTE);

  assert.equal(path.length, 178, 'point count');

  // Valhalla snaps the endpoints onto the nearest road, so they land within a few
  // metres of the requested coordinates rather than exactly on them.
  const [firstLat, firstLng] = path[0];
  const [lastLat, lastLng] = path.at(-1);
  assert.ok(Math.abs(firstLat - 14.599528) < 1e-5, `start latitude was ${firstLat}`);
  assert.ok(Math.abs(firstLng - 120.984206) < 1e-5, `start longitude was ${firstLng}`);
  assert.ok(Math.abs(lastLat - 14.634863) < 1e-5, `end latitude was ${lastLat}`);
  assert.ok(Math.abs(lastLng - 121.001416) < 1e-5, `end longitude was ${lastLng}`);
});

test('every decoded point stays inside the Philippines', () => {
  const path = decodePolyline(MANILA_ROUTE);

  const outside = path.filter(
    ([lat, lng]) => lat < 4.5 || lat > 21.5 || lng < 116 || lng > 127
  );

  assert.deepEqual(outside, [], 'points outside the Philippines');
});

test('two reports filed at the same corner count as one place', () => {
  // These are three real reports in the database, all at one set of coordinates.
  // Routing between them is what made Google Maps answer "could not calculate
  // driving directions", so it has to be caught before either service is called.
  const corner = { latitude: 14.7943, longitude: 120.9822 };
  const sameCorner = { latitude: 14.7943, longitude: 120.9822 };
  const farAway = { latitude: 14.5995, longitude: 120.9842 };

  assert.equal(isSamePlace(corner, sameCorner), true, 'identical coordinates');
  assert.equal(isSamePlace(corner, farAway), false, 'different places');
});

test('a few metres still counts as the same place', () => {
  // GPS jitter must not produce a route that Google Maps refuses.
  const here = { latitude: 14.7943, longitude: 120.9822 };
  const fiveMetres = { latitude: 14.794345, longitude: 120.9822 };

  assert.equal(isSamePlace(here, fiveMetres), true);
});

test('a missing point is never treated as the same place', () => {
  const corner = { latitude: 14.7943, longitude: 120.9822 };

  assert.equal(isSamePlace(corner, null), false);
  assert.equal(isSamePlace(null, null), false);
});

// Photon answers with [longitude, latitude], which is the opposite order to
// Leaflet and Valhalla. Reading it the other way round would drop every search
// result as "outside the Philippines" and the typed start/end would never work,
// so the order is pinned here with a real Photon result for Buenavista, Bulacan.
const BUENAVISTA = {
  properties: { name: 'Buenavista', city: 'Santa Maria', state: 'Bulacan', country: 'Philippines' },
  geometry: { coordinates: [120.9818568, 14.7963649] }
};

test('a searched place keeps longitude and latitude the right way round', () => {
  const place = toPlace(BUENAVISTA);

  assert.ok(place, 'the place was dropped');
  assert.equal(place.latitude, 14.7963649, 'latitude');
  assert.equal(place.longitude, 120.9818568, 'longitude');
  assert.equal(place.label, 'Buenavista, Santa Maria, Bulacan', 'label');
  assert.equal(place.source, 'search');
});

test('a searched place outside the Philippines is dropped', () => {
  // The same coordinates reversed are in the South China Sea, not the Philippines.
  const reversed = { ...BUENAVISTA, geometry: { coordinates: [14.7963649, 120.9818568] } };

  assert.equal(toPlace(reversed), null);
});

test('a searched place without coordinates is dropped', () => {
  assert.equal(toPlace({ properties: { name: 'Nowhere' }, geometry: { coordinates: [] } }), null);
  assert.equal(toPlace({ properties: { name: 'Nowhere' } }), null);
  assert.equal(toPlace(null), null);
});
