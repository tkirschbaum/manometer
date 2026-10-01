import type { ResponsePayload } from '@pulse/shared';

/** What is stored in responses.payload: the validated payload, word cloud entries normalised with their group key. */
export type StoredPayload =
  Exclude<ResponsePayload, { type: 'word_cloud' }> | { type: 'word_cloud'; text: string; key: string };

/** Strip server-only fields before sending a participant their own answers. */
export function toPublicPayload(payload: StoredPayload): ResponsePayload {
  if (payload.type === 'word_cloud') return { type: 'word_cloud', text: payload.text };
  return payload;
}
