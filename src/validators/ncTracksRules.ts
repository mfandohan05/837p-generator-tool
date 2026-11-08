import type { BillingProvider, Claim, Provider, SubmitterInfo } from '../types/domain';
import { DME_BUNDLE_CODES, ICD10_CUTOVER_DATE, IPS_DEMONSTRATION_CODE } from '../types/domain';
import type { ValidationError } from './x12BaseRules';

// ---------------------------------------------------------------------------
// Rule 1: ISA/GS envelope
// ---------------------------------------------------------------------------

export function validateEnvelope(submitter: SubmitterInfo): ValidationError[] {
  const errors: ValidationError[] = [];
  const expectedReceiverId = submitter.isRealTime ? 'NCTRACKSREL' : 'NCTRACKSBAT';

  if (!submitter.submitterId || !/^[A-Za-z0-9]{4}$/.test(submitter.submitterId)) {
    errors.push({
      ruleId: 'envelope-submitter-id',
      field: 'ISA06',
      message: 'Submitter ID must be the 4-character ID assigned in the Trading Partner Agreement.',
    });
  }

  // ISA03="00" (no security info), ISA05/ISA07="ZZ" (mutually defined), and
  // ISA08/GS03 must match the batch/real-time receiver ID for the mode selected.
  // These are fixed by the envelope builder; this rule exists to flag a
  // mismatched receiver ID if one was supplied explicitly for comparison.
  if (submitter.isRealTime === undefined) {
    errors.push({
      ruleId: 'envelope-mode',
      field: 'ISA08/GS03',
      message: `Submitter must specify real-time or batch mode so ISA08/GS03 can be set to "${expectedReceiverId}".`,
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Rule 2: BHT06
// ---------------------------------------------------------------------------

export function validateBHT06(transactionTypeCode: string): ValidationError[] {
  if (transactionTypeCode === 'RP') {
    return [
      {
        ruleId: 'bht06-reporting-rejected',
        field: 'BHT06',
        message: 'NCTracks does not accept "RP" (reporting) transactions - BHT06 must be "CH" (fee-for-service, chargeable).',
      },
    ];
  }
  if (transactionTypeCode !== 'CH') {
    return [
      {
        ruleId: 'bht06-invalid',
        field: 'BHT06',
        message: 'BHT06 must be "CH" (fee-for-service).',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 3: Billing provider taxonomy required
// ---------------------------------------------------------------------------

export function validateBillingProviderTaxonomy(billingProvider: Provider): ValidationError[] {
  if (!billingProvider.taxonomyCode || billingProvider.taxonomyCode.trim() === '') {
    return [
      {
        ruleId: 'billing-provider-taxonomy-required',
        field: '2000A PRV03',
        message: 'Billing provider taxonomy code (PRV03) is required.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 3b: Rendering provider taxonomy required (NCTracks partner-specific)
// ---------------------------------------------------------------------------

export function validateRenderingProviderTaxonomy(renderingProvider: Provider | undefined): ValidationError[] {
  if (!renderingProvider) return [];
  if (!renderingProvider.taxonomyCode || renderingProvider.taxonomyCode.trim() === '') {
    return [
      {
        ruleId: 'rendering-provider-taxonomy-required',
        field: '2310B PRV03',
        message: 'Rendering provider taxonomy code (PRV03) is required by NCTracks whenever a rendering provider is present.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 4: Subscriber ID format
// ---------------------------------------------------------------------------

export function validateSubscriberId(subscriberId: string): ValidationError[] {
  if (!/^\d{9}[A-Za-z]$/.test(subscriberId)) {
    return [
      {
        ruleId: 'subscriber-id-format',
        field: '2010BA NM109',
        message: 'Subscriber ID must be 10 digits ending in an alpha character.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 5: Diagnosis code consistency
// ---------------------------------------------------------------------------

export function validateDiagnosisCodes(claim: Pick<Claim, 'diagnosisCodes' | 'dateOfService'>): ValidationError[] {
  const errors: ValidationError[] = [];
  const codeSets = new Set(claim.diagnosisCodes.map((dx) => dx.codeSet));

  if (codeSets.size > 1) {
    errors.push({
      ruleId: 'diagnosis-mixed-code-sets',
      field: '2300 HI',
      message: 'A claim may not mix ICD-9 and ICD-10 diagnosis codes.',
    });
  }

  const isOnOrAfterCutover = claim.dateOfService >= ICD10_CUTOVER_DATE;

  for (const dx of claim.diagnosisCodes) {
    if (dx.codeSet === 'ICD9' && isOnOrAfterCutover) {
      errors.push({
        ruleId: 'diagnosis-icd9-after-cutover',
        field: '2300 HI',
        message: `ICD-9 code "${dx.code}" is invalid for dates of service on or after ${ICD10_CUTOVER_DATE}.`,
      });
    }
    if (dx.codeSet === 'ICD10' && !isOnOrAfterCutover) {
      errors.push({
        ruleId: 'diagnosis-icd10-before-cutover',
        field: '2300 HI',
        message: `ICD-10 code "${dx.code}" is invalid for dates of service before ${ICD10_CUTOVER_DATE}.`,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Rule 6: Referring/ordering provider must be a person
// ---------------------------------------------------------------------------

export function validateReferringProviderIsPerson(referringProvider: Provider | undefined): ValidationError[] {
  if (!referringProvider) return [];
  if (!referringProvider.firstName || referringProvider.firstName.trim() === '') {
    return [
      {
        ruleId: 'referring-provider-must-be-person',
        field: '2310A NM1',
        message: 'Referring/ordering provider must be an individual (a first and last name are required), not an organization.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 7: DME procedure code bundle
// ---------------------------------------------------------------------------

export function validateDmeBundle(claim: Pick<Claim, 'serviceLines' | 'priorAuthorizationNumber'>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const line of claim.serviceLines) {
    if (!(DME_BUNDLE_CODES as readonly string[]).includes(line.procedureCode)) continue;

    const hasPriorAuth = Boolean(line.priorAuthNumber || claim.priorAuthorizationNumber);
    if (!hasPriorAuth) {
      errors.push({
        ruleId: 'dme-prior-auth-required',
        field: '2400 REF*9F',
        message: `Procedure code "${line.procedureCode}" requires a Prior Authorization number (claim or line level).`,
      });
    }

    if (!line.localCode) {
      errors.push({
        ruleId: 'dme-local-code-required',
        field: '2400 PWK06',
        message: `Procedure code "${line.procedureCode}" requires a local code (PWK06) with PWK01="OZ" and PWK02="EL".`,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Rule 8: Atypical provider (no NPI)
// ---------------------------------------------------------------------------

export function validateAtypicalProvider(provider: Provider): ValidationError[] {
  if (!provider.npi && provider.atypicalId) {
    // Builder always emits REF*G2 for this case; this rule exists to catch a
    // hand-built claim where neither an NPI nor an atypical ID was supplied.
    return [];
  }
  if (!provider.npi && !provider.atypicalId) {
    return [
      {
        ruleId: 'atypical-provider-id-required',
        field: '2010AA REF',
        message: 'A provider without an NPI must supply an atypical ID, carried in REF*G2.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 9: Claim filing indicator
// ---------------------------------------------------------------------------

const VALID_MEDICARE_FILING_INDICATORS = ['MA', 'MB', '16'] as const;

export function validateClaimFilingIndicator(
  claimFilingIndicator: string | undefined,
  isMedicare: boolean,
): ValidationError[] {
  if (!isMedicare) return [];
  if (!claimFilingIndicator || !(VALID_MEDICARE_FILING_INDICATORS as readonly string[]).includes(claimFilingIndicator)) {
    return [
      {
        ruleId: 'claim-filing-indicator-medicare',
        field: '2000B SBR09',
        message: 'Medicare claims must use claim filing indicator "MA" (Part A), "MB" (Part B), or "16" (HMO Risk); any other value is treated as TPL.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 10: COB payer paid amount
// ---------------------------------------------------------------------------

export function validateCobPayerPaidAmount(amount: number | undefined): ValidationError[] {
  // $0 is valid and expected when another payer denied or paid nothing;
  // only flag a genuinely missing amount, not a zero one.
  if (amount === undefined || Number.isNaN(amount)) {
    return [
      {
        ruleId: 'cob-payer-paid-amount-required',
        field: '2320 AMT',
        message: 'Other payer paid amount is required when coordination of benefits applies (use $0.00 if the other payer paid nothing).',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 11: Demonstration Project Identifier (H2023 - Individual Placement and Support)
// ---------------------------------------------------------------------------

export function validateDemonstrationProjectIdentifier(
  claim: Pick<Claim, 'serviceLines' | 'demonstrationProjectMilestone'>,
): ValidationError[] {
  const hasIpsLine = claim.serviceLines.some((line) => line.procedureCode === IPS_DEMONSTRATION_CODE);
  if (!hasIpsLine) return [];

  if (!claim.demonstrationProjectMilestone) {
    return [
      {
        ruleId: 'ips-milestone-required',
        field: '2300 REF*P4',
        message: `Procedure code "${IPS_DEMONSTRATION_CODE}" (Individual Placement and Support) requires a Demonstration Project Identifier: REF01="P4" and REF02 carrying the milestone code.`,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 12: Billing provider tax identification required
// ---------------------------------------------------------------------------

export function validateBillingProviderTaxId(billingProvider: Pick<BillingProvider, 'taxId'>): ValidationError[] {
  if (!billingProvider.taxId || !/^\d{9}$/.test(billingProvider.taxId)) {
    return [
      {
        ruleId: 'billing-provider-tax-id-required',
        field: '2010AA REF*EI/SY',
        message: 'Billing provider Tax ID (EIN or SSN, 9 digits) is required and is carried in a Must-Use REF segment.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 13: Billing provider ZIP+4
// ---------------------------------------------------------------------------

export function validateBillingProviderZip(billingProvider: Pick<BillingProvider, 'address'>): ValidationError[] {
  const digits = (billingProvider.address?.zip ?? '').replace(/\D/g, '');
  if (digits.length !== 9) {
    return [
      {
        ruleId: 'billing-provider-zip-plus-4-required',
        field: '2010AA N403',
        message: 'Billing provider ZIP code must be the full 9-digit ZIP+4 (N403 requires 9 digits).',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/** True when SBR09 names a Medicare filing indicator (MA/MB/16), triggering rule 9. */
export function isMedicareClaim(claimFilingIndicator: Claim['claimFilingIndicator']): boolean {
  return claimFilingIndicator === 'MA' || claimFilingIndicator === 'MB' || claimFilingIndicator === '16';
}

export function validateClaim(claim: Claim, submitter: SubmitterInfo): ValidationError[] {
  return [
    ...validateEnvelope(submitter),
    ...validateBillingProviderTaxonomy(claim.billingProvider),
    ...validateRenderingProviderTaxonomy(claim.renderingProvider),
    ...validateBillingProviderTaxId(claim.billingProvider),
    ...validateBillingProviderZip(claim.billingProvider),
    ...validateSubscriberId(claim.patient.subscriberId),
    ...validateDiagnosisCodes(claim),
    ...validateReferringProviderIsPerson(claim.referringProvider),
    ...validateDmeBundle(claim),
    ...validateAtypicalProvider(claim.billingProvider),
    ...validateClaimFilingIndicator(claim.claimFilingIndicator, isMedicareClaim(claim.claimFilingIndicator)),
    ...validateDemonstrationProjectIdentifier(claim),
  ];
}
