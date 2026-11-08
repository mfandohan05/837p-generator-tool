import type { Segment } from '../types/segments';

/**
 * Parses raw X12 text into a flat list of segments. Tolerant of the
 * segment terminator being followed by CR/LF (human-readable output) and of
 * a trailing terminator/whitespace at end of file.
 */
export function parseX12(raw: string): Segment[] {
  const withoutLineBreaks = raw.replace(/\r\n/g, '').replace(/\n/g, '');
  const segments = withoutLineBreaks
    .split('~')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return segments.map((segmentText) => {
    const [id, ...elements] = segmentText.split('*');
    return { id, elements };
  });
}
