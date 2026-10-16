import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const initialForm = {
  title: '', description: '', accident_date: '', accident_time: '',
  location: '', latitude: '', longitude: '', vehicle_type: '',
  injury_status: 'unknown', severity: '', vehicles_involved: '',
  injuries: '', fatalities: '', accident_category_id: ''
};

export default function ReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/accident-categories').then(res => setCategories(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      api.get(`/reports/${id}`)
        .then(res => {
          const r = res.data;
          setForm({
            title: r.title, description: r.description,
            accident_date: r.accident_date?.slice(0,10) || '',
            accident_time: r.accident_time?.slice(0,5) || '',
            location: r.location, latitude: r.latitude || '',
            longitude: r.longitude || '', vehicle_type: r.vehicle_type || '',
            injury_status: r.injury_status, severity: r.severity || '',
            vehicles_involved: r.vehicles_involved || '',
            injuries: r.injuries || '', fatalities: r.fatalities || '',
            accident_category_id: r.accident_category_id || ''
          });
        })
        .catch(() => setError('Failed to load report'))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = { ...form };
      Object.keys(data).forEach(k => data[k] === '' && delete data[k]);
      if (isEdit) {
        await api.patch(`/reports/${id}`, data);
      } else {
        await api.post('/reports', data);
      }
      navigate('/reports');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="container" style={{ maxWidth: '800px' }}>
      <div className="page-title">
        <h1>{isEdit ? 'Edit Report' : 'New Accident Report'}</h1>
      </div>
      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Title *</label>
              <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={form.accident_category_id} onChange={e => setForm({...form, accident_category_id: e.target.value})} required>
                <option value="">Select...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description *</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={4} required></textarea>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Accident Date *</label>
              <input type="date" value={form.accident_date} onChange={e => setForm({...form, accident_date: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Accident Time *</label>
              <input type="time" value={form.accident_time} onChange={e => setForm({...form, accident_time: e.target.value})} required />
            </div>
          </div>
          <div className="form-group">
            <label>Location *</label>
            <input type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} required placeholder="Street, City, Landmark" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Latitude</label>
              <input type="number" step="any" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Longitude</label>
              <input type="number" step="any" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Vehicle Type</label>
              <input type="text" value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})} placeholder="Car, Motorcycle, Truck, etc." />
            </div>
            <div className="form-group">
              <label>Injury Status *</label>
              <select value={form.injury_status} onChange={e => setForm({...form, injury_status: e.target.value})} required>
                <option value="none">None</option>
                <option value="injuries">Injuries</option>
                <option value="fatalities">Fatalities</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Severity</label>
              <select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})}>
                <option value="">Select...</option>
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="major">Major</option>
                <option value="fatal">Fatal</option>
              </select>
            </div>
            <div className="form-group">
              <label>Vehicles Involved</label>
              <input type="number" min="0" value={form.vehicles_involved} onChange={e => setForm({...form, vehicles_involved: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Injuries</label>
              <input type="number" min="0" value={form.injuries} onChange={e => setForm({...form, injuries: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Fatalities</label>
              <input type="number" min="0" value={form.fatalities} onChange={e => setForm({...form, fatalities: e.target.value})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/reports')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
