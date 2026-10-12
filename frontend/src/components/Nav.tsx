import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CloseIcon, CompassIcon, MenuIcon } from './icons';
import ThemeToggle from './ThemeToggle';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md border-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
    isActive ? 'border-line bg-brass/30' : 'border-transparent hover:border-line'
  }`;

export default function Nav() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const links = (
    <>
      <NavLink to="/plan" className={linkClass}>
        Plan a trip
      </NavLink>
      <NavLink to="/trips" className={linkClass}>
        Saved trips
      </NavLink>
    </>
  );

  const account = loading ? null : user ? (
    <>
      <span className="max-w-[12rem] truncate font-mono text-xs text-muted" title={user.email}>
        {user.email}
      </span>
      <button type="button" onClick={logout} className="btn btn-ghost btn-sm">
        Log out
      </button>
    </>
  ) : (
    <>
      <Link to="/login" className="btn btn-ghost btn-sm">
        Log in
      </Link>
      <Link to="/register" className="btn btn-primary btn-sm">
        Sign up
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b-2 border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Zenvo Voyage, home">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-line bg-accent text-accent-fg transition-transform duration-300 group-hover:rotate-45">
            <CompassIcon width={22} height={22} />
          </span>
          <span className="leading-none">
            <span className="block font-display text-xl font-extrabold tracking-tight">Zenvo</span>
            <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-muted">Voyage</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {account}
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-line bg-card"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <div id="mobile-menu" hidden={!open} className="border-t-2 border-line bg-paper md:hidden">
        <nav aria-label="Mobile" className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4">
          {links}
          <div className="mt-2 flex flex-wrap items-center gap-2">{account}</div>
        </nav>
      </div>
    </header>
  );
}
