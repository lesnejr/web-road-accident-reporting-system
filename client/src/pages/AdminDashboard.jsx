import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useThemeColors } from '../theme';
import { ReportMap } from '../components/MapView';
import {
  Card, KpiCard, DashboardFilters, StatusPipeline, DonutCard, HorizontalBarCard,
  VehicleStrip, NeedsAttentionTable, WidgetState
} from '../components/dashboard/DashboardWidgets';
import { mockDashboard } from '../components/dashboard/mockDashboard';
import '../dashboard.css';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DASHBOARD === 'true';
const THIS_YEAR = new Date().getFullYear();
const KPI_ROWS = [
  ['submitted', 'Total Submitted'], ['pending', 'Pending'], ['verified', 'Verified (official)'],
  ['closed', 'Resolved / Closed'], ['fatal', 'Reports with Fatalities']
];
const isEmpty = (o) => !o || Object.keys(o).length === 0;

export default function AdminDashboard() {
  const c = useThemeColors();
  const [filters, setFilters] = useState({ year: THIS_YEAR, compareYear: THIS_YEAR - 1, scope: 'verified', typeId: '', location: '' });
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // The location box is applied after a short pause so each keystroke is not a request.
  useEffect(() => {
    const t = setTimeout(() => setLocation(filters.location.trim()), 400);
    return () => clearTimeout(t);
  }, [filters.location]);

  useEffect(() => {
    if (USE_MOCK) return;
    api.get('/accident-categories')
      .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCategoriesFailed(true));
  }, []);

  const { year, compareYear, scope, typeId } = filters;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    const load = USE_MOCK
      ? Promise.resolve({ data: mockDashboard({ year: +year, compareYear: +compareYear, scope }) })
      : api.get('/summaries/dashboard/stats', { params: { year, compareYear, scope, typeId: typeId || undefined, location: location || undefined } });
    load
      .then((res) => { if (alive) setData(res.data); })
      .catch((err) => { console.error(err); if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year, compareYear, scope, typeId, location]);

  const years = useMemo(() => {
    const list = data?.meta?.years?.length ? [...data.meta.years] : [];
    [THIS_YEAR, THIS_YEAR - 1, +year, +compareYear].forEach((y) => { if (!list.includes(y)) list.push(y); });
    return list.sort((a, b) => b - a);
  }, [data, year, compareYear]);

  const injuryColors = { none: c.green, injuries: c.amber, fatalities: c.red, unknown: c.muted, __fallback: c.series };
  const statusColors = { ...c.status, __fallback: c.series };
  const st = { loading: loading && !data, error: error && !data };

  return (
    <div className="container">
      <div className="ad">
        <div className="ad-grid">
          <header className="ad-hd">
            <div>
              <h1>Road Accident Reporting: Analytics</h1>
              <div className="ad-sub">
                Public reports are not official until verified.{USE_MOCK && ' Showing sample data.'}
              </div>
            </div>
            <DashboardFilters filters={filters} years={years} categories={categories} onChange={setFilters} />
            {categoriesFailed && (
              <p role="alert" className="ad-sub" style={{ marginTop: '0.25rem' }}>
                Accident types could not be loaded, so the type filter is limited.
              </p>
            )}
            {error && data && (
              <p role="alert" className="ad-sub" style={{ marginTop: '0.25rem' }}>
                The latest figures could not be loaded; showing the previous result.
              </p>
            )}
          </header>

          <div className="ad-kp">
            {KPI_ROWS.map(([key, title]) => (
              <KpiCard key={key} title={title} kpi={data?.kpis?.[key]} series={data?.monthlySeries?.[key]} {...st} />
            ))}
          </div>

          <Card area="pl" title="Report pipeline">
            <WidgetState {...st} empty={!data}><StatusPipeline counts={data?.pipeline || {}} /></WidgetState>
          </Card>

          <Card area="ds" title="Reports by Status">
            <WidgetState {...st} empty={isEmpty(data?.byStatus)}>
              <DonutCard data={data?.byStatus || {}} colors={statusColors} name="Reports by status" />
            </WidgetState>
          </Card>

          <Card area="di" title={`Reports by Injury Level (${scope === 'all' ? 'all submitted' : 'verified'})`}>
            <WidgetState {...st} empty={isEmpty(data?.byInjury)}>
              <DonutCard data={data?.byInjury || {}} colors={injuryColors} name="Reports by injury level" />
            </WidgetState>
          </Card>

          <Card area="ty" title="Reports by Accident Type">
            <WidgetState {...st} empty={isEmpty(data?.byType)}><HorizontalBarCard data={data?.byType || {}} /></WidgetState>
          </Card>

          <Card area="vh" title="Reports by Vehicle Type">
            <WidgetState {...st} empty={isEmpty(data?.byVehicle)}><VehicleStrip data={data?.byVehicle || {}} /></WidgetState>
          </Card>

          <Card area="mp" title="Report Locations">
            <WidgetState {...st} empty={!data?.locations?.length} emptyText="No reports with a map location for these filters">
              <div className="ad-map">
                <ReportMap reports={data?.locations || []} height={440} basemap="night" />
              </div>
              <div className="ad-legend">
                <span><i style={{ background: c.green }} />Verified</span>
                <span><i style={{ background: c.accent }} />Not yet verified</span>
                <span>{data?.locations?.length || 0} on map</span>
              </div>
            </WidgetState>
          </Card>

          <Card area="na" title="Needs attention (oldest waiting reports)">
            <WidgetState {...st} empty={!data?.needsAttention?.length} emptyText="Nothing is waiting for review">
              <NeedsAttentionTable rows={data?.needsAttention || []} />
            </WidgetState>
          </Card>

          <Card area="df">
            <div className="ad-df">
              <b>How numbers are counted.</b> Each report is counted in the month it was submitted. <b>Total Submitted</b> = all reports.
              {' '}<b>Pending</b> = Submitted + Under Review + Needs Clarification. <b>Verified</b> = verified by staff and not rejected.
              {' '}<b>Closed</b> = Resolved. <b>Fatalities</b> = reports marked as involving fatalities.
              {' '}KPIs, pipeline and status always include every report. The scope filter affects the injury, type, vehicle and map widgets.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
