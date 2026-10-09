'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ShieldCheck, Leaf } from 'lucide-react';
import { api, useCoach } from './Provider';
import { Button, ErrorMessage, errorText } from './ui';
export function Auth({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh, data } = useCoach();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      await api(`auth/${register ? 'register' : 'login'}`, {
        name: f.get('name') || undefined,
        email: f.get('email'),
        password: f.get('password'),
      });
      await refresh();
      router.push(register ? `/session?duration=${params.get('duration') || 5}` : '/home');
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setDemoBusy(true);
    setError('');
    try {
      await api('auth/demo', {});
      await refresh();
      router.push('/session?duration=5&tour=1');
      router.refresh();
    } catch (e) {
      setError(errorText(e));
      setDemoBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <div className="auth-image">
        <img src="/quiet-path.jpg" alt="Sunlight filtering through a quiet green woodland" />
        <blockquote>
          “Attention is the beginning of discovery.”
          <small>A little less screen. A little more world.</small>
        </blockquote>
      </div>
      <div className="auth-form">
        <div className="eyebrow">
          <Leaf />
          Your everyday, seen differently
        </div>
        <h1>{register ? 'A fresh way to see.' : 'Good to see you.'}</h1>
        <p className="body-copy">
          {register
            ? 'Make a little room for the world. Your personal observation practice starts here.'
            : 'Your observations, your curiosity, your little discoveries. Pick up where you left off.'}
        </p>
        {register && data.user?.isDemo && (
          <p className="notice demo-registration-note">
            Your new account starts fresh. Temporary demo notes are not transferred.
          </p>
        )}
        <form onSubmit={submit}>
          {register && (
            <div className="form-field">
              <label className="form-label" htmlFor="name">
                What should we call you?
              </label>
              <input
                className="form-input"
                name="name"
                id="name"
                placeholder="Your first name"
                autoComplete="given-name"
                required
                maxLength={60}
              />
            </div>
          )}
          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Email address
            </label>
            <input
              className="form-input"
              name="email"
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              maxLength={254}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              className="form-input"
              name="password"
              id="password"
              type="password"
              placeholder={register ? 'At least 10 characters' : 'Your password'}
              minLength={10}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
              required
            />
            {register && (
              <p className="field-hint">Use a unique password of at least 10 characters.</p>
            )}
          </div>
          <ErrorMessage message={error} />
          <Button type="submit" busy={busy} disabled={demoBusy} className="button-wide">
            {register ? 'Create your account' : 'Welcome back'}
            <ArrowRight />
          </Button>
        </form>
        <div className="auth-divider">OR JUST GET A FEEL FOR IT</div>
        <Button
          variant="secondary"
          onClick={demo}
          busy={demoBusy}
          disabled={busy}
          className="button-wide"
        >
          Explore the guided demo <ArrowRight />
        </Button>
        <p className="auth-switch">
          {register ? 'Already have a practice?' : 'New to noticing?'}
          <Link href={register ? '/login' : '/register'}>
            {register ? 'Log in' : 'Create an account'}
          </Link>
        </p>
        <div className="auth-privacy">
          <ShieldCheck />
          <p>
            Your history stays separate from other users. Hosted deployments store notes in their
            server-side MongoDB database.{' '}
            <Link className="underline-link" href="/settings">
              Local hosting keeps them on your device.
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
