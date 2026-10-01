import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet';

const styles: Record<Variant, string> = {
  primary: 'bg-navy text-paper border-navy hover:bg-navy-soft',
  secondary: 'bg-paper text-navy border-navy hover:bg-mist',
  quiet: 'bg-transparent text-navy border-transparent hover:bg-mist',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-brand border-2 px-5 text-[18px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
