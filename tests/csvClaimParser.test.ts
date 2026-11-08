import { describe, expect, it } from 'vitest';
import { generateCsvTemplate, parseClaimsCsv } from '../src/parsers/csvClaimParser';

describe('parseClaimsCsv', () => {
  it('parses the generated template into two claims, the second with two service lines', () => {
    const csv = generateCsvTemplate();
    const { claims, errors } = parseClaimsCsv(csv);

    expect(errors).toEqual([]);
    expect(claims).toHaveLength(2);

    const [first, second] = claims;
    expect(first.claimId).toBe('CLAIM0001');
    expect(first.serviceLines).toHaveLength(1);
    expect(first.diagnosisCodes).toEqual([{ code: 'F41.1', codeSet: 'ICD10' }]);

    expect(second.claimId).toBe('CLAIM0002');
    expect(second.serviceLines).toHaveLength(2);
    expect(second.diagnosisCodes).toEqual([
      { code: 'M54.5', codeSet: 'ICD10' },
      { code: 'R51.9', codeSet: 'ICD10' },
    ]);
    expect(second.serviceLines[0].diagnosisPointers).toEqual([1]);
    expect(second.serviceLines[1].diagnosisPointers).toEqual([2]);
  });

  it('groups multiple rows with the same claim_id into one claim', () => {
    const csv = generateCsvTemplate();
    const { claims } = parseClaimsCsv(csv);
    const claimIds = claims.map((c) => c.claimId);
    expect(new Set(claimIds).size).toBe(claimIds.length);
  });

  it('reports a missing-column error and returns no claims when the header is malformed', () => {
    const { claims, errors } = parseClaimsCsv('claim_id,payer_name\nCLAIM0001,NCTracks');
    expect(claims).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Missing required column/);
  });

  it('skips a row missing claim_id and reports it, without blocking other rows', () => {
    const lines = generateCsvTemplate().split('\n');
    const header = lines[0];
    const rows = lines.slice(1);
    // Blank out the claim_id on the first data row.
    const brokenRow = rows[0].replace(/^CLAIM0001/, '');
    const csv = [header, brokenRow, ...rows.slice(1)].join('\n');

    const { claims, errors } = parseClaimsCsv(csv);
    expect(errors.some((e) => e.message === 'claim_id is required')).toBe(true);
    expect(claims.some((c) => c.claimId === 'CLAIM0002')).toBe(true);
  });

  it('reports an invalid diagnosis_codes entry', () => {
    const lines = generateCsvTemplate().split('\n');
    const header = lines[0];
    const brokenRow = lines[1].replace('F41.1:ICD10', 'F41.1-NOTASET');
    const csv = [header, brokenRow].join('\n');

    const { claims, errors } = parseClaimsCsv(csv);
    expect(claims).toEqual([]);
    expect(errors.some((e) => e.message.includes('invalid diagnosis_codes entry'))).toBe(true);
  });

  it('reports a non-numeric charge_amount', () => {
    const lines = generateCsvTemplate().split('\n');
    const header = lines[0];
    const brokenRow = lines[1].replace(',150,', ',not-a-number,');
    const csv = [header, brokenRow].join('\n');

    const { claims, errors } = parseClaimsCsv(csv);
    expect(claims).toEqual([]);
    expect(errors.some((e) => e.message.includes('is not a number'))).toBe(true);
  });

  it('defaults product_service_id_qualifier to "HC" and diagnosis_pointers to [1] when blank', () => {
    const csv = generateCsvTemplate();
    const { claims } = parseClaimsCsv(csv);
    expect(claims[0].serviceLines[0].productServiceIdQualifier).toBe('HC');
    expect(claims[0].serviceLines[0].diagnosisPointers).toEqual([1]);
  });
});
