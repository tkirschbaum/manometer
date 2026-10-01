import { STORAGE_KEYS, newUuid, uuidSchema } from '@pulse/shared';
import { storage } from './storage';

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Anonymous participant id (§4.1): UUID v4 in localStorage, mirrored in the strictly necessary
 * `pulse_pid` cookie (SameSite=Lax, 180 days) for browsers that wipe storage.
 */
export function getParticipantId(): string {
  const candidates = [storage.get(STORAGE_KEYS.participantId), readCookie(STORAGE_KEYS.participantCookie)];
  const existing = candidates.find((value) => value && uuidSchema.safeParse(value).success);
  const id = existing ?? newUuid();
  storage.set(STORAGE_KEYS.participantId, id);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${STORAGE_KEYS.participantCookie}=${id}; Max-Age=${180 * 24 * 3600}; Path=/; SameSite=Lax${secure}`;
  return id;
}
