import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const STATUS_OPTIONS = ['submitted', 'under_review', 'needs_clarification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'];

export default function ReportsList() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = useState(searchParams.get('q') || '');
  const [exportScope, setExportScope] = useState('true');
  const [exporting, setExporting] = useState(false);

  const filters = {
    status: searchParams.get('status') || '',
    category_id: searchParams.get('category_id') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    q: searchParams.get('q') || ''
  };
  const sort = searchParams.get('sort') || 'created_at';
  const direction = searchParams.get('direction') || 'desc';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const PAGE_SIZE = 10;

  // The search box is applied after a short pause so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (searchText.trim()) next.set('q', searchText.trim());
        else next.delete('q');
        next.delete('page');
        return next;
      }, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText, setSearchParams]);

  useEffect(() => {
    api.get('/accident-categories').then(res => setCategories(res.data)).catch(() => setCategoriesError(true));
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = { page, limit: PAGE_SIZE, sort, direction };
        Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
        const res = await api.get('/reports', { params });
        if (active) {
          setReports(res.data.data);
          setTotal(res.data.total);
        }
      } catch (err) {
        if (active) setError(err.response?.data?.error?.message || 'Reports could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
    // Filters are read from the URL; the object is rebuilt each render, so the
    // dependency is the serialised query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const setFilter = (key, value) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page');
      return next;
    }, { replace: true });
  };

  const clearFilters = () => {
    setSearchText('');
    setSearchParams({}, { replace: true });
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (nextPage) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (nextPage <= 1) params.delete('page');
      else params.set('page', String(nextPage));
      return params;
    }, { replace: true });
  };

  const setSort = (value) => {
    const [nextSort, nextDirection] = value.split(':');
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (nextSort === 'created_at' && nextDirection === 'desc') {
        params.delete('sort');
        params.delete('direction');
      } else {
        params.set('sort', nextSort);
        params.set('direction', nextDirection);
      }
      params.delete('page');
      return params;
    }, { replace: true });
  };

  // CSV is fetched with the auth header and saved as a blob so the token never
  // appears in a URL. The selected filters and scope are sent along, so the file
  // matches what the table is showing.
  const downloadCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const params = { format: 'csv', verified: exportScope };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const res = await api.get('/summaries/reports/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accident-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  // The PDF export uses the same filters and scope as the CSV one.
  const downloadPdf = async () => {
    setExporting(true);
    setError('');
    try {
      const params = { format: 'pdf', verified: exportScope };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const res = await api.get('/summaries/reports/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accident-reports-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const listTitle = user.role === 'admin' ? 'All Accident Reports' : user.role === 'traffic_officer' ? 'Accident Reports' : 'My Reports';
  const listSubtitle = user.role === 'admin'
    ? 'Every submission in the system, with its official or public record status.'
    : user.role === 'traffic_officer'
      ? 'Reports submitted to the system.'
      : 'The accident reports you have filed and their current status.';

  return (
    <div className="container">
      <div className="page-title card-head">
        <div>
          <h1>{listTitle}</h1>
          <p>{listSubtitle}</p>
        </div>
        {user.role === 'reporter' && <Link to="/reports/new" className="btn btn-primary">Report an accident</Link>}
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="form-group">
            <label htmlFor="filter-status">Status</label>
            <select id="filter-status" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="filter-category">Accident type</label>
            <select id="filter-category" value={filters.category_id} onChange={e => setFilter('category_id', e.target.value)}>
              <option value="">All types</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {categoriesError && <p className="muted" role="alert">Accident types could not be loaded, so this filter is limited.</p>}
          </div>
          <div className="form-group">
            <label htmlFor="filter-from">Accident date from</label>
            <input id="filter-from" type="date" value={filters.date_from} onChange={e => setFilter('date_from', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="filter-to">Accident date to</label>
            <input id="filter-to" type="date" value={filters.date_to} onChange={e => setFilter('date_to', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="filter-search">Search</label>
            <input id="filter-search" type="search" placeholder="Reference, title or location" value={searchText} onChange={e => setSearchText(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="filter-sort">Sort by</label>
            <select id="filter-sort" value={`${sort}:${direction}`} onChange={e => setSort(e.target.value)}>
              <option value="created_at:desc">Newest first</option>
              <option value="created_at:asc">Oldest first</option>
              <option value="accident_date:desc">Accident date (newest)</option>
              <option value="accident_date:asc">Accident date (oldest)</option>
              <option value="report_reference:asc">Reference (A–Z)</option>
              <option value="status:asc">Status</option>
            </select>
          </div>
          <div className="form-group filter-actions">
            <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={!hasFilters && !searchText}>
              Clear filters
            </button>
          </div>
        </div>

        {user.role === 'admin' && (
          <div className="filter-bar" style={{ marginTop: '0.5rem' }}>
            <div className="form-group">
              <label htmlFor="export-scope">Export scope</label>
              <select id="export-scope" value={exportScope} onChange={e => setExportScope(e.target.value)}>
                <option value="true">Verified official records only</option>
                <option value="all">All submitted (includes unverified)</option>
                <option value="false">Unverified public submissions only</option>
              </select>
            </div>
            <div className="form-group filter-actions">
              <button type="button" onClick={downloadCsv} className="btn btn-secondary" disabled={exporting}>
                {exporting ? 'Exporting...' : 'Export CSV with these filters'}
              </button>
              <button type="button" onClick={downloadPdf} className="btn btn-secondary" disabled={exporting}>
                Export PDF with these filters
              </button>
            </div>
          </div>
        )}

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        {loading ? (
          <p className="loading-state" role="status">Loading reports…</p>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <strong>
              {total > 0 ? 'No reports on this page' : hasFilters ? 'No reports match the selected filters' : 'No reports yet'}
            </strong>
            <span>
              {total > 0
                ? 'Go back to the previous page to see more.'
                : hasFilters
                  ? 'Clear or adjust the filters to see more.'
                  : user.role === 'reporter'
                    ? 'An accident you report will appear here with its status.'
                    : 'Reports will appear here once they are filed.'}
            </span>
            {user.role === 'reporter' && !hasFilters && (
              <Link to="/reports/new" className="btn btn-primary">Report an accident</Link>
            )}
          </div>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: '0.5rem' }}>{total} report{total === 1 ? '' : 's'}</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Title</th>
                    <th>Location</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Record</th>
                    <th>Accident</th>
                    <th>Submitted</th>
                    <th>Officer</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id}>
                      <td data-label="Reference">{r.report_reference}</td>
                      <td data-label="Title"><Link to={`/reports/${r.id}`}>{r.title}</Link></td>
                      <td data-label="Location">{r.location}</td>
                      <td data-label="Category">{r.category_name || '-'}</td>
                      <td data-label="Status"><span className={`badge badge-${r.status}`}>{r.status.replace(/_/g, ' ')}</span></td>
                      <td data-label="Record">{r.verified_at && r.status !== 'rejected' ? 'Official' : 'Public'}</td>
                      <td data-label="Accident">{r.accident_date ? new Date(r.accident_date).toLocaleDateString() : '-'}</td>
                      <td data-label="Submitted">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td data-label="Officer">{r.assigned_officer_name || '-'}</td>
                      <td data-label="Actions">
                        <Link to={`/reports/${r.id}`} className="btn btn-secondary btn-sm">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button type="button" className="btn btn-secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1}>Previous</button>
              <span>Page {page} of {pageCount}</span>
              <button type="button" className="btn btn-secondary" onClick={() => goToPage(page + 1)} disabled={page >= pageCount}>Next</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
