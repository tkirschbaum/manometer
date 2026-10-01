import { PRODUCT_NAME } from '@pulse/shared';

/** Product mark (§11.3): the name set in the brand font, navy, with the red "live" dot. */
export function ProductMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[22px] font-bold tracking-tight text-navy">
      {PRODUCT_NAME}
      <span className="mt-1 inline-block size-2 rounded-full bg-red" aria-hidden="true" />
    </span>
  );
}
