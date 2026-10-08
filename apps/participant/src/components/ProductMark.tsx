import { PRODUCT_NAME } from '@pulse/shared';

/** Product mark (§11.3): a small "pulse" badge and the name. */
export function ProductMark() {
  return (
    <span className="inline-flex items-center gap-2 text-[21px] font-extrabold tracking-tight text-ink">
      <span className="flex size-7 items-center justify-center rounded-[9px] bg-primary" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 12h4l2.5-6 5 12 2.5-6h4"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {PRODUCT_NAME}
    </span>
  );
}
