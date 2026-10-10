'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Leaf, Sprout, Wind, ArrowUpRight } from 'lucide-react';
import { useCoach } from './Provider';
import { Back, sessionHref } from './ui';
import { skillNames } from '@/lib/types';
import { skillInfo, levels } from '@/lib/data/exercises';
export function Progress() {
  const { data } = useCoach();
  const p = data.progress;
  return (
    <div className="page-shell wide-content">
      <div className="page-intro">
        <div className="eyebrow">
          <Sprout />
          Your growing attention
        </div>
        <h1>Growth, without the grind.</h1>
        <p className="body-copy">
          Not a streak. Not a score to chase. Just the small ways you’re learning to see more in the
          everyday.
        </p>
      </div>
      <div className="growth-layout">
        <section className="surface-card skills-card">
          <h2>A different kind of progress</h2>
          {skillNames.map((skill) => (
            <div className="skill-row" key={skill}>
              <div className="skill-row-header">
                <span>{skillInfo[skill].label}</span>
                <span>
                  {p.scores[skill] === 0 ? 'Room to explore' : `${p.scores[skill]} / 100`}
                </span>
              </div>
              <div
                className="skill-bar"
                role="progressbar"
                aria-label={skillInfo[skill].label}
                aria-valuenow={p.scores[skill]}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="skill-fill" style={{ width: `${p.scores[skill]}%` }} />
              </div>
              <p className="skill-description">{skillInfo[skill].description}</p>
            </div>
          ))}
        </section>
        <aside className="growth-aside">
          <section className="surface-card level-card">
            <div className="large-icon">
              <Sprout />
            </div>
            <div className="eyebrow">Chapter {p.level} of 6</div>
            <h2>{levels[p.level - 1]}</h2>
            <p className="body-copy">
              {p.level === 1
                ? 'It begins with a pause. You’re making space for the things that usually go unnoticed.'
                : 'Your observations are developing new dimensions. Your next exercises will help you explore them.'}
            </p>
            <div className="level-path" aria-label={`Level ${p.level} of 6`}>
              {levels.map((level, i) => (
                <span key={level} className={i < p.level ? 'done' : ''} />
              ))}
            </div>
          </section>
          <section className="surface-card">
            <div className="stat-row">
              <span className="stat-number">{p.total}</span>
              <p>
                {p.total === 1 ? 'moment' : 'moments'} of noticing
                <small>No daily target. Every moment counts.</small>
              </p>
            </div>
          </section>
          <Link className="button button-primary" href="/session">
            Make room for another moment <ArrowUpRight />
          </Link>
          <Link className="text-link" href="/history">
            Revisit your field notes <ArrowRight />
          </Link>
        </aside>
      </div>
      <p className="growth-note">
        <Leaf />
        <span>
          These are approximate coaching signals, not a scientific assessment. Skills grow when your
          written observations show specific evidence.
          <br />
          Demo coaching uses simple rules. Live AI coaching uses the configured model. Neither
          measures your attention directly.
        </span>
      </p>
    </div>
  );
}
/** Same date label on server and client; switches to the browser's local day after mount. */
function dayLabel(iso: string, local: boolean) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(local ? {} : { timeZone: 'UTC' }),
  });
}
export function History() {
  const { data } = useCoach();
  // Hydration-safe dates: UTC (identical on server and first client render), then
  // the browser's local day once mounted.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const sessions = data.sessions.filter((s) => s.observation || s.status === 'complete');
  return (
    <div className="page-shell wide-content">
      <div className="section-heading">
        <div className="page-intro">
          <div className="eyebrow">
            <BookOpen />
            Your field notes
          </div>
          <h1>Little things, remembered.</h1>
          <p className="body-copy">A collection of details you might once have walked past.</p>
        </div>
        <Link className="button button-secondary button-sm desktop-only" href="/session">
          A new observation <ArrowUpRight />
        </Link>
      </div>
      {sessions.length ? (
        <div className="history-grid">
          {sessions.map((s) => (
            <article className="surface-card note-card" key={s.id}>
              <div className="metadata">
                <span className="eyebrow">{dayLabel(s.startedAt, hydrated)}</span>
                <span className="pill">{skillInfo[s.exercise.skill].label}</span>
              </div>
              <h2>{s.exercise.title}</h2>
              <p className="note-text">{s.observation || 'A moment outside, saved for later.'}</p>
              <div className="note-bottom">
                <span className="tiny-copy">
                  {s.duration}-minute invitation ·{' '}
                  {s.provider === 'demo'
                    ? 'Demo'
                    : s.provider === 'hosted'
                      ? 'Hosted AI'
                      : 'Local AI'}
                </span>
                <Link className="text-link" href={sessionHref(s)}>
                  {s.status === 'complete' ? 'Revisit' : 'Continue'}
                  <ArrowRight />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="large-icon">
            <BookOpen />
          </div>
          <h2>Your first detail is out there.</h2>
          <p>
            You don’t need a remarkable discovery. A texture, a sound, a shift in the light is a
            lovely place to start.
          </p>
          <Link href="/session" className="button button-primary">
            Start a little practice <ArrowUpRight />
          </Link>
        </div>
      )}
    </div>
  );
}
