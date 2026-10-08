import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet';

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-paper border-primary shadow-[0_6px_16px_-6px_rgb(61_90_241/0.6)] hover:bg-primary-dark',
  secondary: 'bg-paper text-primary border-primary hover:bg-primary-soft',
  quiet: 'bg-transparent text-ink border-transparent hover:bg-mist',
};

/** Pill buttons (Mentimeter-like): primary filled, secondary outlined. */
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-full border-2 px-6 text-[18px] font-bold transition-[background-color,transform,box-shadow] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
