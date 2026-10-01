import QRCode from 'qrcode';
import { useMemo } from 'react';

/** QR code as a single SVG path (no innerHTML, §9). Rendered from data in the file, so it works offline. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const qr = useMemo(() => {
    const code = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = code.modules.size;
    let d = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (code.modules.data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { d, size };
  }, [text]);
  return (
    <svg viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path d={qr.d} fill="#1a1f2b" />
    </svg>
  );
}
