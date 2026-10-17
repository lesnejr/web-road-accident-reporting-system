// One header block shared by the CSV and PDF exports, so every downloaded file
// states its scope, period and applied filters. Lines start with "# " for CSV;
// the PDF writer strips that marker.

const SCOPE_LINES = {
  verified: '# Verified official records only',
  unverified: '# Unverified public-submitted reports only, not official records',
  all: '# INCLUDES UNVERIFIED public-submitted reports, which are not official records'
};

export function exportHeaderLines({ scope, filters = {}, period } = {}) {
  const lines = [];
  if (SCOPE_LINES[scope]) lines.push(SCOPE_LINES[scope]);
  if (period) lines.push(`# Period: ${period}`);
  if (filters.status) lines.push(`# Filter - status: ${filters.status}`);
  if (filters.category) lines.push(`# Filter - accident type: ${filters.category}`);
  if (filters.date_from || filters.date_to) {
    lines.push(`# Filter - accident date: ${filters.date_from || 'earliest'} to ${filters.date_to || 'latest'}`);
  }
  if (filters.search) lines.push(`# Filter - search: ${filters.search}`);
  return lines;
}
