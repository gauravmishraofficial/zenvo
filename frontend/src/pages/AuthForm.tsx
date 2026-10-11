import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toApiError } from '../api/client';
import PageFallback from '../components/PageFallback';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

type Mode = 'login' | 'register';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthForm({ mode }: { mode: Mode }) {
  const isLogin = mode === 'login';
  usePageTitle(isLogin ? 'Log in' : 'Create account');
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/trips';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <PageFallback label="Checking your session…" />;
  if (user && !busy) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    else if (!isLogin && password.length < 8) next.password = 'Use at least 8 characters.';
    if (!isLogin && confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    setFormError('');
    const firstKey = Object.keys(next)[0];
    if (firstKey) {
      document.getElementById(`auth-${firstKey}`)?.focus();
      return;
    }

    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else await register(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(toApiError(err).message);
      setBusy(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`auth-${key}-error`} className="field-error">
        {errors[key]}
      </p>
    ) : null;

  return (
    <section className="mx-auto max-w-md py-4 sm:py-10">
      <div className="card p-6 sm:p-8">
        <span className="stamp">{isLogin ? 'Welcome back' : 'New passport'}</span>
        <h1 className="mt-4 text-3xl font-extrabold">{isLogin ? 'Log in' : 'Create your account'}</h1>
        <p className="mt-1 text-muted">
          {isLogin ? 'Sign in to see your saved trips.' : 'Save every trip you plan in one place.'}
        </p>

        <form onSubmit={submit} noValidate className="mt-6 space-y-5">
          <div role="alert" aria-live="assertive">
            {formError && (
              <p className="rounded-md border-2 border-accent bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
                {formError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="auth-email" className="label">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              className="input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'auth-email-error' : undefined}
            />
            {fieldError('email')}
          </div>

          <div>
            <label htmlFor="auth-password" className="label">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              className="input"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'auth-password-error' : undefined}
            />
            {fieldError('password')}
          </div>

          {!isLogin && (
            <div>
              <label htmlFor="auth-confirm" className="label">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                type="password"
                className="input"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={!!errors.confirm}
                aria-describedby={errors.confirm ? 'auth-confirm-error' : undefined}
              />
              {fieldError('confirm')}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'One moment…' : isLogin ? 'Log in' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {isLogin ? (
            <>
              New here?{' '}
              <Link to="/register" state={location.state} className="link">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link to="/login" state={location.state} className="link">
                Log in
              </Link>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
