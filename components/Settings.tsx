'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogOut, ArrowRight, Cloud, LockKeyhole } from 'lucide-react';
import { api, useCoach } from './Provider';
import { Back, Button, ErrorMessage, errorText } from './ui';
export function Settings() {
  const { data, refresh } = useCoach();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const p = data.user?.isDemo ? 'demo' : data.provider;
  async function end(remove = false) {
    setBusy(true);
    setError('');
    try {
      await api(
        remove ? 'account' : 'auth/logout',
        remove ? undefined : {},
        remove ? 'DELETE' : 'POST',
      );
      try {
        for (const key of Object.keys(sessionStorage))
          if (
            key.startsWith(`observation-draft:${data.user?.id}:`) ||
            key.startsWith(`observation-answer:${data.user?.id}:`)
          )
            sessionStorage.removeItem(key);
      } catch {}
      await refresh();
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <div className="narrow-shell">
      <Back href={data.user ? '/home' : '/'} />
      <div className="page-intro">
        <div className="eyebrow">
          <ShieldCheck />
          Thoughtfully, by design
        </div>
        <h1>Your practice. Your choice.</h1>
        <p className="body-copy">A quieter app should be clear about what happens to your words.</p>
      </div>
      {data.user && (
        <section className="surface-card account-card">
          <h2>Your account</h2>
          <dl>
            <div className="definition-row">
              <dt>Name</dt>
              <dd>{data.user.name}</dd>
            </div>
            <div className="definition-row">
              <dt>{data.user.isDemo ? 'Account type' : 'Email'}</dt>
              <dd>
                {data.user.isDemo ? 'Temporary demo · expires after 24 hours' : data.user.email}
              </dd>
            </div>
            <div className="definition-row">
              <dt>Completed observations</dt>
              <dd>{data.progress.total}</dd>
            </div>
          </dl>
          <Button
            variant="secondary"
            className="button-sm spaced-top"
            onClick={() => end()}
            busy={busy}
          >
            <LogOut />
            {data.user.isDemo ? 'Leave the demo' : 'Log out'}
          </Button>
        </section>
      )}
      <section className="surface-card account-card">
        <h2>How your coach works</h2>
        <dl>
          <div className="definition-row">
            <dt>This practice uses</dt>
            <dd>
              <span className="pill">
                {p === 'demo'
                  ? 'Guided demo · no live model'
                  : p === 'local'
                    ? 'Local AI'
                    : 'Hosted AI'}
              </span>
            </dd>
          </div>
          <div className="definition-row">
            <dt>Server configuration</dt>
            <dd>
              {data.provider === 'demo'
                ? 'Deterministic demo'
                : `${data.provider} provider · ${data.configured ? 'configuration present' : 'setup needed'}`}
            </dd>
          </div>
        </dl>
        <p className="body-copy spaced-top">
          {p === 'demo'
            ? 'Demo feedback uses simple rules and sample exercises. No observation text is sent to an AI provider. Demo accounts have their own history and are automatically removed after 24 hours by MongoDB’s background expiration process.'
            : p === 'hosted'
              ? 'Your reflection and relevant session context are sent by this application’s server to the configured hosted model provider. Provider retention policies apply. Do not include sensitive personal information.'
              : 'Your reflection is sent to the local model endpoint configured on the application server. No proprietary cloud fallback is used.'}
        </p>
        <p className="tiny-copy spaced-top">
          The provider is selected by the server operator through environment variables, not by a
          browser toggle. API keys are never sent to your browser. If a model fails, we say so.
        </p>
      </section>
      <section className="surface-card account-card">
        <h2>Your observations can stay on your device.</h2>
        <p className="body-copy">
          When you run the app, its database, and an open-weight model locally, your observations
          stay on that machine. In this hosted preview, account information and saved observations
          are stored in the configured MongoDB database (normally Atlas for hosted deployments)—not
          exclusively on your phone.
        </p>
        <div className="session-note spaced-top">
          <LockKeyhole />
          <p>
            <strong>No analytics. No tracking. No public profiles.</strong>
            <br />
            Each account can access only its own observations and skill history.
          </p>
        </div>
        <p className="tiny-copy">
          Optional browser voice recognition may send audio to the browser vendor. We ask before
          enabling it. Listening stays open until you stop it or after about 5 seconds of silence.
          You can always type instead.
        </p>
      </section>
      <details className="disclosure">
        <summary>For developers · Configure local or hosted coaching</summary>
        <p className="tiny-copy spaced-top">
          Run Next.js with a MongoDB replica set on your machine for fully local use — either your
          already-installed MongoDB with its replica set enabled (no Docker; see DATABASE.md or run
          scripts/mongodb-enable-replicaset) or the supplied Docker Compose service. Set these
          values in .env.local and restart the server. The URL is reached by the application server,
          not the browser.
        </p>
        <pre className="code-block">{`# Local open-weight model\nLLM_PROVIDER=local\nLOCAL_LLM_BASE_URL=http://localhost:1234/v1\nLOCAL_LLM_MODEL=your-model\n\n# Or an OpenAI-compatible hosted provider\nLLM_PROVIDER=hosted\nHOSTED_LLM_BASE_URL=https://your-provider.example/v1\nHOSTED_LLM_MODEL=your-model\nHOSTED_LLM_API_KEY=server-side-secret`}</pre>
        <p className="tiny-copy spaced-top">
          Choose LM Studio, Ollama, llama.cpp, or another compatible endpoint. Check README.md and
          architecture.md in the project for setup details.
        </p>
      </details>
      {data.user && !data.user.isDemo && (
        <div className="danger-zone">
          <h3>Leave no trace</h3>
          <p className="tiny-copy">
            Permanently delete your account, observations, and progress from this app. This cannot
            delete records independently retained by a hosted AI provider.
          </p>
          {confirm ? (
            <div className="notice spaced-top">
              <p>
                <strong>Delete your account and every observation?</strong> This cannot be undone.
              </p>
              <div className="voice-actions spaced-top">
                <Button
                  variant="secondary"
                  className="danger-button button-sm"
                  busy={busy}
                  onClick={() => end(true)}
                >
                  Yes, delete everything
                </Button>
                <Button variant="ghost" className="button-sm" onClick={() => setConfirm(false)}>
                  Keep my account
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="danger-button button-sm spaced-top"
              onClick={() => setConfirm(true)}
            >
              Delete my account
            </Button>
          )}
        </div>
      )}
      <ErrorMessage message={error} />
      {!data.user && (
        <Link className="button button-primary spaced-top" href="/register">
          Begin your own practice <ArrowRight />
        </Link>
      )}
    </div>
  );
}
