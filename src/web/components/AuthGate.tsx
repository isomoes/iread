import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { AUTH_REQUIRED_EVENT, setAuthToken } from '../lib/auth';

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'checking' | 'required' | 'ready' | 'error'>('checking');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    const requireAuth = () => {
      setStatus('required');
      queryClient.clear();
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, requireAuth);
    api.checkAuth().then(() => {
      if (active) setStatus('ready');
    }).catch((cause: unknown) => {
      if (!active) return;
      setStatus(cause instanceof ApiError && cause.status === 401 ? 'required' : 'error');
      setError(cause instanceof ApiError && cause.status === 401
        ? '' : cause instanceof Error ? cause.message : 'Could not connect to iread.');
    });
    return () => {
      active = false;
      window.removeEventListener(AUTH_REQUIRED_EVENT, requireAuth);
    };
  }, [queryClient]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    setAuthToken(token);
    try {
      await api.checkAuth();
      setToken('');
      setStatus('ready');
    } catch (cause) {
      setAuthToken('');
      setError(cause instanceof ApiError && cause.status === 401
        ? 'Invalid auth token.'
        : 'Could not connect to iread. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (status === 'ready') return children;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-6 text-text-primary">
      <section className="w-full max-w-sm rounded-md border border-border p-6">
        <h1 className="mb-4 text-lg font-semibold">iread</h1>
        {status === 'checking' ? <p role="status">Connecting…</p> : status === 'error' ? (
          <div>
            <p role="alert">{error}</p>
            <button className="mt-4 text-accent" onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <form onSubmit={signIn} className="flex flex-col gap-4">
            <label htmlFor="auth-token">Enter your auth token to continue.</label>
            <input
              id="auth-token"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={pending}
              className="rounded-sm border border-border bg-surface px-3 py-2"
            />
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button disabled={pending} className="rounded-md bg-accent px-3 py-2 text-accent-foreground disabled:opacity-60">
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
