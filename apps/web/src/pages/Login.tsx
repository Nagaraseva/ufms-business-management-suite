import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiFailure } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(email, password);
      nav('/');
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-navy-800 text-white relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-400 via-brand-600 to-navy-900" />
        <div>
          <div className="text-xs font-bold tracking-[0.2em] text-brand-300">UFMS</div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight">
            Business Management <span className="text-brand-400">Suite</span>
          </h1>
          <p className="mt-4 text-white/60 max-w-sm leading-relaxed">
            Sales CRM, tenders, workforce and payroll in one secure multi-tenant
            platform. Every record is isolated per customer at the database level.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {['Sales CRM', 'Tenders', 'Workforce', 'Payroll'].map((f) => (
            <div key={f} className="flex items-center gap-2 text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> {f}
            </div>
          ))}
        </div>
      </div>

      {/* form */}
      <div className="flex items-center justify-center p-6 bg-white">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <div className="h-10 w-10 rounded-lg grid place-items-center bg-brand-400 text-white font-black">U</div>
          </div>
          <div className="text-xs font-bold tracking-[0.15em] text-navy-400">SIGN IN</div>
          <h2 className="mt-2 text-3xl font-semibold text-navy-800">Welcome back</h2>
          <p className="mt-1 text-sm text-navy-500">Use your workspace credentials.</p>

          {error && (
            <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="username" required
                     value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password" required
                     value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
          </div>

          <button className="btn-primary w-full mt-6" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="mt-6 rounded-lg bg-navy-50 border border-navy-100 p-3 text-xs text-navy-500">
            <div className="font-semibold text-navy-600 mb-1">Development demo accounts</div>
            owner@alpha.test / AlphaOwner!2026<br />
            owner@bravo.test / BravoOwner!2026
          </div>
        </form>
      </div>
    </div>
  );
}
