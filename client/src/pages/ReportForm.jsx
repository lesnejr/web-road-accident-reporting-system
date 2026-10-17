import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { ReportMap } from '../components/MapView';

const initialForm = {
  title: '', description: '', accident_date: '', accident_time: '',
  location: '', latitude: '', longitude: '', vehicle_type: '',
  injury_status: 'unknown', severity: '', vehicles_involved: '',
  injuries: '', fatalities: '', accident_category_id: ''
};

// Geo status messages. The manual fallback is always described, because the
// device position is a convenience and never a requirement.
const GEO_LABEL = {
  idle: '',
  locating: 'Requesting your location...',
  granted: 'Device location captured. Coordinates from a device are approximate and are not verified by staff.',
  picked: 'Map point selected. Coordinates from a map pick are approximate and are not verified by staff.',
  denied: 'Location permission was denied, so no coordinates were captured. Type the location and use the map or the latitude and longitude fields below.',
  unsupported: 'This browser does not support location access. Type the location and use the map or the latitude and longitude fields below.',
  error: 'Your location could not be read. Try again, or type the location below.'
};

export default function ReportForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [geo, setGeo] = useState({ state: 'idle' });

  const hasCoordinates = Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude))
    && form.latitude !== '' && form.longitude !== '';

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeo({ state: 'unsupported' });
      return;
    }
    setGeo({ state: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((f) => ({
          ...f,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6)
        }));
        setGeo({ state: 'granted', accuracy: Math.round(position.coords.accuracy) });
        setShowMap(true);
      },
      (err) => setGeo({ state: err.code === 1 ? 'denied' : 'error' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapPick = (latitude, longitude) => {
    setForm((f) => ({ ...f, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));
    setGeo({ state: 'picked' });
  };

  const clearCoordinates = () => {
    setForm((f) => ({ ...f, latitude: '', longitude: '' }));
    setGeo({ state: 'idle' });
  };

  useEffect(() => {
    api.get('/accident-categories')
      .then(res => setCategories(res.data))
      .catch(() => setCategoriesError(true));
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

  if (loading) return <div className="container"><p className="loading-state" role="status">Loading form…</p></div>;

  return (
    <div className="container" style={{ maxWidth: '800px' }}>
      <div className="page-title">
        <h1>{isEdit ? 'Edit Report' : 'New Accident Report'}</h1>
        <p>Describe what happened. A report stays unofficial until an administrator verifies it.</p>
      </div>
      <div className="card">
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <h2 className="form-section-title">What happened</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rf-title">Title *</label>
              <input id="rf-title" type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
            </div>
            <div className="form-group">
              <label htmlFor="rf-category">Category</label>
              <select id="rf-category" value={form.accident_category_id} onChange={e => setForm({...form, accident_category_id: e.target.value})} required>
                <option value="">Select...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {categoriesError && <p className="muted" role="alert">Categories could not be loaded. Reload the page before submitting.</p>}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="rf-description">Description *</label>
            <textarea id="rf-description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={4} required></textarea>
          </div>
          <h2 className="form-section-title">When and where</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rf-date">Accident Date *</label>
              <input id="rf-date" type="date" value={form.accident_date} onChange={e => setForm({...form, accident_date: e.target.value})} required />
            </div>
            <div className="form-group">
              <label htmlFor="rf-time">Accident Time *</label>
              <input id="rf-time" type="time" value={form.accident_time} onChange={e => setForm({...form, accident_time: e.target.value})} required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="rf-location">Location *</label>
            <input id="rf-location" type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} required placeholder="Street, City, Landmark" />
          </div>

          <div className="form-group">
            <span className="form-label">Coordinates (optional)</span>
            <div className="action-buttons" style={{ marginBottom: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={useMyLocation} disabled={geo.state === 'locating' || geo.state === 'unsupported'}>
                {geo.state === 'locating' ? 'Locating...' : 'Use my current location'}
              </button>
              <button type="button" className={`btn ${showMap ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowMap(open => !open)}>
                {showMap ? 'Hide map' : 'Pick on map'}
              </button>
              {hasCoordinates && (
                <button type="button" className="btn btn-secondary" onClick={clearCoordinates}>Clear coordinates</button>
              )}
            </div>
            {geo.state !== 'idle' && (
              <p className="muted" role="status">
                {GEO_LABEL[geo.state]}
                {geo.state === 'granted' && geo.accuracy ? ` Accurate to about ${geo.accuracy} m.` : ''}
              </p>
            )}
            {showMap && (
              <div style={{ marginTop: '0.5rem' }}>
                <ReportMap
                  reports={[]}
                  height={300}
                  focus={hasCoordinates ? { latitude: Number(form.latitude), longitude: Number(form.longitude) } : null}
                  onMapPick={handleMapPick}
                />
                <p className="muted" style={{ marginTop: '0.25rem' }}>Click the accident spot on the map to fill the coordinates.</p>
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rf-lat">Latitude (manual)</label>
              <input id="rf-lat" type="number" step="any" min="-90" max="90" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} />
            </div>
            <div className="form-group">
              <label htmlFor="rf-lng">Longitude (manual)</label>
              <input id="rf-lng" type="number" step="any" min="-180" max="180" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} />
            </div>
          </div>
          <h2 className="form-section-title">Vehicles and casualties</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rf-vehicle">Vehicle Type</label>
              <input id="rf-vehicle" type="text" value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})} placeholder="Car, Motorcycle, Truck, etc." />
            </div>
            <div className="form-group">
              <label htmlFor="rf-injury">Injury Status *</label>
              <select id="rf-injury" value={form.injury_status} onChange={e => setForm({...form, injury_status: e.target.value})} required>
                <option value="none">None</option>
                <option value="injuries">Injuries</option>
                <option value="fatalities">Fatalities</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rf-severity">Severity</label>
              <select id="rf-severity" value={form.severity} onChange={e => setForm({...form, severity: e.target.value})}>
                <option value="">Select...</option>
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="major">Major</option>
                <option value="fatal">Fatal</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="rf-vehicles">Vehicles Involved</label>
              <input id="rf-vehicles" type="number" min="0" value={form.vehicles_involved} onChange={e => setForm({...form, vehicles_involved: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rf-injuries">Injuries</label>
              <input id="rf-injuries" type="number" min="0" value={form.injuries} onChange={e => setForm({...form, injuries: e.target.value})} />
            </div>
            <div className="form-group">
              <label htmlFor="rf-fatalities">Fatalities</label>
              <input id="rf-fatalities" type="number" min="0" value={form.fatalities} onChange={e => setForm({...form, fatalities: e.target.value})} />
            </div>
          </div>
          <div className="card-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Submit report'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/reports')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
