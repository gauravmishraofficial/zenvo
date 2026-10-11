import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Photo from '../components/Photo';
import { ArrowRightIcon } from '../components/icons';
import { DESTINATION_IDEAS } from '../lib/constants';
import { usePageTitle } from '../hooks/usePageTitle';

const STEPS = [
  { n: '01', title: 'Tell us the basics', body: 'Where, when, who is coming and what you like. Takes about a minute.' },
  { n: '02', title: 'Watch it take shape', body: 'Your itinerary streams in one day at a time, each with a photo of where you will be.' },
  { n: '03', title: 'Save it and go', body: 'Keep your trips in one place and come back to them whenever you need.' },
];

export default function Home() {
  usePageTitle();
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');

  const start = (e: FormEvent) => {
    e.preventDefault();
    const q = destination.trim();
    navigate(q ? `/plan?destination=${encodeURIComponent(q)}` : '/plan');
  };

  return (
    <div className="space-y-20 sm:space-y-28">
      {/* hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]" aria-labelledby="hero-title">
        <div>
          <span className="stamp">Voyage by Zenvo</span>
          <h1 id="hero-title" className="mt-5 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
            Your next trip,
            <br />
            <span className="relative inline-block">
              <span className="relative z-10">mapped day by day.</span>
              <span className="absolute -bottom-1 left-0 z-0 h-3 w-full bg-brass/50 sm:h-4" aria-hidden="true" />
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Tell Voyage where you want to go and how you like to travel. A full itinerary appears in seconds, with a
            real photo for every destination and every day.
          </p>

          <form onSubmit={start} className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row" role="search">
            <div className="flex-1">
              <label htmlFor="home-destination" className="sr-only">
                Where do you want to go?
              </label>
              <input
                id="home-destination"
                className="input h-12"
                placeholder="Where to? Try Lisbon, Kyoto…"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button type="submit" className="btn btn-primary h-12">
              Start planning <ArrowRightIcon width={18} height={18} />
            </button>
          </form>
        </div>

        {/* postcard */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="card rotate-2 bg-card p-3 transition-transform duration-300 hover:rotate-0 sm:p-4">
            <Photo
              query="Lisbon"
              width={960}
              alt="Lisbon, Portugal"
              aspect="aspect-[4/3]"
              rounded="rounded-md"
              className="[&>div]:border-2 [&>div]:border-line"
            />
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Greetings from</p>
                <p className="font-display text-3xl font-extrabold leading-none">Lisbon</p>
              </div>
              <div className="stamp !rotate-6 text-center leading-tight">
                Day 01
                <br />
                of 04
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section aria-labelledby="how-title">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title" className="mt-1 text-3xl font-extrabold sm:text-4xl">
          From “maybe Portugal?” to a plan.
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-6">
              <p className="font-mono text-sm font-bold text-accent">{s.n}</p>
              <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* destination ideas */}
      <section aria-labelledby="ideas-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Need inspiration?</p>
            <h2 id="ideas-title" className="mt-1 text-3xl font-extrabold sm:text-4xl">
              Destination ideas
            </h2>
          </div>
          <Link to="/plan" className="link text-sm">
            Or start from scratch
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
          {DESTINATION_IDEAS.map((d) => (
            <li key={d.name}>
              <Link
                to={`/plan?destination=${encodeURIComponent(d.name)}`}
                className="group card block overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-stamp-lg"
              >
                <Photo
                  query={d.name}
                  width={960}
                  alt={`${d.name}, ${d.country}`}
                  aspect="aspect-[4/3] sm:aspect-[3/2]"
                  className="[&>div]:border-b-2 [&>div]:border-line"
                />
                <div className="p-4">
                  <p className="eyebrow">{d.country}</p>
                  <p className="font-display text-xl font-extrabold sm:text-2xl">{d.name}</p>
                  <p className="mt-1 hidden text-sm text-muted sm:block">{d.blurb}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
