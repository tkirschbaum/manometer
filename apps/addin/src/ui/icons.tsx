import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const CrossIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" />
  </Svg>
);
export const GripIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="6" r="1" fill="currentColor" />
    <circle cx="15" cy="6" r="1" fill="currentColor" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <circle cx="9" cy="18" r="1" fill="currentColor" />
    <circle cx="15" cy="18" r="1" fill="currentColor" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18M10.6 5.1A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.8M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.5 7 9.5 7a9.7 9.7 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
);
export const PersonIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
  </Svg>
);
export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

/** Slide kind icons (simple line drawings, no clip-art, §11.6). */
export function KindIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  switch (kind) {
    case 'multiple_choice':
      return (
        <Svg size={size}>
          <path d="M4 6h10M4 12h16M4 18h7" strokeWidth={3} />
        </Svg>
      );
    case 'word_cloud':
      return (
        <Svg size={size}>
          <path d="M3 9h6M11 9h10M5 14h12M8 19h8M7 4h9" />
        </Svg>
      );
    case 'open_text':
      return (
        <Svg size={size}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M7 9h10M7 13h6M8 17l-2 4" />
        </Svg>
      );
    case 'scale':
      return (
        <Svg size={size}>
          <path d="M3 15h18M5 12v6M12 12v6M19 12v6" />
          <circle cx="15" cy="7" r="2.2" fill="currentColor" />
        </Svg>
      );
    case 'quiz':
      return (
        <Svg size={size}>
          <path d="M6 3.5L10 10H2z" fill="currentColor" stroke="none" />
          <rect x="14" y="3" width="7" height="7" fill="currentColor" stroke="none" />
          <circle cx="6" cy="17.5" r="3.5" fill="currentColor" stroke="none" />
          <path d="M17.5 13.5l3.5 4-3.5 4-3.5-4z" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'leaderboard':
      return (
        <Svg size={size}>
          <path d="M4 20V13h5v7M9 20V7h6v13M15 20v-5h5v5" />
        </Svg>
      );
    default:
      return (
        <Svg size={size}>
          <path d="M4 5h16v10H9l-5 4z" />
          <path d="M9 9h6" />
        </Svg>
      );
  }
}
