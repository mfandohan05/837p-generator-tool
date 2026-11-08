import { useMemo, useState } from 'react';
import { parseAck999 } from '../../parsers/ack999Parser';
import { card, cardTitle, monoTextarea } from '../../styles/ui';

export function Ack999Viewer() {
  const [raw, setRaw] = useState('');

  const result = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      return { ok: true as const, data: parseAck999(raw) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [raw]);

  return (
    <div className={card}>
      <h3 className={cardTitle}>999 Acknowledgment Viewer</h3>
      <textarea
        className={`${monoTextarea} h-32`}
        placeholder="Paste a raw 999 response here..."
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {result?.ok === false && <p className="text-sm text-google-red-600">Could not parse: {result.error}</p>}
      {result?.ok && (
        <div className="space-y-2 rounded-lg bg-google-gray-50 p-3">
          {result.data.functionalGroups.length === 0 && (
            <p className="text-sm text-google-gray-500">No functional group acknowledgment (AK9) found in the pasted text.</p>
          )}
          {result.data.summaryLines.map((line, i) => (
            <p
              key={i}
              className={`font-mono text-xs whitespace-pre ${
                line.includes('Accepted, but')
                  ? 'text-google-amber-700'
                  : line.includes('Rejected')
                    ? 'text-google-red-600'
                    : line.includes('Accepted')
                      ? 'text-google-green-600'
                      : 'text-google-gray-700'
              }`}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
