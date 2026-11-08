import { describe, expect, it } from 'vitest';
import { writeSegment, writeSegments } from '../src/serializers/segmentWriter';
import type { Segment } from '../src/types/segments';

describe('segmentWriter', () => {
  it('joins elements with * and terminates with ~', () => {
    const segment: Segment = { id: 'NM1', elements: ['85', '2', 'Acme Health'] };
    expect(writeSegment(segment)).toBe('NM1*85*2*Acme Health~');
  });

  it('trims trailing empty elements', () => {
    const segment: Segment = { id: 'N3', elements: ['123 Main St', ''] };
    expect(writeSegment(segment)).toBe('N3*123 Main St~');
  });

  it('preserves empty elements in the middle of a segment', () => {
    const segment: Segment = { id: 'NM1', elements: ['85', '2', 'Acme Health', '', '', '', '', 'XX', '1234567893'] };
    expect(writeSegment(segment)).toBe('NM1*85*2*Acme Health*****XX*1234567893~');
  });

  it('drops all elements when every one is trailing-empty', () => {
    const segment: Segment = { id: 'SE', elements: [] };
    expect(writeSegment(segment)).toBe('SE~');
  });

  it('writeSegments concatenates without line breaks by default', () => {
    const segments: Segment[] = [
      { id: 'ISA', elements: ['00'] },
      { id: 'GS', elements: ['HC'] },
    ];
    expect(writeSegments(segments)).toBe('ISA*00~GS*HC~');
  });

  it('writeSegments can append CRLF after each segment for readability', () => {
    const segments: Segment[] = [
      { id: 'ISA', elements: ['00'] },
      { id: 'GS', elements: ['HC'] },
    ];
    expect(writeSegments(segments, { addLineBreaks: true })).toBe('ISA*00~\r\nGS*HC~\r\n');
  });

  it('never emits CR/LF as part of the segment terminator itself', () => {
    const segments: Segment[] = [{ id: 'IEA', elements: ['1', '000000001'] }];
    const output = writeSegments(segments);
    expect(output.endsWith('~')).toBe(true);
    expect(output).not.toMatch(/[\r\n]/);
  });
});
