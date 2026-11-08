import type { Segment } from '../types/segments';

export const ELEMENT_SEPARATOR = '*';
export const SEGMENT_TERMINATOR = '~';

export interface WriteOptions {
  /** Append \r\n after each segment terminator, for human readability. Default false. */
  addLineBreaks?: boolean;
}

/**
 * Trims trailing empty elements from a segment (per X12 convention) without
 * touching empty elements in the middle, which are positional placeholders
 * and must be preserved.
 */
function trimTrailingEmpty(elements: string[]): string[] {
  let end = elements.length;
  while (end > 0 && elements[end - 1] === '') {
    end -= 1;
  }
  return elements.slice(0, end);
}

export function writeSegment(segment: Segment): string {
  const trimmed = trimTrailingEmpty(segment.elements);
  return [segment.id, ...trimmed].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR;
}

export function writeSegments(segments: Segment[], options: WriteOptions = {}): string {
  const lineEnding = options.addLineBreaks ? '\r\n' : '';
  return segments.map((s) => writeSegment(s) + lineEnding).join('');
}
