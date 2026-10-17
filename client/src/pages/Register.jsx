import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const fieldProps = (key, id) => ({
    'aria-invalid': fieldErrors[key] ? true : undefined,
    'aria-describedby': fieldErrors[key] ? `${id}-error` : undefined
  });

  const fieldError = (key, id) => fieldErrors[key] && (
    <p className="field-error" id={`${id}-error`}>{fieldErrors[key]}</p>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      await api.post('/auth/register', { name, email, password, phone: phone || undefined });
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (apiError?.fields) setFieldErrors(apiError.fields);
      setError(apiError?.fields
        ? 'Please correct the highlighted fields.'
        : apiError?.message || 'Registration failed. Please check your connection and try again.');
      setLoading(false);
      return;
    }
    try {
      // Sign in right away so the new reporter lands straight in the app.
      await login(email, password);
      navigate('/dashboard', { state: { notice: 'Account created — you are signed in as a reporter. Use “Report an accident” to file your first report.' } });
    } catch {
      setError('Your account was created, but signing in automatically failed. Please sign in from the Sign in page.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-brand">
          <span className="nav-brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
            </svg>
          </span>
          <span className="auth-brand-text">
            <strong>Road Accident Reporting</strong>
            <small>Traffic management</small>
          </span>
        </div>
        <h1>Create account</h1>
        <p className="auth-sub">Public reports help responders see what is happening on the road.</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="register-name">Full Name</label>
            <input id="register-name" type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)}
              required minLength={2} maxLength={150} {...fieldProps('name', 'register-name')} />
            {fieldError('name', 'register-name')}
          </div>
          <div className="form-group">
            <label htmlFor="register-email">Email</label>
            <input id="register-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              required maxLength={150} {...fieldProps('email', 'register-email')} />
            {fieldError('email', 'register-email')}
          </div>
          <div className="form-group">
            <label htmlFor="register-password">Password (at least 8 characters)</label>
            <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} maxLength={72} {...fieldProps('password', 'register-password')} />
            {fieldError('password', 'register-password')}
          </div>
          <div className="form-group">
            <label htmlFor="register-phone">Phone (optional)</label>
            <input id="register-phone" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)}
              maxLength={30} {...fieldProps('phone', 'register-phone')} />
            {fieldError('phone', 'register-phone')}
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
