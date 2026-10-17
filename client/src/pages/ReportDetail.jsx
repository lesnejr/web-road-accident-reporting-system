import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { SingleReportMap } from '../components/MapView';
import { ConfirmDialog } from '../components/Modal';

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

// Action buttons say what they do; the raw status names stay on the badges.
const ACTION_LABELS = {
  'submitted>under_review': 'Start review',
  'needs_clarification>under_review': 'Resume review',
  'under_review>verified': 'Mark as verified',
  'under_review>rejected': 'Reject report',
  'under_review>needs_clarification': 'Request more information',
  'in_progress>needs_clarification': 'Request more information',
  'assigned>in_progress': 'Start work',
  'in_progress>resolved': 'Mark as resolved'
};

const humanize = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const actionLabel = (from, to) => ACTION_LABELS[`${from}>${to}`] || humanize(to);
// Dates without a time are parsed at local midnight so the shown day never shifts.
const fmtDate = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString() : '');
const fmtTime = (v) => (v ? String(v).slice(0, 5) : '');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString() : '—');
const fileKind = (mime) => {
  const m = String(mime);
  if (m === 'application/pdf') return 'PDF';
  if (/^image\//.test(m)) return `${m.split('/')[1].toUpperCase()} image`;
  return 'File';
};

export default function ReportDetail() {
  const { user } = useAuth();
  const { id } = useParams();
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
  const [confirmClearDuplicate, setConfirmClearDuplicate] = useState(false);

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
  // The blank tab is opened before the request so the popup blocker sees a user gesture.
  const viewEvidence = async (e) => {
    const tab = window.open('', '_blank');
    try {
      const res = await api.get(`/reports/${id}/evidence/${e.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (tab) tab.location = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      if (tab) tab.close();
      setError('Could not open the evidence file');
    }
  };

  // Download saves the same authenticated blob instead of opening a tab.
  const downloadEvidence = async (e) => {
    try {
      const res = await api.get(`/reports/${id}/evidence/${e.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = e.file_name || 'evidence';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setError('');
    } catch {
      setError('Could not download the evidence file');
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

  if (loading) return <div className="container"><p className="loading-state" role="status">Loading report…</p></div>;
  if (!report) {
    return (
      <div className="container">
        <div className="card empty-state">
          <strong>Report unavailable</strong>
          <span>{error || 'The report may have been removed, or your account may not have access to it.'}</span>
          <Link to="/reports" className="btn btn-secondary">Back to reports</Link>
        </div>
      </div>
    );
  }

  const hasCoords = Boolean(report.latitude && report.longitude);
  const canEdit = user.role === 'reporter' && report.reporter_id === user.id && ['submitted','needs_clarification'].includes(report.status);
  const canOfficerAct = (user.role === 'traffic_officer' || user.role === 'admin') && report.assigned_to === user.id;
  const isAdmin = user.role === 'admin';

  // One workflow section: every transition the viewer's role can make, without
  // repeating a target that both roles may reach.
  const nextStatuses = [...new Set([
    ...(canOfficerAct ? OFFICER_NEXT[report.status] || [] : []),
    ...(isAdmin ? ADMIN_NEXT[report.status] || [] : [])
  ])];
  const canAssign = isAdmin && report.status === 'verified';
  const showWorkflow = canOfficerAct || isAdmin;
  const noWorkflowActions = showWorkflow && !canOfficerAct && !canAssign && nextStatuses.length === 0;

  return (
    <div className="container" style={{ maxWidth: '900px' }}>
      <div className="page-title card-head">
        <div>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/reports">{user.role === 'reporter' ? 'My Reports' : 'Reports'}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{report.report_reference}</span>
          </nav>
          <h1>{report.title}</h1>
          <div className="detail-meta">
            <span className={`badge badge-${report.status}`}>{report.status.replace(/_/g, ' ')}</span>
            {report.verified_at && report.status !== 'rejected' ? (
              <span className="badge badge-verified">Official verified record</span>
            ) : report.status === 'rejected' ? (
              <span className="badge badge-rejected">Not an official record</span>
            ) : (
              <span className="badge badge-submitted">Public submission — not yet verified</span>
            )}
            <span className="muted">Submitted {fmtDateTime(report.created_at)}</span>
          </div>
        </div>
        {canEdit && <Link to={`/reports/${id}/edit`} className="btn btn-secondary">Edit</Link>}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="card">
        <h3>Accident details</h3>
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>Category</dt>
            <dd>{report.category_name || '—'}</dd>
          </div>
          <div className="detail-item">
            <dt>Date and time</dt>
            <dd>{report.accident_date ? `${fmtDate(report.accident_date)}${report.accident_time ? `, ${fmtTime(report.accident_time)}` : ''}` : '—'}</dd>
          </div>
          <div className="detail-item">
            <dt>Location</dt>
            <dd>{report.location}</dd>
          </div>
          <div className="detail-item">
            <dt>Coordinates</dt>
            <dd>{hasCoords ? `${Number(report.latitude).toFixed(5)}, ${Number(report.longitude).toFixed(5)}` : '—'}</dd>
          </div>
          <div className="detail-item">
            <dt>Vehicle type</dt>
            <dd>{report.vehicle_type || '—'}</dd>
          </div>
          <div className="detail-item">
            <dt>Vehicles involved</dt>
            <dd>{report.vehicles_involved || 0}</dd>
          </div>
          <div className="detail-item">
            <dt>Injuries</dt>
            <dd>{report.injuries || 0}</dd>
          </div>
          <div className="detail-item">
            <dt>Fatalities</dt>
            <dd>{report.fatalities || 0}</dd>
          </div>
          <div className="detail-item">
            <dt>Injury status</dt>
            <dd>{humanize(report.injury_status || 'unknown')}</dd>
          </div>
          <div className="detail-item">
            <dt>Severity</dt>
            <dd>{report.severity ? humanize(report.severity) : '—'}</dd>
          </div>
        </dl>
        <div className="detail-block">
          <div className="detail-label">Description</div>
          <p className="detail-desc">{report.description || 'No description was provided.'}</p>
        </div>
      </div>

      <div className="card">
        <h3>People and verification</h3>
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>Reporter</dt>
            <dd>{report.reporter_name} <span className="muted">({report.reporter_email})</span></dd>
          </div>
          <div className="detail-item">
            <dt>Assigned officer</dt>
            <dd>{report.assigned_to ? (report.assigned_officer_name || `Officer #${report.assigned_to}`) : 'Not assigned'}</dd>
          </div>
          {report.verified_by && (
            <div className="detail-item">
              <dt>Verified</dt>
              <dd>Admin #{report.verified_by} · {fmtDateTime(report.verified_at)}</dd>
            </div>
          )}
        </dl>
        {report.verification_notes && (
          <div className="detail-block">
            <div className="detail-label">Verification notes</div>
            <p className="detail-desc">{report.verification_notes}</p>
          </div>
        )}
        {report.findings && (
          <div className="detail-block">
            <div className="detail-label">Officer findings</div>
            <p className="detail-desc">{report.findings}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Location map</h3>
        {hasCoords ? (
          <SingleReportMap report={report} height={240} />
        ) : (
          <div className="empty-state">
            <strong>No map location</strong>
            <span>This report was submitted without coordinates, so it cannot be shown on the map. The location text is in the accident details above.</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Evidence</h3>
          <div className="card-actions">
            <label htmlFor={`evidence-${id}`} className="btn btn-secondary">Upload evidence</label>
            <input type="file" id={`evidence-${id}`} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" style={{ display: 'none' }} onChange={e => {
              if (e.target.files[0]) {
                setPendingFile(e.target.files[0]);
                setFileDesc('');
                e.target.value = '';
              }
            }} />
          </div>
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

        {evidence.length === 0 ? (
          <div className="empty-state">
            <strong>No evidence attached</strong>
            <span>Photos or documents added by the reporter or the assigned officer appear here.</span>
          </div>
        ) : (
          <ul className="evidence-list">
            {evidence.map(e => (
              <li key={e.id} className="evidence-item">
                <div>
                  <strong>{e.file_name}</strong>
                  <div className="evidence-meta">
                    {fileKind(e.mime_type)} · Uploaded by {e.uploader_name} · {fmtDateTime(e.uploaded_at)}
                  </div>
                  {e.description && <div className="evidence-desc">{e.description}</div>}
                </div>
                <div className="action-buttons">
                  <button type="button" onClick={() => viewEvidence(e)} className="btn btn-secondary btn-sm">View</button>
                  <button type="button" onClick={() => downloadEvidence(e)} className="btn btn-secondary btn-sm">Download</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showWorkflow && (
        <div className="card">
          <h3>Review and workflow</h3>
          {noWorkflowActions ? (
            <p className="muted">No workflow actions are available for a report that is {report.status.replace(/_/g, ' ')}.</p>
          ) : (
            <div className="action-buttons">
              {nextStatuses.map(s => (
                <button key={s}
                  className={`btn ${s === 'rejected' ? 'btn-danger' : s === 'needs_clarification' ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => { setAction({ type: 'status', status: s }); setActionText(''); }}
                  disabled={statusLoading}
                >
                  {actionLabel(report.status, s)}
                </button>
              ))}
              {canAssign && (
                <button className="btn btn-primary" onClick={() => { setAction({ type: 'assign' }); setAssignTo(''); }} disabled={statusLoading}>
                  Assign officer
                </button>
              )}
              {canOfficerAct && (
                <button className="btn btn-secondary" onClick={() => { setAction({ type: 'findings' }); setActionText(report.findings || ''); }} disabled={statusLoading}>
                  {report.findings ? 'Edit findings' : 'Add findings'}
                </button>
              )}
            </div>
          )}

          {action?.type === 'status' && (
            <div className="action-panel">
              <label htmlFor="action-reason">
                {action.status === 'needs_clarification'
                  ? 'What information is missing? (required)'
                  : action.status === 'rejected'
                    ? 'Why is this report rejected? (required)'
                    : 'Notes (optional)'}
              </label>
              <textarea id="action-reason" rows={3} value={actionText} onChange={e => setActionText(e.target.value)}
                placeholder={action.status === 'needs_clarification'
                  ? 'Tell the reporter what additional information they should add'
                  : action.status === 'rejected'
                    ? 'For example: duplicate of an existing report'
                    : 'Anything the reporter should know'} />
              <div className="action-buttons">
                <button className="btn btn-primary" disabled={statusLoading || (['needs_clarification','rejected'].includes(action.status) && !actionText.trim())}
                  onClick={() => handleStatusChange(action.status, actionText)}>
                  {actionLabel(report.status, action.status)}
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
          <h3>Duplicate review</h3>
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
                <button type="button" className="btn btn-secondary" disabled={statusLoading} onClick={() => setConfirmClearDuplicate(true)}>
                  Clear duplicate flag
                </button>
              </div>
              <ConfirmDialog
                open={confirmClearDuplicate}
                title="Clear duplicate flag"
                message="Remove the duplicate marking from this report? The report itself is not deleted and the flag can be applied again."
                confirmLabel="Clear flag"
                busy={statusLoading}
                onConfirm={async () => { await setDuplicateFlag(null); setConfirmClearDuplicate(false); }}
                onCancel={() => setConfirmClearDuplicate(false)}
              />
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
                        {fmtDate(candidate.report.accident_date)}{candidate.report.accident_time ? `, ${fmtTime(candidate.report.accident_time)}` : ''} • {candidate.report.location}
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

      <details className="card history-card">
        <summary>
          <span className="history-title">Status history</span>
          <span className="muted">{history.length === 0 ? 'No changes yet' : `${history.length} change${history.length === 1 ? '' : 's'}`}</span>
        </summary>
        {history.length === 0 ? (
          <p className="muted">No status changes have been recorded for this report.</p>
        ) : (
          <table className="table">
            <thead><tr><th>From</th><th>To</th><th>By</th><th>Reason</th><th>Date</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td data-label="From">{h.old_status ? h.old_status.replace(/_/g, ' ') : '—'}</td>
                  <td data-label="To"><span className={`badge badge-${h.new_status}`}>{h.new_status.replace(/_/g, ' ')}</span></td>
                  <td data-label="By">{h.changed_by_name}</td>
                  <td data-label="Reason">{h.reason || '—'}</td>
                  <td data-label="Date">{fmtDateTime(h.changed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}
