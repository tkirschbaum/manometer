import { useI18n } from '../lib/i18n';
import { WifiOffIcon } from './icons';

/** Non-blocking banner while the connection is down (§7.2). Inputs stay usable. */
export function ConnectionBanner() {
  const { t } = useI18n();
  return (
    <div role="status" className="sticky top-0 z-20 flex items-center gap-2 bg-mist px-5 py-2.5 text-[16px] text-ink">
      <WifiOffIcon size={18} className="shrink-0 text-ink" />
      {t('session.connectionLost')}
    </div>
  );
}
