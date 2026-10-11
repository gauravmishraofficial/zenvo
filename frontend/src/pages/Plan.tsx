import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon, MinusIcon, PlusIcon } from '../components/icons';
import { usePageTitle } from '../hooks/usePageTitle';
import { BUDGETS, INTERESTS, MAX_TRIP_DAYS, TRANSPORT_MODES } from '../lib/constants';
import { addDays, formatRange, todayISO, tripLength } from '../lib/format';
import { savePendingRequest } from '../lib/pending';
import type { TripRequest } from '../types/trip';

interface FormState {
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget: string;
  interests: string[];
  mode: string;
  car_model: string;
  notes: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const STEPS = ['Where & when', 'Your style', 'Getting around'] as const;

function validate(step: number, f: FormState): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.destination.trim().length < 2) e.destination = 'Tell us where you want to go.';
    if (!f.start_date) e.start_date = 'Pick a start date.';
    else if (f.start_date < todayISO()) e.start_date = 'Start date can not be in the past.';
    if (!f.end_date) e.end_date = 'Pick an end date.';
    else if (f.start_date && f.end_date < f.start_date) e.end_date = 'End date must be on or after the start date.';
    else if (f.start_date && tripLength(f.start_date, f.end_date) > MAX_TRIP_DAYS)
      e.end_date = `Trips can be up to ${MAX_TRIP_DAYS} days long.`;
    if (!Number.isInteger(f.travelers) || f.travelers < 1 || f.travelers > 20)
      e.travelers = 'Travelers must be between 1 and 20.';
  }
  if (step === 1) {
    if (!f.budget) e.budget = 'Choose a budget.';
    if (f.interests.length === 0) e.interests = 'Pick at least one interest.';
  }
  if (step === 2) {
    if (!f.mode) e.mode = 'Choose how you will get around.';
    if (f.car_model.length > 60) e.car_model = 'Keep the car model under 60 characters.';
    if (f.notes.length > 500) e.notes = 'Keep notes under 500 characters.';
  }
  return e;
}

export default function Plan() {
  usePageTitle('Plan a trip');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayISO();

  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [form, setForm] = useState<FormState>(() => ({
    destination: params.get('destination') ?? '',
    start_date: addDays(today, 14),
    end_date: addDays(today, 18),
    travelers: 2,
    budget: 'mid',
    interests: [],
    mode: 'public_transit',
    car_model: '',
    notes: '',
  }));
  const headingRef = useRef<HTMLHeadingElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const goTo = (n: number) => {
    setStep(n);
    setErrors({});
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(step, form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const first = Object.keys(errs)[0];
      requestAnimationFrame(() => document.getElementById(`plan-${first}`)?.focus());
      return;
    }
    if (step < STEPS.length - 1) return goTo(step + 1);

    // last step: re-validate everything, jump back to the first broken step if needed
    for (let s = 0; s < STEPS.length - 1; s++) {
      if (Object.keys(validate(s, form)).length > 0) return goTo(s);
    }
    const request: TripRequest = {
      destination: form.destination.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      travelers: form.travelers,
      budget: form.budget,
      interests: form.interests,
      transport: {
        mode: form.mode,
        ...(form.mode === 'car' && form.car_model.trim() ? { car_model: form.car_model.trim() } : {}),
      },
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };
    savePendingRequest(request);
    navigate('/trip/new');
  };

  const err = (key: keyof FormState) =>
    errors[key] ? (
      <p id={`plan-${key}-error`} className="field-error">
        {errors[key]}
      </p>
    ) : null;
  const describe = (key: keyof FormState) => (errors[key] ? `plan-${key}-error` : undefined);

  const days = form.start_date && form.end_date && form.end_date >= form.start_date ? tripLength(form.start_date, form.end_date) : 0;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_17rem]">
      <div>
        <p className="eyebrow">Step {step + 1} of {STEPS.length}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-4xl font-extrabold outline-none sm:text-5xl">
          {step === 0 && 'Where are we going?'}
          {step === 1 && 'What is your style?'}
          {step === 2 && 'How will you get around?'}
        </h1>

        <ol className="mt-6 flex gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1" aria-current={i === step ? 'step' : undefined}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => goTo(i)}
                className={`w-full rounded-md border-2 border-line px-2 py-2 text-left font-mono text-[11px] font-bold uppercase tracking-widest transition-colors disabled:cursor-default ${
                  i === step ? 'bg-brass/40' : i < step ? 'bg-card' : 'bg-transparent text-muted'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {i < step ? <CheckIcon width={14} height={14} /> : <span>{i + 1}.</span>}
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <form onSubmit={submit} noValidate className="card mt-6 space-y-6 p-5 sm:p-7">
          {step === 0 && (
            <>
              <div>
                <label htmlFor="plan-destination" className="label">Destination</label>
                <input
                  id="plan-destination"
                  className="input"
                  placeholder="City, region or country"
                  value={form.destination}
                  onChange={(e) => set('destination', e.target.value)}
                  autoComplete="off"
                  aria-invalid={!!errors.destination}
                  aria-describedby={describe('destination')}
                />
                {err('destination')}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="plan-start_date" className="label">Start date</label>
                  <input
                    id="plan-start_date"
                    type="date"
                    className="input"
                    min={today}
                    value={form.start_date}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, start_date: v, end_date: f.end_date && f.end_date < v ? v : f.end_date }));
                      setErrors((x) => ({ ...x, start_date: undefined, end_date: undefined }));
                    }}
                    aria-invalid={!!errors.start_date}
                    aria-describedby={describe('start_date')}
                  />
                  {err('start_date')}
                </div>
                <div>
                  <label htmlFor="plan-end_date" className="label">End date</label>
                  <input
                    id="plan-end_date"
                    type="date"
                    className="input"
                    min={form.start_date || today}
                    value={form.end_date}
                    onChange={(e) => set('end_date', e.target.value)}
                    aria-invalid={!!errors.end_date}
                    aria-describedby={describe('end_date')}
                  />
                  {err('end_date')}
                </div>
              </div>

              <div>
                <label htmlFor="plan-travelers" className="label">Travelers</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm h-11 w-11 !px-0"
                    aria-label="Fewer travelers"
                    onClick={() => set('travelers', Math.max(1, form.travelers - 1))}
                  >
                    <MinusIcon width={18} height={18} />
                  </button>
                  <input
                    id="plan-travelers"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    className="input h-11 w-20 text-center font-mono font-bold"
                    value={Number.isNaN(form.travelers) ? '' : form.travelers}
                    onChange={(e) => set('travelers', e.target.value === '' ? NaN : Number(e.target.value))}
                    aria-invalid={!!errors.travelers}
                    aria-describedby={describe('travelers')}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm h-11 w-11 !px-0"
                    aria-label="More travelers"
                    onClick={() => set('travelers', Math.min(20, (form.travelers || 0) + 1))}
                  >
                    <PlusIcon width={18} height={18} />
                  </button>
                </div>
                {err('travelers')}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <fieldset aria-describedby={describe('budget')}>
                <legend className="label">Budget</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {BUDGETS.map((b) => (
                    <label
                      key={b.value}
                      className={`block cursor-pointer rounded-lg border-2 border-line p-3 transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-accent ${
                        form.budget === b.value ? 'bg-brass/40' : 'bg-card hover:bg-brass/15'
                      }`}
                    >
                      <input
                        type="radio"
                        name="budget"
                        id={`plan-budget-${b.value}`}
                        value={b.value}
                        checked={form.budget === b.value}
                        onChange={() => set('budget', b.value)}
                        className="sr-only"
                      />
                      <span className="block font-display text-lg font-extrabold">{b.label}</span>
                      <span className="mt-0.5 block text-sm text-muted">{b.hint}</span>
                    </label>
                  ))}
                </div>
                {err('budget')}
              </fieldset>

              <fieldset aria-describedby={describe('interests')}>
                <legend className="label">Interests (pick a few)</legend>
                <div className="flex flex-wrap gap-2" id="plan-interests" tabIndex={-1}>
                  {INTERESTS.map((i) => {
                    const on = form.interests.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className="chip"
                        aria-pressed={on}
                        onClick={() =>
                          set('interests', on ? form.interests.filter((x) => x !== i) : [...form.interests, i])
                        }
                      >
                        {on && <CheckIcon width={14} height={14} />}
                        {i}
                      </button>
                    );
                  })}
                </div>
                {err('interests')}
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <fieldset aria-describedby={describe('mode')}>
                <legend className="label">Main way of getting around</legend>
                <div className="flex flex-wrap gap-2" id="plan-mode" role="radiogroup">
                  {TRANSPORT_MODES.map((m) => (
                    <label
                      key={m.value}
                      className={`chip cursor-pointer focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-accent ${
                        form.mode === m.value ? '!bg-ink !text-paper' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        value={m.value}
                        checked={form.mode === m.value}
                        onChange={() => set('mode', m.value)}
                        className="sr-only"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
                {err('mode')}
              </fieldset>

              {form.mode === 'car' && (
                <div>
                  <label htmlFor="plan-car_model" className="label">Car model (optional)</label>
                  <input
                    id="plan-car_model"
                    className="input"
                    placeholder="e.g. Toyota Prius, Tesla Model 3"
                    value={form.car_model}
                    onChange={(e) => set('car_model', e.target.value)}
                    aria-invalid={!!errors.car_model}
                    aria-describedby={describe('car_model')}
                  />
                  <p className="mt-1.5 text-xs text-muted">Helps with range, parking and road advice.</p>
                  {err('car_model')}
                </div>
              )}

              <div>
                <label htmlFor="plan-notes" className="label">Anything else? (optional)</label>
                <textarea
                  id="plan-notes"
                  rows={4}
                  className="input resize-y"
                  placeholder="Allergies, mobility needs, must-see places, an anniversary…"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  aria-invalid={!!errors.notes}
                  aria-describedby={describe('notes')}
                />
                <p className="mt-1 text-right font-mono text-xs text-muted">{form.notes.length}/500</p>
                {err('notes')}
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-3 border-t-2 border-dashed border-line/50 pt-5">
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => goTo(step - 1)}>
                Back
              </button>
            ) : (
              <Link to="/" className="btn btn-ghost">
                Cancel
              </Link>
            )}
            <button type="submit" className="btn btn-primary">
              {step < STEPS.length - 1 ? 'Next' : 'Plan my trip'} <ArrowRightIcon width={18} height={18} />
            </button>
          </div>
        </form>
      </div>

      {/* live summary: the "ticket" */}
      <aside className="hidden lg:block" aria-label="Trip summary">
        <div className="card sticky top-24 space-y-4 p-5">
          <p className="eyebrow">Boarding pass</p>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">To</p>
            <p className="font-display text-2xl font-extrabold leading-tight break-words">
              {form.destination.trim() || '—'}
            </p>
          </div>
          <dl className="space-y-3 border-t-2 border-dashed border-line/50 pt-4 text-sm">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">When</dt>
              <dd className="font-semibold">
                {days > 0 ? `${formatRange(form.start_date, form.end_date)} (${days} day${days === 1 ? '' : 's'})` : '—'}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">Travelers</dt>
              <dd className="font-semibold">{Number.isNaN(form.travelers) ? '—' : form.travelers}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">Style</dt>
              <dd className="font-semibold">
                {BUDGETS.find((b) => b.value === form.budget)?.label}
                {form.interests.length > 0 && ` · ${form.interests.join(', ')}`}
              </dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
