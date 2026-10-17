import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { SingleReportMap } from '../components/MapView';

const REASON_LABELS = {
  time_window: 'within 24 h',
  same_category: 'same category',
  distance: 'within 300 m',
  location_text: 'matching location'
};

// Mirrors the server transition matrix (utils/helpers.js), which stays the
// authority; the UI only offers actions that can actually succeed.
const ADMIN_NEXT = {
  submitted: ['under_review'],
  under_review: ['verified', 'rejected', 'needs_clarification'],
  needs_clarification: ['under_review'],
  in_progress: ['resolved']
};
const OFFICER_NEXT = {
  assigned: ['in_progress'],
  in_progress: ['needs_clarification', 'resolved']
};

export default function ReportDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState(null);
  const [actionText, setActionText] = useState('');
  const [officers, setOfficers] = useState([]);
  const [officersFailed, setOfficersFailed] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [fileDesc, setFileDesc] = useState('');
  const [duplicates, setDuplicates] = useState(null);
  const [duplicateOriginal, setDuplicateOriginal] = useState(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/reports/${id}`);
        setReport(res.data);
        setEvidence(res.data.evidence || []);
        setHistory(res.data.status_history || []);
      } catch (err) {
        setError(err.response?.data?.error?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // The assignment picker needs the officer list, which only admins may read.
  useEffect(() => {
    if (user.role !== 'admin') return;
    api.get('/users', { params: { role: 'traffic_officer', is_active: 1 } })
      .then(res => setOfficers(res.data))
      .catch(() => setOfficersFailed(true));
  }, [user.role]);

  // Duplicate candidates load for admins only. When the report is already
  // flagged, the original is fetched so it can be shown and linked.
  useEffect(() => {
    if (user.role !== 'admin' || !report) return;
    let active = true;
    async function loadDuplicates() {
      setDuplicateLoading(true);
      setDuplicateError('');
      try {
        if (report.duplicate_of_report_id) {
          const res = await api.get(`/reports/${report.duplicate_of_report_id}`);
          if (active) setDuplicateOriginal(res.data);
        } else {
          const res = await api.get(`/reports/${id}/duplicates`);
          if (active) setDuplicates(res.data);
        }
      } catch (err) {
        if (active) setDuplicateError(err.response?.data?.error?.message || 'The duplicate check could not be loaded.');
      } finally {
        if (active) setDuplicateLoading(false);
      }
    }
    loadDuplicates();
    return () => { active = false; };
  }, [id, user.role, report?.duplicate_of_report_id]);

  const handleStatusChange = async (newStatus, reason) => {
    setStatusLoading(true);
    setError('');
    setNotice('');
    try {
      if (user.role === 'admin') {
        await api.patch(`/reports/${id}/verify`, { status: newStatus, verification_notes: reason });
      } else {
        await api.patch(`/traffic-officer/reports/${id}/status`, { status: newStatus, reason });
      }
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setHistory(res.data.status_history || []);
      setNotice(`Status changed to ${newStatus.replace(/_/g, ' ')}.`);
      setAction(null);
      setActionText('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Update failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAssign = async (officerId) => {
    setStatusLoading(true);
    setError('');
    setNotice('');
    try {
      await api.patch(`/reports/${id}/verify`, { status: 'assigned', assignedTo: officerId });
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setHistory(res.data.status_history || []);
      setNotice('Report assigned to the selected officer.');
      setAction(null);
      setAssignTo('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Assign failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleFindings = async (findings) => {
    setStatusLoading(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/traffic-officer/reports/${id}/findings`, { findings });
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setNotice('Findings saved.');
      setAction(null);
      setActionText('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save findings');
    } finally {
      setStatusLoading(false);
    }
  };

  const uploadEvidence = async (file, description) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', description);
    setError('');
    setNotice('');
    try {
      await api.post(`/reports/${id}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const res = await api.get(`/reports/${id}`);
      setEvidence(res.data.evidence || []);
      setNotice('Evidence uploaded.');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Upload failed');
    }
  };

  // Evidence is fetched with the auth header and opened as a blob; files are never public URLs.
  const viewEvidence = async (e) => {
    try {
      const res = await api.get(`/reports/${id}/evidence/${e.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError('Could not open the evidence file');
    }
  };

  // Marking or clearing a duplicate is a human decision and is audited server-side.
  const setDuplicateFlag = async (targetId) => {
    setStatusLoading(true);
    setDuplicateError('');
    setNotice('');
    try {
      await api.patch(`/reports/${id}/duplicate`, { duplicate_of_report_id: targetId });
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setNotice(targetId ? 'Report marked as a duplicate.' : 'Duplicate flag cleared.');
    } catch (err) {
      setDuplicateError(err.response?.data?.error?.message || 'The duplicate flag could not be updated.');
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading) return <div className="container">Loading...</div>;
  if (!report) return <div className="container">{error || 'Not found'}</div>;

  const canEdit = user.role === 'reporter' && report.reporter_id === user.id && ['submitted','needs_clarification'].includes(report.status);
  const canOfficerAct = (user.role === 'traffic_officer' || user.role === 'admin') && report.assigned_to === user.id;
  const isAdmin = user.role === 'admin';

  return (
    <div className="container" style={{ maxWidth: '900px' }}>
      <div className="page-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>{report.title}</h1>
          <p>{report.report_reference} • {new Date(report.created_at).toLocaleString()}</p>
        </div>
        {canEdit && <Link to={`/reports/${id}/edit`} className="btn btn-secondary">Edit</Link>}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="card">
        <h3>Details</h3>
        <div className="form-row">
          <div><strong>Category:</strong> {report.category_name || '-'}</div>
          <div><strong>Date:</strong> {report.accident_date} {report.accident_time ? `at ${report.accident_time}` : ''}</div>
          <div><strong>Location:</strong> {report.location}</div>
          {report.latitude && <div><strong>Coordinates:</strong> {report.latitude}, {report.longitude}</div>}
          <div><strong>Vehicle Type:</strong> {report.vehicle_type || '-'}</div>
          <div><strong>Injury Status:</strong> {report.injury_status}</div>
          <div><strong>Severity:</strong> {report.severity || '-'}</div>
          <div><strong>Vehicles:</strong> {report.vehicles_involved || 0}</div>
          <div><strong>Injuries:</strong> {report.injuries || 0}</div>
          <div><strong>Fatalities:</strong> {report.fatalities || 0}</div>
          <div><strong>Reporter:</strong> {report.reporter_name} ({report.reporter_email})</div>
          <div><strong>Status:</strong> <span className={`badge badge-${report.status}`}>{report.status.replace(/_/g, ' ')}</span></div>
          {report.assigned_to && <div><strong>Assigned To:</strong> Officer #{report.assigned_to}</div>}
          {report.verified_by && <div><strong>Verified By:</strong> Admin #{report.verified_by} at {new Date(report.verified_at).toLocaleString()}</div>}
          {report.verification_notes && <div><strong>Verification Notes:</strong> {report.verification_notes}</div>}
          {report.findings && <div><strong>Officer Findings:</strong> {report.findings}</div>}
        </div>
      </div>

      {(report.latitude && report.longitude) && (
        <div className="card">
          <h3>Location Map</h3>
          <SingleReportMap report={report} height={300} />
        </div>
      )}

      <div className="card">
        <h3>Description</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{report.description}</p>
      </div>

      {canOfficerAct && (
        <div className="card">
          <h3>Officer Actions</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(OFFICER_NEXT[report.status] || []).map(s => (
              <button key={s} className="btn btn-secondary"
                onClick={() => { setAction({ type: 'status', status: s }); setActionText(''); }}
                disabled={statusLoading}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
            <button className="btn btn-primary" onClick={() => { setAction({ type: 'findings' }); setActionText(report.findings || ''); }} disabled={statusLoading}>
              {report.findings ? 'Edit Findings' : 'Add Findings'}
            </button>
          </div>

          {action?.type === 'status' && (
            <div className="action-panel">
              <label htmlFor="officer-reason">
                {action.status === 'needs_clarification' ? 'What information is missing? (required)' : 'Notes (optional)'}
              </label>
              <textarea id="officer-reason" rows={3} value={actionText} onChange={e => setActionText(e.target.value)}
                placeholder={action.status === 'needs_clarification' ? 'Tell the reporter what additional information they should add' : 'Anything the reporter should know'} />
              <div className="action-buttons">
                <button className="btn btn-primary" disabled={statusLoading || (action.status === 'needs_clarification' && !actionText.trim())}
                  onClick={() => handleStatusChange(action.status, actionText)}>
                  Confirm move to {action.status.replace(/_/g, ' ')}
                </button>
                <button className="btn btn-secondary" disabled={statusLoading} onClick={() => setAction(null)}>Cancel</button>
              </div>
            </div>
          )}

          {action?.type === 'findings' && (
            <div className="action-panel">
              <label htmlFor="officer-findings">Findings</label>
              <textarea id="officer-findings" rows={4} value={actionText} onChange={e => setActionText(e.target.value)}
                placeholder="What did you find when you responded to this accident?" />
              <div className="action-buttons">
                <button className="btn btn-primary" disabled={statusLoading || !actionText.trim()} onClick={() => handleFindings(actionText)}>Save findings</button>
                <button className="btn btn-secondary" disabled={statusLoading} onClick={() => setAction(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <h3>Admin Actions</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(ADMIN_NEXT[report.status] || []).map(s => (
              <button key={s} className={`btn ${['verified','rejected'].includes(s) ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => { setAction({ type: 'admin-status', status: s }); setActionText(''); }}
                disabled={statusLoading}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
            {report.status === 'verified' && (
              <button className="btn btn-primary" onClick={() => { setAction({ type: 'assign' }); setAssignTo(''); }} disabled={statusLoading}>Assign Officer</button>
            )}
            {!ADMIN_NEXT[report.status] && report.status !== 'verified' && (
              <p className="muted" style={{ margin: 0 }}>No admin actions apply to a report that is {report.status.replace(/_/g, ' ')}.</p>
            )}
          </div>

          {action?.type === 'admin-status' && (
            <div className="action-panel">
              <label htmlFor="admin-notes">
                {action.status === 'rejected'
                  ? 'Why is this report rejected? (required)'
                  : action.status === 'needs_clarification'
                    ? 'What should the reporter add? (required)'
                    : 'Verification notes (optional)'}
              </label>
              <textarea id="admin-notes" rows={3} value={actionText} onChange={e => setActionText(e.target.value)}
                placeholder={action.status === 'rejected' ? 'For example: duplicate of an existing report' : 'Notes recorded with this decision'} />
              <div className="action-buttons">
                <button className="btn btn-primary" disabled={statusLoading || (['rejected','needs_clarification'].includes(action.status) && !actionText.trim())}
                  onClick={() => handleStatusChange(action.status, actionText)}>
                  Confirm {action.status.replace(/_/g, ' ')}
                </button>
                <button className="btn btn-secondary" disabled={statusLoading} onClick={() => setAction(null)}>Cancel</button>
              </div>
            </div>
          )}

          {action?.type === 'assign' && (
            <div className="action-panel">
              <label htmlFor="assign-officer">Assign to traffic officer</label>
              {officersFailed ? (
                <p className="muted" role="alert">The officer list could not be loaded, so assignment is unavailable here.</p>
              ) : officers.length === 0 ? (
                <p className="muted">No active traffic officers found. Create one in User Management first.</p>
              ) : (
                <select id="assign-officer" value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                  <option value="">Select an officer</option>
                  {officers.map(o => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
                </select>
              )}
              <div className="action-buttons">
                <button className="btn btn-primary" disabled={statusLoading || !assignTo} onClick={() => handleAssign(Number(assignTo))}>Assign</button>
                <button className="btn btn-secondary" disabled={statusLoading} onClick={() => setAction(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <h3>Duplicate Review</h3>
          {duplicateError && <div className="alert alert-error" role="alert">{duplicateError}</div>}
          {report.duplicate_of_report_id ? (
            <>
              <p>
                This report is marked as a duplicate of{' '}
                <Link to={`/reports/${report.duplicate_of_report_id}`}>
                  {duplicateOriginal ? duplicateOriginal.report_reference : `report #${report.duplicate_of_report_id}`}
                </Link>.
              </p>
              <div className="action-buttons">
                <button type="button" className="btn btn-secondary" disabled={statusLoading} onClick={() => setDuplicateFlag(null)}>
                  Clear duplicate flag
                </button>
              </div>
            </>
          ) : duplicateLoading ? (
            <p className="muted">Checking for possible duplicates...</p>
          ) : !duplicates || duplicates.length === 0 ? (
            <p className="muted">No possible duplicates found within 24 hours.</p>
          ) : (
            <>
              <p className="muted">A human decides — nothing is merged automatically.</p>
              <ul className="duplicate-list">
                {duplicates.map(candidate => (
                  <li key={candidate.report.id}>
                    <div>
                      <Link to={`/reports/${candidate.report.id}`}>{candidate.report.report_reference}</Link>{' '}
                      <strong>{candidate.report.title}</strong>
                      <div className="muted">
                        {candidate.report.accident_date} {candidate.report.accident_time || ''} • {candidate.report.location}
                      </div>
                      <div className="reason-chips">
                        {candidate.reasons.map(reason => (
                          <span key={reason} className="badge badge-submitted">{REASON_LABELS[reason] || reason}</span>
                        ))}
                      </div>
                    </div>
                    <button type="button" className="btn btn-secondary" disabled={statusLoading} onClick={() => setDuplicateFlag(candidate.report.id)}>
                      Mark duplicate
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Evidence</h3>
          <input type="file" id={`evidence-${id}`} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" style={{ display: 'none' }} onChange={e => {
            if (e.target.files[0]) {
              setPendingFile(e.target.files[0]);
              setFileDesc('');
              e.target.value = '';
            }
          }} />
          <label htmlFor={`evidence-${id}`} className="btn btn-secondary">Upload Evidence</label>
        </div>

        {pendingFile && (
          <div className="action-panel">
            <p><strong>{pendingFile.name}</strong> ({Math.max(1, Math.round(pendingFile.size / 1024))} KB)</p>
            <p className="muted">Accepted: JPEG, PNG, GIF, WebP or PDF, up to 10 MB. The server checks the file content, not the extension.</p>
            <label htmlFor="evidence-desc">Description (optional)</label>
            <input id="evidence-desc" value={fileDesc} onChange={e => setFileDesc(e.target.value)} placeholder="For example: photo of the damaged vehicle" />
            <div className="action-buttons">
              <button className="btn btn-primary" disabled={statusLoading} onClick={async () => { await uploadEvidence(pendingFile, fileDesc); setPendingFile(null); }}>
                Upload
              </button>
              <button className="btn btn-secondary" onClick={() => setPendingFile(null)}>Cancel</button>
            </div>
          </div>
        )}

        {evidence.length === 0 ? <p style={{ color: 'hsl(var(--text-3))' }}>No evidence attached.</p> : (
          <div>
            {evidence.map(e => (
              <div key={e.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid hsl(var(--line) / var(--line-alpha))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{e.file_name}</strong> ({e.mime_type})
                  {e.description && <span style={{ marginLeft: '1rem', color: 'hsl(var(--text-3))' }}>{e.description}</span>}
                  <br /><small>Uploaded by {e.uploader_name} at {new Date(e.uploaded_at).toLocaleString()}</small>
                </div>
                <button type="button" onClick={() => viewEvidence(e)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>View</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Status History</h3>
        {history.length === 0 ? <p style={{ color: 'hsl(var(--text-3))' }}>No history.</p> : (
          <table className="table">
            <thead><tr><th>From</th><th>To</th><th>By</th><th>Reason</th><th>Date</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td data-label="From">{h.old_status ? h.old_status.replace(/_/g, ' ') : '-'}</td>
                  <td data-label="To"><span className={`badge badge-${h.new_status}`}>{h.new_status.replace(/_/g, ' ')}</span></td>
                  <td data-label="By">{h.changed_by_name}</td>
                  <td data-label="Reason">{h.reason || '-'}</td>
                  <td data-label="Date">{new Date(h.changed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
