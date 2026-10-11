export default function DayCardSkeleton() {
  return (
    <div className="card overflow-hidden md:flex" aria-hidden="true">
      <div className="border-b-2 border-line bg-paper md:w-[22rem] md:shrink-0 md:border-b-0 md:border-r-2">
        <div className="skeleton aspect-[16/9] w-full !rounded-none md:aspect-[4/3]" />
      </div>
      <div className="min-w-0 flex-1 space-y-4 p-5 sm:p-6">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-8 w-3/4" />
        <div className="space-y-5 border-l-2 border-dashed border-line/40 pl-5 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-3 w-14" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
