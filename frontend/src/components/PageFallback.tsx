export default function PageFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-widest text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
