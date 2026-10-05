import { TIMING } from '@pulse/shared';
import cloud from 'd3-cloud';
import { useEffect, useRef, useState } from 'react';
import { EyeOffIcon } from '../ui/icons';

interface Word {
  key: string;
  text: string;
  count: number;
}

interface Placed {
  key: string;
  text: string;
  x: number;
  y: number;
  size: number;
  rank: number;
}

interface CloudWord {
  key: string;
  text: string;
  size: number;
  rank: number;
  x?: number;
  y?: number;
}

const FONT_FAMILY = "'Source Sans 3', 'Segoe UI', sans-serif";
const FONT_WEIGHT = 600;

/** Deterministic random so the same words give the same layout (stable cloud, §6.7). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Resolves once the stage font can be measured; d3-cloud measures on a canvas, a fallback font would overlap. */
function useFontReady(): boolean {
  const [ready, setReady] = useState(() => typeof document === 'undefined' || !('fonts' in document));
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    const done = (): void => {
      if (!cancelled) setReady(true);
    };
    document.fonts.load(`${FONT_WEIGHT} 32px 'Source Sans 3'`).then(done, done);
    // Never wait forever (offline without the font cached): lay out with whatever is there.
    const timer = setTimeout(done, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);
  return ready;
}

/**
 * Word cloud (§6.7): d3-cloud layout, re-laid out at most every 1.5 s, sizes by sqrt(frequency),
 * navy at varying weight with the single most frequent word in the accent colour.
 * Rendered as SVG text because d3-cloud positions words by their baseline (x = centre, y = baseline).
 */
export function WordCloud({
  words,
  hideLabel,
  onHide,
}: {
  words: Word[];
  hideLabel: string;
  onHide?: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fontReady = useFontReady();
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [input, setInput] = useState<Word[]>(words);
  const [hovered, setHovered] = useState<string | null>(null);
  const lastLayout = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Throttle incoming words to one layout per 1.5 s.
  useEffect(() => {
    const wait = Math.max(0, lastLayout.current + TIMING.wordCloudRelayoutMs - Date.now());
    const timer = setTimeout(() => {
      lastLayout.current = Date.now();
      setInput(words);
    }, wait);
    return () => {
      clearTimeout(timer);
    };
  }, [words]);

  useEffect(() => {
    if (!fontReady || size.w < 10 || size.h < 10 || input.length === 0) return;
    const max = Math.max(...input.map((w) => w.count));
    const minFont = size.h * 0.07;
    const maxFont = Math.min(size.h * 0.22, size.w * 0.11);
    const layout = cloud<CloudWord>()
      .size([size.w, size.h])
      .words(
        input.map((w, rank) => ({
          key: w.key,
          text: w.text,
          rank,
          size: minFont + (maxFont - minFont) * Math.sqrt(w.count / max),
        })),
      )
      .padding(Math.max(3, size.h * 0.016))
      .rotate(0)
      .font(FONT_FAMILY)
      .fontWeight(FONT_WEIGHT)
      .fontSize((d) => d.size)
      .random(seeded(7))
      .on('end', (out) => {
        setPlaced(
          out.map((d) => ({
            key: d.key,
            text: d.text,
            rank: d.rank,
            size: d.size,
            x: (d.x ?? 0) + size.w / 2,
            y: (d.y ?? 0) + size.h / 2,
          })),
        );
      });
    layout.start();
    return () => {
      layout.stop();
    };
  }, [input, size.w, size.h, fontReady]);

  const shown = input.length === 0 ? [] : placed;
  const largest = shown[0]?.size ?? 1;
  const hoveredWord = onHide ? shown.find((w) => w.key === hovered) : undefined;
  return (
    <div
      ref={ref}
      className="cloud"
      onMouseLeave={() => {
        setHovered(null);
      }}
    >
      <svg width={size.w} height={size.h} aria-hidden="true">
        {shown.map((w) => (
          <text
            key={w.key}
            className="cloud-word"
            textAnchor="middle"
            style={{
              transform: `translate(${w.x}px, ${w.y}px)`,
              fontSize: w.size,
              fill: w.rank === 0 ? 'var(--accent)' : 'var(--heading)',
              opacity: w.rank === 0 ? 1 : 0.6 + 0.4 * (w.size / largest),
            }}
            onMouseEnter={() => {
              setHovered(w.key);
            }}
          >
            {w.text}
          </text>
        ))}
      </svg>
      {/* Screen readers get the words as a plain list. */}
      <ul className="sr-only">
        {shown.map((w) => (
          <li key={w.key}>{w.text}</li>
        ))}
      </ul>
      {hoveredWord && onHide ? (
        <button
          type="button"
          className="hide-btn visible"
          style={{ left: hoveredWord.x, top: Math.max(0, hoveredWord.y - hoveredWord.size * 1.1) }}
          onClick={() => {
            onHide(hoveredWord.key);
            setHovered(null);
          }}
        >
          <EyeOffIcon />
          {hideLabel}
        </button>
      ) : null}
    </div>
  );
}
