import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet';
const variants: Record<Variant, string> = {
  primary: 'border-navy bg-navy text-paper hover:bg-navy-soft',
  secondary: 'border-line bg-paper text-navy hover:border-navy',
  quiet: 'border-transparent bg-transparent text-navy hover:bg-mist',
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-brand border px-3 font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[12px] font-semibold text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-brand border border-line bg-paper px-2.5 py-1.5 text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none';

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 select-none">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-navy peer-focus-visible:outline-2 peer-focus-visible:outline-red after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-paper after:transition-transform peer-checked:after:translate-x-4"
      />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-brand border border-line p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => {
            onChange(o.value);
          }}
          className={`tabular min-h-7 rounded-[4px] px-2.5 font-semibold ${o.value === value ? 'bg-navy text-paper' : 'text-navy hover:bg-mist'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small popover menu anchored below its button; closes on outside click and Escape. */
export function Menu({
  open,
  onClose,
  children,
  align = 'right',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className={`absolute top-full z-30 mt-1 min-w-56 rounded-brand border border-line bg-paper py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
}: {
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-mist disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dlg-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(92vw,380px)] rounded-brand border border-line p-4 text-ink backdrop:bg-ink/40"
    >
      <h2 id="dlg-title" className="text-[16px] font-bold text-navy">
        {title}
      </h2>
      <p className="mt-2">{body}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-brand bg-navy px-3 py-2 font-semibold text-paper"
    >
      {message}
    </div>
  );
}
