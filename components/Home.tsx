'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Footprints,
  Leaf,
  MessageCircle,
  MoveUpRight,
  ScanEye,
  Sprout,
  Sun,
  Wind,
  Play,
} from 'lucide-react';
import { useCoach, api } from './Provider';
import { Button, ErrorMessage, errorText, sessionHref } from './ui';
import { durations } from '@/lib/data/exercises';
export function Home() {
  const { data, refresh } = useCoach();
  const router = useRouter();
  const [duration, setDuration] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = data.sessions.find((s) => s.status !== 'complete');
  const start = () =>
    router.push(data.user ? `/session?duration=${duration}` : `/register?duration=${duration}`);
  const demo = async () => {
    setBusy(true);
    setError('');
    try {
      if (!data.user) {
        await api('auth/demo', {});
        await refresh();
      }
      router.push('/session?duration=5&tour=1');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <div className="page-shell">
      {active && (
        <div className="resume-banner">
          <div>
            <p>Your observation is waiting for you.</p>
            <small>
              {active.exercise.title} · {active.duration}-minute practice
            </small>
          </div>
          <Link
            href={active.status === 'outside' ? `/outside?id=${active.id}` : sessionHref(active)}
            className="button button-secondary button-sm"
          >
            Pick up where you left off <ArrowRight />
          </Link>
        </div>
      )}
      <section className="home-hero">
        <div className="hero-copy">
          {data.user && !data.user.isDemo && (
            <p className="welcome-label">
              A little room to notice, {data.user.name.split(' ')[0]}.
            </p>
          )}
          <div className="eyebrow">
            <span className="accent-dot" />A little less screen. A little more world.
          </div>
          <h1>
            There’s more
            <br />
            to <em>notice.</em>
          </h1>
          <p className="hero-description">
            The texture of a leaf. A shift in the light.
            <br />
            The things you walk past every day.
            <br />
            Rediscover the world, one small observation at a time.
          </p>
          <div className="hero-actions">
            <Button onClick={start}>
              Step outside <ArrowUpRight />
            </Button>
            <button onClick={demo} disabled={busy} className="text-link">
              {busy
                ? 'Opening your practice…'
                : data.user
                  ? 'Start a 5-minute practice'
                  : 'Try the guided demo'}{' '}
              <ArrowRight size={14} />
            </button>
          </div>
          <p className="hero-footnote">
            <Clock3 />A few minutes is all you need. No photos. No pressure.
          </p>
          <ErrorMessage message={error} />
        </div>
        <div className="hero-art">
          <img
            className="hero-image"
            src="/quiet-path.jpg"
            alt="A sunlit path winding quietly through green woodland and grasses"
            fetchPriority="high"
          />
          <div className="image-tag">
            <Sun />
            <span>Slow down.</span>
            <span>Look closer.</span>
          </div>
          <div className="image-caption">
            <p>
              Ordinary places.
              <br />
              Extraordinary little details.
            </p>
            <span>Your next discovery is already out there.</span>
          </div>
          <span className="photo-credit">A little inspiration · AI-generated landscape</span>
        </div>
      </section>
      <section className="practice-strip" aria-label="Choose a practice duration">
        <div>
          <h2>Make a little space.</h2>
          <p>How much time would you like to spend outside?</p>
        </div>
        <div className="duration-group">
          {durations.map((d) => (
            <button
              className={`duration-button ${d === duration ? 'selected' : ''}`}
              key={d}
              onClick={() => setDuration(d)}
              aria-pressed={d === duration}
            >
              <span>{d}</span> min
            </button>
          ))}
          <Button onClick={start}>
            Let’s begin <ArrowRight />
          </Button>
        </div>
      </section>
      <section className="how-section" id="how-it-works">
        <div className="section-heading">
          <div>
            <div className="eyebrow">A practice, not another app habit</div>
            <h2>A small pause. A new perspective.</h2>
          </div>
          <span className="tiny-copy">A coach for your attention, not a claim on it.</span>
        </div>
        <div className="steps-grid">
          <article className="step-card">
            <div className="step-icon">
              <ScanEye />
            </div>
            <div>
              <div className="step-number">01 / AN INVITATION</div>
              <h3>One thing to notice.</h3>
              <p>Get a simple observation exercise, chosen to help you see a little differently.</p>
            </div>
          </article>
          <article className="step-card">
            <div className="step-icon">
              <Footprints />
            </div>
            <div>
              <div className="step-number">02 / THE WORLD AWAITS</div>
              <h3>Phone away. Senses on.</h3>
              <p>
                Step outside and take your time. No camera, no checklist. Just you, paying
                attention.
              </p>
            </div>
          </article>
          <article className="step-card">
            <div className="step-icon">
              <MessageCircle />
            </div>
            <div>
              <div className="step-number">03 / A LITTLE REFLECTION</div>
              <h3>Bring back a detail.</h3>
              <p>
                Share what you noticed. A thoughtful question helps your next observation go deeper.
              </p>
            </div>
          </article>
        </div>
      </section>
      <section className="philosophy-banner">
        <Sprout />
        <div className="philosophy-text">
          <p>The goal isn’t more time with AI. It’s more presence without it.</p>
          <span>
            No streaks to keep. No feed to scroll. Just a growing connection to the world around
            you.
          </span>
        </div>
        <Link className="text-link" href="/settings">
          Thoughtfully, by design <MoveUpRight size={14} />
        </Link>
      </section>
    </div>
  );
}
