// Duplicate candidates for human review. The ±24 h window is mandatory and at
// least one content signal must also match. Nothing is merged automatically;
// an admin decides, and the decision is audited in routes/reports.js.

export const DUPLICATE_WINDOW_HOURS = 24;
export const DUPLICATE_RADIUS_METRES = 300;

// UTC milliseconds for a report's accident date and optional time. Built from
// parts so the comparison is DST-proof and timezone-independent. Accepts both
// the 'YYYY-MM-DD' strings used in tests and the Date objects mysql2 returns.
function accidentTime(report) {
  const [hours, minutes] = String(report.accident_time || '00:00').split(':').map(Number);
  const raw = report.accident_date;
  if (raw instanceof Date) {
    return Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), hours || 0, minutes || 0);
  }
  const [year, month, day] = String(raw).slice(0, 10).split('-').map(Number);
  return Date.UTC(year, month - 1, day, hours || 0, minutes || 0);
}

// Great-circle metres between two coordinate pairs (haversine).
export function distanceMetres(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function hasCoordinates(report) {
  return report.latitude !== null && report.latitude !== undefined && report.latitude !== ''
    && report.longitude !== null && report.longitude !== undefined && report.longitude !== '';
}

export function findDuplicateCandidates(report, others = []) {
  const results = [];
  const targetTime = accidentTime(report);
  const targetLocation = String(report.location || '').trim().toLowerCase();

  for (const other of others) {
    if (other.id === report.id) continue;
    const withinWindow = Math.abs(accidentTime(other) - targetTime) <= DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000;
    if (!withinWindow) continue;

    const reasons = ['time_window'];
    if (report.accident_category_id && other.accident_category_id
      && Number(report.accident_category_id) === Number(other.accident_category_id)) {
      reasons.push('same_category');
    }
    if (hasCoordinates(report) && hasCoordinates(other)
      && distanceMetres(Number(report.latitude), Number(report.longitude), Number(other.latitude), Number(other.longitude)) <= DUPLICATE_RADIUS_METRES) {
      reasons.push('distance');
    }
    const otherLocation = String(other.location || '').trim().toLowerCase();
    if (targetLocation && otherLocation
      && (targetLocation.includes(otherLocation) || otherLocation.includes(targetLocation))) {
      reasons.push('location_text');
    }
    if (reasons.length > 1) results.push({ report: other, reasons });
  }
  return results;
}
