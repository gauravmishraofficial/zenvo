import { Link } from 'react-router-dom';
import { USE_AI, USE_MOCK } from '../api';

export default function Footer() {
  return (
    <footer className="mt-20 border-t-2 border-line bg-card/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-extrabold">Zenvo</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Voyage by Zenvo plans your trip day by day, with a photo for every stop.
          </p>
          <p className="mt-4">
            <a
              href="https://www.llama.com/llama4/license/"
              target="_blank"
              rel="noopener noreferrer"
              className="stamp !rotate-0 hover:bg-accent hover:text-accent-fg"
            >
              Built with Llama
            </a>
          </p>
        </div>
        <nav aria-label="Footer" className="text-sm">
          <p className="eyebrow mb-2">Explore</p>
          <ul className="space-y-1.5">
            <li><Link to="/plan" className="link">Plan a trip</Link></li>
            <li><Link to="/trips" className="link">Saved trips</Link></li>
            <li><Link to="/login" className="link">Log in</Link></li>
          </ul>
        </nav>
        <div className="text-sm text-muted">
          <p className="eyebrow mb-2">Credits</p>
          <p>Destination photos come from Wikipedia and Wikimedia Commons contributors.</p>
          {USE_MOCK && (
            <p className="mt-3 font-mono text-xs font-bold uppercase tracking-widest text-sea">
              {USE_AI ? 'Beta: trips are saved in this browser' : 'Demo mode: mock data'}
            </p>
          )}
        </div>
      </div>
      <div className="border-t-2 border-line/40 py-4 text-center font-mono text-[11px] uppercase tracking-widest text-muted">
        © {new Date().getFullYear()} Zenvo
      </div>
    </footer>
  );
}
