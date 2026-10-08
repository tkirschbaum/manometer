import { formatJoinCode, parseJoinCode } from '@pulse/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../components/Button';
import { Shell, StickyAction } from '../components/Shell';
import { CrossIcon } from '../components/icons';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';

type Status = 'idle' | 'checking' | 'notFound' | 'invalid' | 'offline';

function groupDigits(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Code entry (§7.1): one large numeric input, auto-grouped "482 913", accepts pasted links. */
export function JoinScreen({ initialCode, notFound = false }: { initialCode?: string; notFound?: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialCode ? formatJoinCode(initialCode) : '');
  const [status, setStatus] = useState<Status>(notFound ? 'notFound' : 'idle');

  const submit = async (e: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const code = parseJoinCode(value);
    if (!code) {
      setStatus('invalid');
      return;
    }
    setStatus('checking');
    try {
      const res = await fetch(`/api/join/${code}`, { headers: { accept: 'application/json' } });
      const body = (await res.json()) as { exists?: boolean };
      if (body.exists === true) navigate(`/${code}`);
      else setStatus('notFound');
    } catch {
      setStatus('offline');
    }
  };

  const message =
    status === 'notFound'
      ? t('join.notFound')
      : status === 'invalid'
        ? t('join.invalid')
        : status === 'offline'
          ? t('join.offline')
          : null;

  return (
    <Shell>
      <form onSubmit={(e) => void submit(e)} className="flex flex-1 flex-col" noValidate>
        <h1 className="mt-8 text-[32px] leading-tight font-extrabold tracking-tight text-ink">{t('join.title')}</h1>
        <label htmlFor="join-code" className="mt-8 block text-[16px] font-semibold text-muted">
          {t('join.label')}
        </label>
        <input
          id="join-code"
          name="code"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="123 456"
          aria-describedby="join-hint join-error"
          aria-invalid={message ? true : undefined}
          value={value}
          onChange={(e) => {
            const pasted = parseJoinCode(e.target.value);
            setValue(pasted ? formatJoinCode(pasted) : groupDigits(e.target.value));
            if (status !== 'checking') setStatus('idle');
          }}
          className="tabular mt-2 w-full rounded-brand border-2 border-transparent bg-mist px-4 py-4 text-center text-[42px] font-extrabold tracking-[0.1em] text-ink transition-colors placeholder:text-[#c9cee0] focus:border-primary focus:bg-paper focus:outline-none"
        />
        <p id="join-hint" className="mt-3 text-[16px] text-muted">
          {t('join.hint')}
        </p>
        <p
          id="join-error"
          role="alert"
          className="mt-3 flex min-h-7 items-start gap-2 text-[17px] font-semibold text-ink"
        >
          {message ? (
            <>
              <CrossIcon size={20} className="mt-0.5 shrink-0" />
              {message}
            </>
          ) : null}
        </p>
        <div className="flex-1" />
        <StickyAction>
          <Button type="submit" className="w-full" disabled={status === 'checking'}>
            {status === 'checking' ? t('join.checking') : t('join.submit')}
          </Button>
        </StickyAction>
      </form>
    </Shell>
  );
}
