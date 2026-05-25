export function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b-2 border-brutal-fg/20 py-6 md:py-7 first:border-t-2 first:border-brutal-fg/20">
      <summary
        className="
          flex items-start justify-between gap-6 cursor-pointer list-none
          [&::-webkit-details-marker]:hidden
        "
      >
        <h3 className="font-display font-semibold text-xl md:text-2xl text-brutal-fg leading-tight">
          {q}
        </h3>
        <span
          aria-hidden
          className="font-mono text-3xl leading-none text-brutal-fg shrink-0 mt-1 transition-transform duration-150 group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <p className="mt-4 text-base md:text-lg text-brutal-fg/80 leading-relaxed max-w-3xl pr-12">
        {a}
      </p>
    </details>
  );
}
