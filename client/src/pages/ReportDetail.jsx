import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { SingleReportMap } from '../components/MapView';

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

  const handleStatusChange = async (newStatus, reason) => {
    setStatusLoading(true);
    try {
      if (user.role === 'admin') {
        await api.patch(`/reports/${id}/verify`, { status: newStatus, verification_notes: reason });
      } else {
        await api.patch(`/traffic-officer/reports/${id}/status`, { status: newStatus, reason });
      }
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setHistory(res.data.status_history || []);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Update failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAssign = async (officerId) => {
    setStatusLoading(true);
    try {
      await api.patch(`/reports/${id}/verify`, { status: 'assigned', assignedTo: officerId });
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
      setHistory(res.data.status_history || []);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Assign failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleFindings = async (findings) => {
    setStatusLoading(true);
    try {
      await api.post(`/traffic-officer/reports/${id}/findings`, { findings });
      const res = await api.get(`/reports/${id}`);
      setReport(res.data);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed');
    } finally {
      setStatusLoading(false);
    }
  };

  const uploadEvidence = async (file, description) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', description);
    try {
      await api.post(`/reports/${id}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const res = await api.get(`/reports/${id}`);
      setEvidence(res.data.evidence || []);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Upload failed');
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
      alert('Could not open the evidence file');
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

      {error && <div className="alert alert-error">{error}</div>}

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
          <div><strong>Status:</strong> <span className={`badge badge-${report.status}`}>{report.status.replace('_', ' ')}</span></div>
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {['in_progress','needs_clarification','resolved'].map(s => (
              <button key={s} className={`btn ${report.status === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleStatusChange(s, prompt('Reason (optional):'))}
                disabled={statusLoading || report.status === s}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
            <button className="btn btn-primary" onClick={() => {
              const f = prompt('Enter findings:');
              if (f) handleFindings(f);
            }} disabled={statusLoading}>Add Findings</button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <h3>Admin Actions</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {['verified','rejected','under_review','needs_clarification'].map(s => (
              <button key={s} className={`btn ${['verified','rejected'].includes(s) ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => handleStatusChange(s, prompt('Notes (optional):'))}
                disabled={statusLoading || report.status === s}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
            <button className="btn btn-primary" onClick={() => {
              const officerId = prompt('Assign to officer ID:');
              if (officerId) handleAssign(Number(officerId));
            }} disabled={statusLoading}>Assign Officer</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Evidence</h3>
          <input type="file" id={`evidence-${id}`} style={{ display: 'none' }} onChange={e => {
            if (e.target.files[0]) {
              const desc = prompt('Description (optional):');
              uploadEvidence(e.target.files[0], desc || '');
              e.target.value = '';
            }
          }} />
          <label htmlFor={`evidence-${id}`} className="btn btn-secondary">Upload Evidence</label>
        </div>
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
                  <td>{h.old_status ? h.old_status.replace('_', ' ') : '-'}</td>
                  <td><span className={`badge badge-${h.new_status}`}>{h.new_status.replace('_', ' ')}</span></td>
                  <td>{h.changed_by_name}</td>
                  <td>{h.reason || '-'}</td>
                  <td>{new Date(h.changed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
