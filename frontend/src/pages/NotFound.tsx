import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <section className="mx-auto max-w-lg py-16 text-center">
      <span className="stamp">Return to sender</span>
      <h1 className="mt-6 text-7xl font-extrabold">404</h1>
      <p className="mt-3 text-lg text-muted">This page is not on the map. Let's get you back on the route.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/" className="btn btn-primary">
          Back home
        </Link>
        <Link to="/plan" className="btn btn-ghost">
          Plan a trip
        </Link>
      </div>
    </section>
  );
}
