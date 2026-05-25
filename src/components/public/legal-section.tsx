export type LegalSectionData = {
  number: string;
  title: string;
  body: string;
  bullets?: string[];
  outro?: string;
};

export function LegalSection({ section }: { section: LegalSectionData }) {
  return (
    <article className="border-t-2 border-brutal-fg/20 pt-10 md:pt-12">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 md:gap-12 lg:gap-16">
        <span className="font-display font-bold text-4xl md:text-5xl lg:text-6xl leading-none tabular-nums text-brutal-fg/40">
          {section.number}
        </span>

        <div className="max-w-3xl">
          <h2
            className="font-display font-bold text-2xl md:text-3xl lg:text-4xl tracking-tight"
            style={{ lineHeight: 1.1 }}
          >
            {section.title}
          </h2>

          <p className="mt-5 text-base md:text-lg text-brutal-fg/85 leading-relaxed">
            {section.body}
          </p>

          {section.bullets && section.bullets.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {section.bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-base md:text-lg text-brutal-fg/85 leading-snug"
                >
                  <span
                    aria-hidden
                    className="font-mono text-brutal-accent text-base leading-none shrink-0 mt-1.5"
                  >
                    ▪
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {section.outro && (
            <p className="mt-5 text-base md:text-lg text-brutal-fg/85 leading-relaxed">
              {section.outro}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
