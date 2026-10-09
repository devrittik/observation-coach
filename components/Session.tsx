'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Leaf,
  Mic,
  MicOff,
  MoveUpRight,
  ShieldCheck,
  Sparkles,
  Sprout,
  Sun,
  Wind,
  X,
  BookOpen,
  Volume2,
} from 'lucide-react';
import { api, useCoach } from './Provider';
import { Back, Button, ErrorMessage, Loading, ModeNote, Steps, errorText, sessionHref } from './ui';
import { durations, sampleObservation, skillInfo } from '@/lib/data/exercises';
import type { ObservationSession } from '@/lib/types';
import { browserSpeechInput, browserSpeechOutput, joinTranscript } from '@/lib/voice';
export function SessionSetup() {
  const params = useSearchParams();
  const { data, refresh } = useCoach();
  const router = useRouter();
  const initial = Number(params.get('duration'));
  const [duration, setDuration] = useState([5, 10, 20, 30].includes(initial) ? initial : 5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = data.sessions.find((s) => s.status !== 'complete');
  const provider = data.user?.isDemo ? 'demo' : data.provider;
  async function start() {
    setBusy(true);
    setError('');
    try {
      const { session } = await api<{ session: ObservationSession }>('sessions', { duration });
      await refresh();
      router.push(
        session.status === 'outside' ? `/outside?id=${session.id}` : sessionHref(session),
      );
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <div className="narrow-shell">
      <Back />
      <div className="page-intro">
        <div className="eyebrow">
          <Sun />A small invitation
        </div>
        <h1>Make room for noticing.</h1>
        <p className="body-copy">
          You don’t need to go far. A doorstep, a quiet street, a patch of green.
          <br className="desktop-only" /> The ordinary is a good place to begin.
        </p>
      </div>
      {params.get('tour') && (
        <div className="notice">
          <strong>A 60-second look around the product.</strong> Choose 5 minutes, explore the
          exercise, and tap “I’m back” whenever you’re ready. You can try a sample observation.
        </div>
      )}
      <div className="surface-card session-card">
        <h2>How much time feels right?</h2>
        <p className="tiny-copy">An invitation, not a countdown. Come back when you’re ready.</p>
        <div className="duration-grid" role="group" aria-label="Session duration">
          {durations.map((d) => (
            <button
              className={`duration-tile ${duration === d ? 'selected' : ''}`}
              key={d}
              onClick={() => setDuration(d)}
              aria-pressed={duration === d}
            >
              <strong>{d}</strong>
              <span>minutes</span>
            </button>
          ))}
        </div>
        <div className="session-note">
          <Leaf />
          <p>
            <strong>One exercise. Your full attention.</strong>
            <br />
            We’ll give you something to notice, then get out of your way.
          </p>
        </div>
        <ErrorMessage message={error} />
        <Button busy={busy} onClick={start} className="button-wide">
          {busy
            ? 'Preparing your invitation…'
            : active
              ? 'Continue your observation'
              : 'Find my first detail'}
          <ArrowRight />
        </Button>
        {active && (
          <p className="center-note">You already have an unfinished practice. We’ll pick it up.</p>
        )}
      </div>
      <ModeNote provider={provider} />
      <p className="center-note">Choose somewhere safe. Stay aware of your surroundings.</p>
    </div>
  );
}
export function SessionFlow() {
  const params = useSearchParams();
  const id = params.get('id');
  const path = usePathname();
  const router = useRouter();
  const { data, refresh } = useCoach();
  const [session, setSession] = useState<ObservationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const stopVoice = useRef<() => void>(() => {});
  /** Existing text captured when dictation starts; each voice result extends it. */
  const voiceBase = useRef('');
  /** Bumped by manual edits so late voice results can never overwrite or repeat them. */
  const voiceGeneration = useRef(0);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const draftKey = `observation-draft:${data.user?.id}:${id}`;
  const answerKey = `observation-answer:${data.user?.id}:${id}`;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (!id) {
      router.replace('/session');
      return;
    }
    api<{ session: ObservationSession }>(`sessions/${id}`)
      .then(({ session: s }) => {
        if (cancelled) return;
        setSession(s);
        let draft = '',
          followup = '';
        try {
          draft = sessionStorage.getItem(draftKey) || '';
          followup = sessionStorage.getItem(answerKey) || '';
        } catch {}
        setText(draft || s.observation || '');
        setAnswer(followup || s.followup || '');
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      stopVoice.current();
      browserSpeechOutput.stop();
    };
  }, [id, draftKey, answerKey, router]);
  useEffect(() => {
    setVoiceSupported(browserSpeechInput.supported());
  }, []);
  useEffect(() => {
    if (!session) return;
    const expected =
      session.status === 'outside' ? `/outside?id=${session.id}` : sessionHref(session);
    if (expected.split('?')[0] !== path) router.replace(expected);
  }, [session, path, router]);
  function writeText(value: string) {
    // A manual edit ends dictation so recognized text can never overwrite or repeat it.
    if (listening) {
      stopVoice.current();
      setListening(false);
    }
    voiceGeneration.current += 1;
    voiceBase.current = value;
    setText(value);
    try {
      sessionStorage.setItem(draftKey, value);
    } catch {}
  }
  function writeAnswer(value: string) {
    setAnswer(value);
    try {
      sessionStorage.setItem(answerKey, value);
    } catch {}
  }
  async function act(action: string, body: unknown = {}) {
    if (!session) return;
    setError('');
    setBusy(true);
    stopVoice.current();
    setListening(false);
    try {
      const { session: s } = await api<{ session: ObservationSession }>(
        `sessions/${session.id}/${action}`,
        body,
      );
      setSession(s);
      if (action === 'reflect') {
        try {
          sessionStorage.removeItem(draftKey);
        } catch {}
      }
      if (action === 'complete') {
        try {
          sessionStorage.removeItem(answerKey);
        } catch {}
      }
      await refresh();
      router.push(s.status === 'outside' ? `/outside?id=${s.id}` : sessionHref(s));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function startVoice() {
    setError('');
    try {
      setListening(true);
      voiceBase.current = text;
      const generation = ++voiceGeneration.current;
      stopVoice.current = browserSpeechInput.start(
        (voiceText) => {
          // The adapter delivers the complete dictation transcript on every update;
          // replace the voice portion instead of appending, so repeats cannot pile up.
          if (generation !== voiceGeneration.current) return;
          const next = joinTranscript(voiceBase.current, voiceText);
          setText(next);
          try {
            sessionStorage.setItem(draftKey, next);
          } catch {}
        },
        () => setListening(false),
        (message) => {
          if (generation === voiceGeneration.current) setError(message);
          setListening(false);
        },
      );
      setVoiceOpen(false);
    } catch {
      setError('The microphone could not be started. Please type your observation.');
      setListening(false);
    }
  }
  if (loading) return <Loading />;
  if (!session)
    return (
      <div className="narrow-shell">
        <Back />
        <ErrorMessage message={error || 'This session was not found.'} />
        <Button variant="secondary" onClick={() => router.push('/session')}>
          Start a practice
        </Button>
      </div>
    );
  const s = session;
  if (s.status === 'outside')
    return (
      <section className="outside-screen">
        <Link
          className="quiet-exit icon-button"
          href="/home"
          aria-label="Return home; keep this session open"
        >
          <X />
        </Link>
        <Leaf className="outside-leaf" />
        <div className="eyebrow">Go outside</div>
        <h1>
          The world can
          <br />
          have your attention now.
        </h1>
        <p>
          Take your time.
          <br />
          Put your phone away.
          <br />
          Come back when you’re ready.
        </p>
        <ErrorMessage message={error} />
        <Button busy={busy} onClick={() => act('return')}>
          I’m back <ArrowRight />
        </Button>
        <p className="tiny-copy">No timer to watch. Nothing to keep up with.</p>
      </section>
    );
  if (s.status === 'exercise')
    return (
      <div className="narrow-shell">
        <Back />
        <Steps step={1} />
        <div className="surface-card exercise-card">
          <div className="large-icon">
            <ScanLeaf />
          </div>
          <div className="metadata">
            <span className="pill">
              <Clock3 />
              {s.duration} minutes
            </span>
            <span className="pill pill-sand">{skillInfo[s.exercise.skill].label}</span>
          </div>
          <div className="eyebrow centered-eyebrow">Your observation invitation</div>
          <h1>{s.exercise.title}</h1>
          <p className="exercise-instruction">{s.exercise.instruction}</p>
          <p className="exercise-hint">{s.exercise.hint}</p>
        </div>
        <ErrorMessage message={error} />
        <div className="action-row">
          <p className="tiny-copy">
            No camera. No right answer.
            <br />
            Just a little curiosity.
          </p>
          <Button busy={busy} onClick={() => act('outside')}>
            I’m ready to look around <ArrowUpRight />
          </Button>
        </div>
        <details className="disclosure spaced-top">
          <summary>Prefer to listen? · Optional browser voice</summary>
          <p className="tiny-copy spaced-top">
            Reading aloud uses your browser’s speech service. Some voices may need internet access
            or use vendor services. Nothing plays automatically.
          </p>
          <div className="voice-actions spaced-top">
            <Button
              variant="secondary"
              className="button-sm"
              onClick={() => {
                if (browserSpeechOutput.supported())
                  browserSpeechOutput.speak(s.exercise.instruction + '. ' + s.exercise.hint);
                else setError('Reading aloud is not supported in this browser.');
              }}
            >
              <Volume2 />
              Read invitation
            </Button>
            <Button
              variant="ghost"
              className="button-sm"
              onClick={() => browserSpeechOutput.stop()}
            >
              Stop
            </Button>
          </div>
        </details>
        <ModeNote provider={s.provider} />
      </div>
    );
  if (s.status === 'reflection')
    return (
      <div className="narrow-shell">
        <Back />
        <Steps step={3} />
        <div className="page-intro">
          <div className="eyebrow">
            <Leaf />
            Welcome back
          </div>
          <h1>What did you actually notice?</h1>
          <p className="body-copy">
            Start with one detail. Not what it’s called, but what caught your attention.
          </p>
        </div>
        <div className="reflection-prompt">
          <small>Your invitation</small>
          {s.exercise.instruction}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act('reflect', { observation: text });
          }}
        >
          <label htmlFor="observation" className="form-label">
            Your observation
          </label>
          <textarea
            ref={textRef}
            className="form-input reflection-input"
            id="observation"
            placeholder="I noticed…"
            value={text}
            onChange={(e) => writeText(e.target.value)}
            minLength={2}
            maxLength={5000}
            required
            disabled={busy}
          />
          <div className="textarea-footer">
            {s.provider === 'demo' ? (
              <button
                type="button"
                className="sample-button"
                onClick={() => {
                  writeText(sampleObservation);
                  textRef.current?.focus();
                }}
              >
                <Sparkles />
                Try a sample observation
              </button>
            ) : (
              <span>A few honest details are enough.</span>
            )}
            <span>{text.length.toLocaleString()} / 5,000</span>
          </div>
          <div className="action-row spaced-top">
            <button
              type="button"
              className="button button-ghost"
              disabled={!voiceSupported || busy}
              title={
                voiceSupported
                  ? 'Optional browser voice input'
                  : 'Voice input is not supported by this browser'
              }
              onClick={() => {
                if (listening) {
                  stopVoice.current();
                  setListening(false);
                } else setVoiceOpen(!voiceOpen);
              }}
            >
              {listening ? <MicOff /> : <Mic />}
              {listening
                ? 'Stop listening'
                : voiceSupported
                  ? 'Use your voice'
                  : 'Voice unavailable'}
            </button>
            <Button type="submit" busy={busy} disabled={text.trim().length < 2}>
              {busy ? 'Reflecting on your words…' : 'Reflect with my coach'}
              <ArrowRight />
            </Button>
          </div>
          {voiceOpen && (
            <div className="voice-box">
              <p>
                Your browser’s speech service may send audio to its vendor and may need internet
                access. Voice is optional; typing keeps audio private. Listening stays open until
                you stop it or after about 5 seconds of silence.
              </p>
              <div className="voice-actions">
                <Button
                  type="button"
                  variant="secondary"
                  className="button-sm"
                  onClick={startVoice}
                >
                  Allow browser voice
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="button-sm"
                  onClick={() => setVoiceOpen(false)}
                >
                  Keep typing
                </Button>
              </div>
            </div>
          )}
          <ErrorMessage message={error} />
          <p className="field-hint">
            {listening
              ? 'Listening… speak naturally. It stops when you tap “Stop listening” or after 5 seconds of silence.'
              : 'Your draft is kept in this browser tab while you write.'}
          </p>
          <ModeNote provider={s.provider} />
        </form>
      </div>
    );
  if (s.status === 'feedback' && s.feedback)
    return (
      <div className="narrow-shell">
        <Back />
        <Steps step={4} />
        <div className="page-intro">
          <div className="eyebrow">
            <Sprout />A little deeper
          </div>
          <h1>There’s a detail in that.</h1>
          <p className="body-copy">One thoughtful question. A new way of looking.</p>
        </div>
        <details className="disclosure">
          <summary>Your observation · {s.exercise.title}</summary>
          <p className="observation-quote">{s.observation}</p>
        </details>
        <div className="feedback-card">
          <div className="eyebrow">
            <Sparkles />
            {s.provider === 'demo' ? 'Your demo coach' : 'Your observation coach'}
          </div>
          <p className="coach-reflection">{s.feedback.reflection}</p>
          <div className="skill-chips">
            {Object.entries(s.feedback.evidence).map(([skill, quote]) => (
              <span key={skill} className="pill" title={quote}>
                {skillInfo[skill as keyof typeof skillInfo].label}
              </span>
            ))}
          </div>
          <p className="coach-question">{s.feedback.question}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act('complete', { followup: answer });
          }}
        >
          <label className="form-label" htmlFor="followup">
            What comes to mind?
          </label>
          <textarea
            className="form-input"
            id="followup"
            rows={4}
            placeholder="Looking back, I think…"
            value={answer}
            onChange={(e) => writeAnswer(e.target.value)}
            required
            minLength={2}
            maxLength={2000}
            disabled={busy}
          />
          <div className="textarea-footer">
            <span>A short response is enough.</span>
            <span>{answer.length} / 2,000</span>
          </div>
          <ErrorMessage message={error} />
          <div className="action-row spaced-top">
            <span className="tiny-copy">
              Your next invitation grows
              <br />
              from what you noticed.
            </span>
            <Button busy={busy} disabled={answer.trim().length < 2} type="submit">
              {busy ? 'Finding your next step…' : 'Finish this reflection'}
              <Check />
            </Button>
          </div>
        </form>
        <ModeNote provider={s.provider} />
      </div>
    );
  return (
    <div className="narrow-shell">
      <Back />
      <div className="completion-icon">
        <Check />
      </div>
      <div className="page-intro">
        <div className="eyebrow">A moment, well noticed</div>
        <h1>
          A small detail.
          <br />A little more awareness.
        </h1>
        <p className="body-copy">
          Your observation is saved in your field notes. Take what you’ve noticed back into your
          day.
        </p>
      </div>
      <div className="skill-chips">
        {Object.entries(s.skillGains || {})
          .filter(([, n]) => n > 0)
          .map(([skill, n]) => (
            <span className="pill" key={skill}>
              {skillInfo[skill as keyof typeof skillInfo].label} +{n}
            </span>
          ))}
      </div>
      <p className="tiny-copy">
        Skill signals reflect the details in your words—not a grade on your experience.
      </p>
      {s.nextExercise && (
        <div className="next-card">
          <Sprout />
          <div>
            <div className="eyebrow">Whenever you’re ready · Your next invitation</div>
            <h3>{s.nextExercise.title}</h3>
            <p>{s.nextExercise.instruction}</p>
          </div>
        </div>
      )}
      <details className="disclosure">
        <summary>Revisit this observation</summary>
        <p className="observation-quote">{s.observation}</p>
        <p className="observation-quote">
          <strong>Your coach:</strong> {s.feedback?.reflection}
        </p>
        <p className="observation-quote">{s.feedback?.question}</p>
        <p className="observation-quote">
          <strong>Your reflection:</strong> {s.followup}
        </p>
      </details>
      <div className="action-row">
        <Link className="button button-secondary" href="/progress">
          See your growing skills <MoveUpRight />
        </Link>
        <Link className="button button-primary" href="/session">
          Another moment outside <ArrowUpRight />
        </Link>
      </div>
      <p className="completion-reminder">You can put your phone away now. You’ve done enough.</p>
      <div className="center-content">
        <Link className="text-link" href="/home">
          Done for now <ArrowRight />
        </Link>
      </div>
      <ModeNote provider={s.provider} />
    </div>
  );
}
function ScanLeaf() {
  return <Leaf />;
}
