'use client';

import { useEffect, useRef, useState } from 'react';

export type WorkflowItem = {
  label: string;
  problem: string;
  solution: string;
  example: string;
  timeSaved: string;
};

type Variant = 'default' | 'inverted' | 'accent';

function variantFor(index: number): Variant {
  const cycle = index % 7;
  if (cycle === 2 || cycle === 5) return 'inverted';
  if (cycle === 4) return 'accent';
  return 'default';
}

export function WhatWeBuildMarquee({
  items,
  labels,
}: {
  items: WorkflowItem[];
  labels: {
    problemLabel: string;
    solutionLabel: string;
    exampleLabel: string;
    timeSavedLabel: string;
    ctaLabel: string;
    closeLabel: string;
    tapToExplore: string;
    contactHref: string;
  };
}) {
  const half = Math.ceil(items.length / 2);
  const row1 = items.slice(0, half);
  const row2 = items.slice(half);

  const [selected, setSelected] = useState<WorkflowItem | null>(null);

  return (
    <>
      <div
        className="space-y-4 pb-24 md:pb-32"
        aria-label={labels.tapToExplore}
      >
        <MarqueeRow
          items={row1}
          baseIndex={0}
          direction="left"
          onSelect={setSelected}
        />
        <MarqueeRow
          items={row2}
          baseIndex={half}
          direction="right"
          onSelect={setSelected}
        />
      </div>

      <WorkflowDialog
        item={selected}
        onClose={() => setSelected(null)}
        labels={labels}
      />
    </>
  );
}

function MarqueeRow({
  items,
  baseIndex,
  direction,
  onSelect,
}: {
  items: WorkflowItem[];
  baseIndex: number;
  direction: 'left' | 'right';
  onSelect: (item: WorkflowItem) => void;
}) {
  const sequence = [...items, ...items];
  const trackClass = direction === 'left' ? 'marquee-track' : 'marquee-track-reverse';

  return (
    <div className="marquee-container overflow-hidden">
      <ul className={`flex items-center gap-4 ${trackClass}`} role="list">
        {sequence.map((item, i) => {
          const originalIndex = i % items.length;
          const variant = variantFor(baseIndex + originalIndex);
          return (
            <li key={`${item.label}-${i}`} aria-hidden={i >= items.length ? 'true' : undefined}>
              <Tag
                label={item.label}
                variant={variant}
                onClick={() => onSelect(item)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Tag({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: Variant;
  onClick: () => void;
}) {
  const palette =
    variant === 'inverted'
      ? 'bg-brutal-fg text-brutal-bg hover:bg-brutal-fg/90'
      : variant === 'accent'
        ? 'bg-brutal-accent text-brutal-accent-fg hover:brightness-105'
        : 'bg-brutal-bg text-brutal-fg hover:bg-brutal-fg/5';
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'group inline-flex shrink-0 items-center gap-3 border-2 border-brutal-fg px-5 py-2.5 ' +
        'font-mono text-sm md:text-base uppercase tracking-[0.14em] whitespace-nowrap cursor-pointer ' +
        'transition-[transform,box-shadow,background-color] duration-100 ' +
        'hover:shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5 ' +
        palette
      }
    >
      <span aria-hidden className="inline-block h-2 w-2 bg-current" />
      {label}
      <span
        aria-hidden
        className="ml-1 inline-block opacity-50 transition-opacity duration-100 group-hover:opacity-100"
      >
        →
      </span>
    </button>
  );
}

function WorkflowDialog({
  item,
  onClose,
  labels,
}: {
  item: WorkflowItem | null;
  onClose: () => void;
  labels: {
    problemLabel: string;
    solutionLabel: string;
    exampleLabel: string;
    timeSavedLabel: string;
    ctaLabel: string;
    closeLabel: string;
    contactHref: string;
  };
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (item) {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [item]);

  // Close on backdrop click
  function handleClickBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleClickBackdrop}
      className="workflow-dialog m-0 mx-auto my-auto p-0 max-w-[640px] w-[calc(100%-2rem)] max-h-[90vh] bg-brutal-bg text-brutal-fg border-2 border-brutal-fg shadow-brutal-lg overflow-hidden"
    >
      {item && (
        <div className="flex flex-col max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between border-b-2 border-brutal-fg px-5 py-3 sm:px-7">
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-brutal-muted">
              03 · Cosa costruiamo
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.closeLabel}
              className="inline-flex h-8 w-8 items-center justify-center border-2 border-brutal-fg bg-brutal-bg font-mono text-base leading-none hover:bg-brutal-fg hover:text-brutal-bg transition-colors"
            >
              ×
            </button>
          </div>

          <div className="overflow-y-auto px-5 sm:px-7 py-6 sm:py-8 space-y-7">
            <h3 className="font-display font-bold text-3xl sm:text-4xl tracking-tight leading-[1.05]">
              {item.label}
            </h3>

            <DetailSection title={labels.problemLabel} body={item.problem} />
            <DetailSection title={labels.solutionLabel} body={item.solution} />
            <DetailSection title={labels.exampleLabel} body={item.example} />

            <div className="border-t-2 border-brutal-fg pt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
                {labels.timeSavedLabel}
              </span>
              <span className="font-display font-bold text-xl sm:text-2xl text-brutal-fg">
                {item.timeSaved}
              </span>
            </div>
          </div>

          <div className="border-t-2 border-brutal-fg px-5 sm:px-7 py-4 bg-brutal-bg">
            <a
              href={labels.contactHref}
              onClick={onClose}
              className="group inline-flex items-center gap-2 bg-brutal-accent text-brutal-accent-fg font-display font-semibold text-base px-5 py-2.5 border-2 border-brutal-fg shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-[transform,box-shadow] duration-100"
            >
              {labels.ctaLabel}
              <span aria-hidden className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </a>
          </div>
        </div>
      )}
    </dialog>
  );
}

function DetailSection({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted mb-2">
        {title}
      </p>
      <p className="text-base sm:text-lg leading-relaxed text-brutal-fg/90">
        {body}
      </p>
    </div>
  );
}
