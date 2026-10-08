import { TIMING } from '@pulse/shared';
import cloud from 'd3-cloud';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/** Scale and offset that fit the rendered words into the box (applied to the whole group). */
interface Fit {
  scale: number;
  x: number;
  y: number;
}

type Cloud = ReturnType<typeof cloud<CloudWord>>;

const FONT_FAMILY = "'Figtree', 'Segoe UI', sans-serif";
const FONT_WEIGHT = 700;
/** Palette colours by rank (amber is left out: too light for text on white). */
const TONES = [1, 2, 4, 5, 6];
/** Average glyph width of the font in em, used to keep a single long word narrower than the box. */
const EM_PER_CHAR = 0.6;
/** d3-cloud drops words that do not fit; the layout is retried this many times, 15 % smaller each time. */
const MAX_ATTEMPTS = 5;

/** Deterministic random so the same words give the same layout (stable cloud, §6.7). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Counts font loads: the layout waits for the stage font (d3-cloud measures on a canvas, a fallback font would
 * overlap) and is redone whenever another font finishes loading.
 */
function useFontVersion(): number {
  const [version, setVersion] = useState(() => (typeof document === 'undefined' || !('fonts' in document) ? 1 : 0));
  useEffect(() => {
    if (!('fonts' in document)) return;
    let cancelled = false;
    const bump = (): void => {
      if (!cancelled) setVersion((v) => v + 1);
    };
    document.fonts.load(`${String(FONT_WEIGHT)} 32px 'Figtree'`).then(bump, bump);
    // Never wait forever (offline without the font cached): lay out with whatever is there.
    const timer = setTimeout(() => {
      if (!cancelled) setVersion((v) => Math.max(v, 1));
    }, 1500);
    document.fonts.addEventListener('loadingdone', bump);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.fonts.removeEventListener('loadingdone', bump);
    };
  }, []);
  return version;
}

/**
 * Word cloud (§6.7): d3-cloud layout, re-laid out at most every 1.5 s, sizes by sqrt(frequency), palette colours by
 * rank. Rendered as SVG text because d3-cloud positions words by their baseline (x = centre, y = baseline).
 * The canvas measurement of d3-cloud and the rendered text can differ (fonts, web views), so after rendering the
 * real text boxes are measured and the whole cloud is scaled and centred to stay inside the slide.
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
  const group = useRef<SVGGElement>(null);
  const fontVersion = useFontVersion();
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [fit, setFit] = useState<Fit>({ scale: 1, x: 0, y: 0 });
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
    if (fontVersion === 0 || size.w < 10 || size.h < 10 || input.length === 0) return;
    const max = Math.max(...input.map((w) => w.count));
    let current: Cloud | null = null;
    const run = (attempt: number): void => {
      const shrink = 0.85 ** attempt;
      const minFont = size.h * 0.07 * shrink;
      const maxFont = Math.min(size.h * 0.22, size.w * 0.11) * shrink;
      const layout: Cloud = cloud<CloudWord>()
        .size([size.w, size.h])
        .words(
          input.map((w, rank) => ({
            key: w.key,
            text: w.text,
            rank,
            // A single long word must still fit across the box.
            size: Math.min(
              minFont + (maxFont - minFont) * Math.sqrt(w.count / max),
              (size.w * 0.92) / (Math.max(1, w.text.length) * EM_PER_CHAR),
            ),
          })),
        )
        .padding(Math.max(3, size.h * 0.016))
        .rotate(0)
        .font(FONT_FAMILY)
        .fontWeight(FONT_WEIGHT)
        .fontSize((d) => d.size)
        .random(seeded(7))
        .on('end', (out) => {
          if (out.length < input.length && attempt + 1 < MAX_ATTEMPTS) {
            run(attempt + 1);
            return;
          }
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
      current = layout;
      layout.start();
    };
    run(0);
    return () => {
      current?.stop();
    };
  }, [input, size.w, size.h, fontVersion]);

  const shown = useMemo(() => (input.length === 0 ? [] : placed), [input, placed]);

  // Measure the rendered words (their own boxes, independent of a running move transition) and fit the group.
  useLayoutEffect(() => {
    const g = group.current;
    if (!g || shown.length === 0 || size.w < 10) return;
    const texts = g.querySelectorAll('text');
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    shown.forEach((w, i) => {
      const text = texts[i];
      if (!text) return;
      const box = text.getBBox();
      x0 = Math.min(x0, w.x + box.x);
      y0 = Math.min(y0, w.y + box.y);
      x1 = Math.max(x1, w.x + box.x + box.width);
      y1 = Math.max(y1, w.y + box.y + box.height);
    });
    if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) return;
    const margin = Math.max(4, Math.min(size.w, size.h) * 0.02);
    const scale = Math.min(1, (size.w - 2 * margin) / (x1 - x0), (size.h - 2 * margin) / (y1 - y0));
    const next = {
      scale,
      x: size.w / 2 - ((x0 + x1) / 2) * scale,
      y: size.h / 2 - ((y0 + y1) / 2) * scale,
    };
    setFit((prev) =>
      Math.abs(prev.scale - next.scale) < 0.001 && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5
        ? prev
        : next,
    );
  }, [shown, size.w, size.h, fontVersion]);

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
        <g
          ref={group}
          className="cloud-group"
          style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, transformOrigin: '0 0' }}
        >
          {shown.map((w) => (
            <text
              key={w.key}
              className="cloud-word"
              textAnchor="middle"
              style={{
                transform: `translate(${w.x}px, ${w.y}px)`,
                fontSize: w.size,
                fill: `var(--c${String(TONES[w.rank % TONES.length] ?? 1)})`,
              }}
              onMouseEnter={() => {
                setHovered(w.key);
              }}
            >
              {w.text}
            </text>
          ))}
        </g>
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
          style={{
            left: fit.x + hoveredWord.x * fit.scale,
            top: Math.max(0, fit.y + (hoveredWord.y - hoveredWord.size * 1.1) * fit.scale),
          }}
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
