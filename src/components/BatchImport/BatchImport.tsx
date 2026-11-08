import { useMemo, useRef, useState } from 'react';
import { generateCsvTemplate, parseClaimsCsv } from '../../parsers/csvClaimParser';
import { validateClaim } from '../../validators/ncTracksRules';
import { buildBatchTransaction } from '../../builders/claimBuilder';
import { writeSegments } from '../../serializers/segmentWriter';
import { useSubmitterStore } from '../../store/submitterStore';
import {
  card,
  cardTitleRow,
  cardTitleText,
  dangerTextButton,
  monoTextarea,
  primaryButton,
  statusPillError,
  statusPillSuccess,
  textButton,
} from '../../styles/ui';

const controlNumbers = {
  interchangeControlNumber: '000000001',
  groupControlNumber: '1',
  transactionControlNumber: '0001',
};

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BatchImport() {
  const submitter = useSubmitterStore((s) => s.submitter);
  const [csvText, setCsvText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { claims, errors: parseErrors } = useMemo(() => (csvText.trim() ? parseClaimsCsv(csvText) : { claims: [], errors: [] }), [csvText]);

  const claimValidation = useMemo(
    () => claims.map((claim) => ({ claim, errors: validateClaim(claim, submitter) })),
    [claims, submitter],
  );

  const totalValidationErrors = claimValidation.reduce((sum, c) => sum + c.errors.length, 0);
  const canDownload = claims.length > 0 && parseErrors.length === 0 && totalValidationErrors === 0;

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const downloadTemplate = () => downloadText('837p-batch-template.csv', generateCsvTemplate(), 'text/csv');

  const downloadBatch = () => {
    const segments = buildBatchTransaction(claims, submitter, controlNumbers, new Date());
    const raw = writeSegments(segments, { addLineBreaks: true });
    downloadText('batch.edi', raw, 'text/plain');
  };

  return (
    <div className={card}>
      <div className={cardTitleRow}>
        <h3 className={cardTitleText}>Batch Import (CSV)</h3>
        <button type="button" className={textButton} onClick={downloadTemplate}>
          Download CSV template
        </button>
      </div>
      <p className="text-xs text-google-gray-600">
        One row per service line; rows sharing the same{' '}
        <code className="rounded bg-google-gray-100 px-1 py-0.5 font-mono text-[11px]">claim_id</code> become one
        claim with multiple lines. Upload a file or paste CSV text below. Envelope/submitter settings above apply to
        the whole batch.
      </p>

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="text-xs text-google-gray-700 file:mr-3 file:rounded-full file:border-0 file:bg-google-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-google-blue-700 hover:file:bg-google-blue-100"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {csvText && (
          <button
            type="button"
            className={dangerTextButton}
            onClick={() => {
              setCsvText('');
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            Clear
          </button>
        )}
      </div>

      <textarea
        className={`${monoTextarea} h-32`}
        placeholder="Or paste CSV text here..."
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
      />

      {csvText.trim() && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={parseErrors.length === 0 ? statusPillSuccess : statusPillError}>
              {claims.length} claim{claims.length === 1 ? '' : 's'} parsed
            </span>
            {parseErrors.length > 0 && (
              <span className={statusPillError}>
                {parseErrors.length} row error{parseErrors.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {parseErrors.length > 0 && (
            <ul className="rounded-lg bg-google-red-50 p-3 text-xs text-google-red-600 list-disc list-inside space-y-0.5">
              {parseErrors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}

          {claimValidation.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-google-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-google-gray-50 text-left text-xs font-medium text-google-gray-600">
                    <th className="px-3 py-2">Claim ID</th>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">Lines</th>
                    <th className="px-3 py-2">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {claimValidation.map(({ claim, errors }) => (
                    <tr key={claim.claimId} className="border-t border-google-gray-100">
                      <td className="px-3 py-2 text-google-gray-800">{claim.claimId}</td>
                      <td className="px-3 py-2 text-google-gray-800">
                        {claim.patient.firstName} {claim.patient.lastName}
                      </td>
                      <td className="px-3 py-2 text-google-gray-800">{claim.serviceLines.length}</td>
                      <td className="px-3 py-2">
                        {errors.length === 0 ? (
                          <span className={statusPillSuccess}>✓ Passes</span>
                        ) : (
                          <span className={statusPillError} title={errors.map((e) => e.message).join('\n')}>
                            ✗ {errors.length} issue{errors.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button type="button" className={primaryButton} disabled={!canDownload} onClick={downloadBatch}>
            Download batch .edi ({claims.length} claim{claims.length === 1 ? '' : 's'})
          </button>
        </div>
      )}
    </div>
  );
}
