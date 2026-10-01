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

/** Deterministic random so the same words give the same layout (stable cloud, §6.7). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Word cloud (§6.7): d3-cloud layout, re-laid out at most every 1.5 s, sizes by sqrt(frequency),
 * navy at varying weight with the single most frequent word in the accent colour.
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
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [input, setInput] = useState<Word[]>(words);
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
    if (size.w < 10 || size.h < 10 || input.length === 0) return;
    const max = Math.max(...input.map((w) => w.count));
    const minFont = size.h * 0.06;
    const maxFont = Math.min(size.h * 0.24, size.w * 0.12);
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
      .padding(Math.max(2, size.h * 0.012))
      .rotate(0)
      .font("'Source Sans 3', 'Segoe UI', sans-serif")
      .fontWeight(600)
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
  }, [input, size.w, size.h]);

  const shown = input.length === 0 ? [] : placed;
  return (
    <div ref={ref} className="cloud">
      {shown.map((w) => (
        <span
          key={w.key}
          className="cloud-word hideable"
          style={{
            left: w.x,
            top: w.y,
            fontSize: w.size,
            color: w.rank === 0 ? 'var(--accent)' : 'var(--heading)',
            opacity: w.rank === 0 ? 1 : 0.55 + 0.45 * (w.size / (placed[0]?.size ?? w.size)),
          }}
        >
          {w.text}
          {onHide ? (
            <button
              type="button"
              className="hide-btn"
              onClick={() => {
                onHide(w.key);
              }}
            >
              <EyeOffIcon />
              {hideLabel}
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}
