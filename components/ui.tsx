'use client';
import { LoaderCircle, ArrowLeft, LockKeyhole, Cloud, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn, ui } from '@/lib/styles';
import type { Provider, ObservationSession } from '@/lib/types';
export function Button({
  children,
  busy,
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}) {
  return (
    <button {...props} disabled={props.disabled || busy} className={cn(ui[variant], className)}>
      {busy ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="error-message" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading-shell" role="status">
      <LoaderCircle size={18} className="spin" /> Taking a quiet moment…
    </div>
  );
}
export function Back({
  href = '/home',
  children = 'Back to practice',
}: {
  href?: string;
  children?: ReactNode;
}) {
  return (
    <Link className="back-link" href={href}>
      <ArrowLeft />
      {children}
    </Link>
  );
}
export function ModeNote({ provider }: { provider: Provider }) {
  const Icon = provider === 'local' ? LockKeyhole : provider === 'hosted' ? Cloud : FlaskConical;
  return (
    <div className="mode-note">
      <Icon />
      <p>
        {provider === 'demo' ? (
          <>Guided demo · Feedback uses simple, deterministic rules—not a live AI model.</>
        ) : provider === 'hosted' ? (
          <>
            Hosted AI · Your reflection is sent to the configured model provider. Avoid sharing
            sensitive details.
          </>
        ) : (
          <>
            Local AI · Reflections are processed by the configured local model. Run the app locally
            to keep storage on your device.
          </>
        )}{' '}
        <Link href="/settings">About privacy</Link>
      </p>
    </div>
  );
}
export function Steps({ step }: { step: number }) {
  return (
    <div className="step-indicator" aria-label={`Step ${step} of 4`}>
      {[1, 2, 3, 4].map((s) => (
        <span key={s} className={s <= step ? 'done' : ''} />
      ))}
      <small>
        {
          ['Your invitation', 'Out in the world', 'What you noticed', 'A little reflection'][
            step - 1
          ]
        }
      </small>
    </div>
  );
}
export function sessionHref(s: ObservationSession) {
  return `${s.status === 'exercise' || s.status === 'outside' ? '/observe' : s.status === 'reflection' ? '/reflection' : '/feedback'}?id=${s.id}`;
}
export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');
