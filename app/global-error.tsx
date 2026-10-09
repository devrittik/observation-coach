'use client';
import './globals.css';
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="narrow-shell">
          <div className="page-intro">
            <div className="eyebrow">A little interruption</div>
            <h1>We couldn’t open your practice.</h1>
            <p className="body-copy">
              The application or its database may be temporarily unavailable. Try again in a moment.
              If you run this app locally, check that the database folder is writable and your
              provider configuration is valid.
            </p>
          </div>
          <button className="button button-primary" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
