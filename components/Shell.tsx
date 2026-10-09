'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sprout,
  BookOpen,
  ChartNoAxesCombined,
  Compass,
  ArrowUpRight,
  ShieldCheck,
  FlaskConical,
  Leaf,
} from 'lucide-react';
import { useCoach } from './Provider';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Observation Coach home">
      <span className="brand-mark">
        <Sprout />
      </span>
      <span>
        observation<small>COACH</small>
      </span>
    </Link>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data } = useCoach();
  const hidden = path === '/outside';
  const isAuth = path === '/login' || path === '/register';
  const router = useRouter();
  if (hidden) return <>{children}</>;
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation" className="nav-links">
          <Link
            href={data.user ? '/home' : '/'}
            className={`nav-link ${['/', '/home', '/session', '/observe', '/reflection', '/feedback'].includes(path) ? 'active' : ''}`}
          >
            <Compass />
            Practice
          </Link>
          <Link href="/history" className={`nav-link ${path === '/history' ? 'active' : ''}`}>
            <BookOpen />
            Field notes
          </Link>
          <Link href="/progress" className={`nav-link ${path === '/progress' ? 'active' : ''}`}>
            <ChartNoAxesCombined />
            Your growth
          </Link>
        </nav>
        <div className="header-actions">
          <span className="privacy-mini">
            <ShieldCheck />A quieter kind of AI
          </span>
          <span className="header-divider" />
          {data.user ? (
            <button
              className="avatar"
              aria-label="Your account and settings"
              onClick={() => router.push('/settings')}
            >
              {data.user.name.slice(0, 1).toUpperCase()}
            </button>
          ) : (
            <Link className="text-link" href="/login">
              Log in <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      </header>
      {data.user?.isDemo && !isAuth && (
        <div className="demo-banner">
          <FlaskConical />
          <strong>Guided demo</strong>
          <span>Sample coaching, a real moment of noticing. Demo notes expire after 24 hours.</span>
          <Link href="/register">Make it your practice ↗</Link>
        </div>
      )}
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <span className="footer-heart">
          <Leaf /> Less screen time. More world time.
        </span>
        <div className="footer-links">
          <Link href="/settings">Privacy & local AI</Link>
          <Link href="/#how-it-works">Our philosophy</Link>
          <span>Made for the outside.</span>
        </div>
      </footer>
    </>
  );
}
