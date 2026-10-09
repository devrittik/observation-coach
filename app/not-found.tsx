import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="narrow-shell">
      <div className="page-intro">
        <div className="eyebrow">A small detour</div>
        <h1>This path ends here.</h1>
        <p className="body-copy">That page isn’t part of your observation practice.</p>
      </div>
      <Link className="button button-primary" href="/">
        Back to a quieter place
      </Link>
    </div>
  );
}
