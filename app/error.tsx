'use client';
import { Button } from '@/components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="narrow-shell">
      <div className="page-intro">
        <h1>A little interruption.</h1>
        <p className="body-copy">
          We couldn’t load this part of your practice. Please try again; we haven’t intentionally
          reset your history.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
