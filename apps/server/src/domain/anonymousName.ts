import { LIMITS, type Language } from '@pulse/shared';

/** Animals that read well on a leaderboard in both languages; numbers keep names unique (no grammar needed). */
const ANIMALS: Record<Language, readonly string[]> = {
  de: [
    'Otter',
    'Koala',
    'Pinguin',
    'Fuchs',
    'Eule',
    'Biber',
    'Luchs',
    'Delfin',
    'Panda',
    'Igel',
    'Falke',
    'Wal',
    'Dachs',
    'Kranich',
    'Lama',
    'Zebra',
  ],
  en: [
    'Otter',
    'Koala',
    'Penguin',
    'Fox',
    'Owl',
    'Beaver',
    'Lynx',
    'Dolphin',
    'Panda',
    'Hedgehog',
    'Falcon',
    'Whale',
    'Badger',
    'Crane',
    'Llama',
    'Zebra',
  ],
};

/**
 * Quiz name for anonymous mode ("Otter 42"), unique within the deck. `taken` holds the lower-cased names
 * already in use; `random` returns [0, 1) and is injectable for tests.
 */
export function anonymousName(
  language: Language,
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
): string {
  const animals = ANIMALS[language];
  for (let attempt = 0; attempt < 200; attempt++) {
    const animal = animals[Math.floor(random() * animals.length)] ?? 'Otter';
    const name = `${animal} ${1 + Math.floor(random() * 99)}`;
    if (!taken.has(name.toLocaleLowerCase(language)) && name.length <= LIMITS.nicknameMax) return name;
  }
  // Practically unreachable (16 × 99 combinations); fall back to a counter.
  for (let n = 100; ; n++) {
    const name = `${animals[0] ?? 'Otter'} ${n}`;
    if (!taken.has(name.toLocaleLowerCase(language))) return name;
  }
}
