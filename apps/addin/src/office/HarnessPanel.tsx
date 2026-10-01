import { useState, useSyncExternalStore } from 'react';
import type { HarnessControls } from './harnessHost';

/** Development controls for the browser harness (§6.9). Not part of the product UI. */
export function HarnessPanel({ controls }: { controls: HarnessControls }) {
  const state = useSyncExternalStore(controls.subscribe, controls.getState);
  const [open, setOpen] = useState(true);
  const other = state.currentSlideId === state.slideId ? `${state.slideId}0` : state.slideId;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="fixed right-2 bottom-2 z-50 rounded-brand border border-ink bg-paper px-2 py-1 font-mono text-[11px]"
      >
        Harness
      </button>
    );
  }
  const btn = 'rounded-[4px] border border-ink px-1.5 py-0.5 hover:bg-mist';
  return (
    <div data-testid="harness" className="fixed right-2 bottom-2 z-50 flex max-w-[300px] flex-col gap-1 rounded-brand border border-ink bg-paper p-2 font-mono text-[11px] text-ink">
      <div className="flex justify-between gap-2">
        <strong>
          Harness {state.instance} · slide {state.slideId}
        </strong>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
          }}
        >
          ×
        </button>
      </div>
      <div>
        view: {state.view} · showing slide {state.currentSlideId}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn} data-testid="harness-edit" onClick={() => { controls.setView('edit'); }}>
          Normal
        </button>
        <button type="button" className={btn} data-testid="harness-read" onClick={() => { controls.setView('read'); }}>
          Slideshow
        </button>
        <button type="button" className={btn} data-testid="harness-show-this" onClick={() => { controls.showSlide(state.slideId); }}>
          Show this slide
        </button>
        <button type="button" className={btn} data-testid="harness-show-other" onClick={() => { controls.showSlide(other); }}>
          Show other slide
        </button>
        <button type="button" className={btn} onClick={() => window.open(controls.duplicate(), '_blank')}>
          Duplicate slide
        </button>
        <button type="button" className={btn} onClick={() => window.open(controls.insertNew(), '_blank')}>
          New slide + add-in
        </button>
      </div>
    </div>
  );
}
