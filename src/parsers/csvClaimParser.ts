import type { Claim, ClaimFilingIndicator, CodeSet, DiagnosisCode, ServiceLine } from '../types/domain';

// ---------------------------------------------------------------------------
// CSV schema
//
// One row = one service line. Rows sharing the same claim_id are grouped
// into a single Claim; claim/patient/provider columns are read from the
// FIRST row seen for a given claim_id and ignored on subsequent rows for
// that claim (fill them in on every row anyway - most spreadsheet tools
// make that easy via fill-down, and it keeps the row self-describing).
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
  'claim_id',
  'payer_name',
  'payer_id',
  'date_of_service',
  'claim_filing_indicator',
  'claim_prior_auth_number',
  'demonstration_project_milestone',
  'diagnosis_codes',
  'subscriber_id',
  'patient_first_name',
  'patient_last_name',
  'patient_dob',
  'patient_gender',
  'patient_address_line1',
  'patient_city',
  'patient_state',
  'patient_zip',
  'billing_npi',
  'billing_taxonomy',
  'billing_name',
  'billing_address_line1',
  'billing_address_line2',
  'billing_city',
  'billing_state',
  'billing_zip',
  'billing_tax_id',
  'billing_tax_id_is_ssn',
  'referring_npi',
  'referring_taxonomy',
  'referring_last_name',
  'referring_first_name',
  'rendering_npi',
  'rendering_taxonomy',
  'rendering_last_name',
  'rendering_first_name',
  'procedure_code',
  'product_service_id_qualifier',
  'charge_amount',
  'units',
  'line_date_of_service',
  'line_prior_auth_number',
  'local_code',
  'diagnosis_pointers',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

const REQUIRED_COLUMNS: CsvColumn[] = [
  'claim_id',
  'payer_name',
  'payer_id',
  'date_of_service',
  'diagnosis_codes',
  'subscriber_id',
  'patient_first_name',
  'patient_last_name',
  'patient_dob',
  'patient_gender',
  'patient_address_line1',
  'patient_city',
  'patient_state',
  'patient_zip',
  'billing_npi',
  'billing_taxonomy',
  'billing_name',
  'billing_address_line1',
  'billing_city',
  'billing_state',
  'billing_zip',
  'billing_tax_id',
  'procedure_code',
  'charge_amount',
  'units',
];

export interface CsvError {
  /** 1-based row number as it appears in the file (header is row 1). */
  row: number;
  message: string;
}

export interface CsvParseResult {
  claims: Claim[];
  errors: CsvError[];
}

/** Parses one CSV line into fields, honoring double-quoted fields containing commas or escaped quotes (""). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function parseDiagnosisCodesCell(cell: string): { codes: DiagnosisCode[]; error?: string } {
  const entries = cell
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    return { codes: [], error: 'diagnosis_codes must have at least one "CODE:ICD9|ICD10" entry' };
  }
  const codes: DiagnosisCode[] = [];
  for (const entry of entries) {
    const [code, codeSetRaw] = entry.split(':').map((s) => s?.trim());
    const codeSet = codeSetRaw?.toUpperCase();
    if (!code || (codeSet !== 'ICD9' && codeSet !== 'ICD10')) {
      return { codes: [], error: `invalid diagnosis_codes entry "${entry}" - expected "CODE:ICD9" or "CODE:ICD10"` };
    }
    codes.push({ code, codeSet: codeSet as CodeSet });
  }
  return { codes };
}

function parseDiagnosisPointers(cell: string): number[] {
  const pointers = cell
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return pointers.length > 0 ? pointers : [1];
}

function parseBool(cell: string): boolean | undefined {
  const v = cell.trim().toLowerCase();
  if (v === 'true' || v === 'yes' || v === '1') return true;
  return undefined;
}

/**
 * Parses CSV text (see CSV_COLUMNS for the schema) into a list of Claims,
 * grouping rows by claim_id into multi-line claims. Never throws - row-level
 * problems are collected into `errors` and that row's claim/line is skipped,
 * so one bad row doesn't block the rest of the batch.
 */
export function parseClaimsCsv(csvText: string): CsvParseResult {
  const errors: CsvError[] = [];
  const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { claims: [], errors: [{ row: 1, message: 'CSV is empty' }] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().replace(/\s*\*$/, '').toLowerCase());
  const colIndex = new Map<string, number>(header.map((h, i) => [h, i]));

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !colIndex.has(c));
  if (missingColumns.length > 0) {
    errors.push({ row: 1, message: `Missing required column(s): ${missingColumns.join(', ')}` });
    return { claims: [], errors };
  }

  const get = (fields: string[], col: CsvColumn): string => {
    const idx = colIndex.get(col);
    return idx === undefined ? '' : (fields[idx] ?? '').trim();
  };

  const claimsById = new Map<string, Claim>();
  const claimOrder: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = i + 1; // 1-based, header is row 1
    const fields = parseCsvLine(lines[i]);

    const claimId = get(fields, 'claim_id');
    if (!claimId) {
      errors.push({ row, message: 'claim_id is required' });
      continue;
    }

    let claim = claimsById.get(claimId);
    if (!claim) {
      const missingFields = REQUIRED_COLUMNS.filter((c) => c !== 'claim_id' && c !== 'procedure_code' && c !== 'charge_amount' && c !== 'units' && !get(fields, c));
      if (missingFields.length > 0) {
        errors.push({ row, message: `Claim "${claimId}" is missing required field(s): ${missingFields.join(', ')}` });
        continue;
      }

      const diagnosis = parseDiagnosisCodesCell(get(fields, 'diagnosis_codes'));
      if (diagnosis.error) {
        errors.push({ row, message: `Claim "${claimId}": ${diagnosis.error}` });
        continue;
      }

      const gender = get(fields, 'patient_gender').toUpperCase();
      if (gender !== 'M' && gender !== 'F') {
        errors.push({ row, message: `Claim "${claimId}": patient_gender must be "M" or "F"` });
        continue;
      }

      const referringNpi = get(fields, 'referring_npi');
      const referringLastName = get(fields, 'referring_last_name');
      const renderingNpi = get(fields, 'rendering_npi');
      const renderingLastName = get(fields, 'rendering_last_name');

      claim = {
        claimId,
        payerName: get(fields, 'payer_name'),
        payerId: get(fields, 'payer_id'),
        dateOfService: get(fields, 'date_of_service'),
        claimFilingIndicator: (get(fields, 'claim_filing_indicator') || undefined) as ClaimFilingIndicator | undefined,
        priorAuthorizationNumber: get(fields, 'claim_prior_auth_number') || undefined,
        demonstrationProjectMilestone: get(fields, 'demonstration_project_milestone') || undefined,
        diagnosisCodes: diagnosis.codes,
        patient: {
          subscriberId: get(fields, 'subscriber_id'),
          firstName: get(fields, 'patient_first_name'),
          lastName: get(fields, 'patient_last_name'),
          dob: get(fields, 'patient_dob'),
          gender: gender as 'M' | 'F',
          address: {
            line1: get(fields, 'patient_address_line1'),
            city: get(fields, 'patient_city'),
            state: get(fields, 'patient_state'),
            zip: get(fields, 'patient_zip'),
          },
        },
        billingProvider: {
          npi: get(fields, 'billing_npi'),
          taxonomyCode: get(fields, 'billing_taxonomy'),
          name: get(fields, 'billing_name'),
          address: {
            line1: get(fields, 'billing_address_line1'),
            line2: get(fields, 'billing_address_line2') || undefined,
            city: get(fields, 'billing_city'),
            state: get(fields, 'billing_state'),
            zip: get(fields, 'billing_zip'),
          },
          taxId: get(fields, 'billing_tax_id'),
          taxIdIsSSN: parseBool(get(fields, 'billing_tax_id_is_ssn')),
        },
        referringProvider:
          referringNpi || referringLastName
            ? {
                npi: referringNpi,
                taxonomyCode: get(fields, 'referring_taxonomy'),
                name: referringLastName,
                firstName: get(fields, 'referring_first_name') || undefined,
              }
            : undefined,
        renderingProvider:
          renderingNpi || renderingLastName
            ? {
                npi: renderingNpi,
                taxonomyCode: get(fields, 'rendering_taxonomy'),
                name: renderingLastName,
                firstName: get(fields, 'rendering_first_name') || undefined,
              }
            : undefined,
        serviceLines: [],
      };
      claimsById.set(claimId, claim);
      claimOrder.push(claimId);
    }

    const procedureCode = get(fields, 'procedure_code');
    const chargeAmount = Number(get(fields, 'charge_amount'));
    const units = Number(get(fields, 'units'));

    if (!procedureCode) {
      errors.push({ row, message: `Claim "${claimId}": procedure_code is required` });
      continue;
    }
    if (!Number.isFinite(chargeAmount)) {
      errors.push({ row, message: `Claim "${claimId}": charge_amount "${get(fields, 'charge_amount')}" is not a number` });
      continue;
    }
    if (!Number.isFinite(units)) {
      errors.push({ row, message: `Claim "${claimId}": units "${get(fields, 'units')}" is not a number` });
      continue;
    }

    const line: ServiceLine = {
      procedureCode,
      productServiceIdQualifier: get(fields, 'product_service_id_qualifier') || 'HC',
      chargeAmount,
      units,
      dateOfService: get(fields, 'line_date_of_service') || undefined,
      priorAuthNumber: get(fields, 'line_prior_auth_number') || undefined,
      localCode: get(fields, 'local_code') || undefined,
      diagnosisPointers: parseDiagnosisPointers(get(fields, 'diagnosis_pointers') || '1'),
    };
    claim.serviceLines.push(line);
  }

  const claims = claimOrder
    .map((id) => claimsById.get(id)!)
    .filter((claim) => {
      if (claim.serviceLines.length === 0) {
        errors.push({ row: 1, message: `Claim "${claim.claimId}" has no valid service lines and was skipped` });
        return false;
      }
      return true;
    });

  return { claims, errors };
}

/** Defaults pre-filled in the downloadable template (MDC Global Care Solutions LLC / NCTracks). */
const TEMPLATE_DEFAULTS: Partial<Record<CsvColumn, string>> = {
  payer_name: 'NCTracks',
  payer_id: 'NCTracks',
  billing_npi: '1558197707',
  billing_taxonomy: '253Z00000X',
  billing_name: 'MDC Global Care Solutions LLC',
  billing_address_line1: '179 Gasoline Alley',
  billing_address_line2: 'Suite 203',
  billing_city: 'Mooresville',
  billing_state: 'NC',
  billing_zip: '281176539',
  billing_tax_id: '853564339',
};

/**
 * A downloadable starter CSV: header (required columns marked with *) plus one
 * row with only the MDC defaults filled in; everything else is blank.
 * The parser ignores the trailing * on header names.
 */
export function generateCsvTemplate(): string {
  const header = CSV_COLUMNS.map((c) => (REQUIRED_COLUMNS.includes(c) ? `${c} *` : c)).join(',');
  const row = CSV_COLUMNS.map((c) => TEMPLATE_DEFAULTS[c] ?? '').join(',');
  return [header, row].join('\n');
}
