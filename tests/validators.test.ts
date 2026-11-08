import { describe, expect, it } from 'vitest';
import {
  validateAtypicalProvider,
  validateBHT06,
  validateBillingProviderTaxId,
  validateBillingProviderTaxonomy,
  validateBillingProviderZip,
  validateClaimFilingIndicator,
  validateCobPayerPaidAmount,
  validateDemonstrationProjectIdentifier,
  validateDiagnosisCodes,
  validateDmeBundle,
  validateEnvelope,
  validateReferringProviderIsPerson,
  validateSubscriberId,
} from '../src/validators/ncTracksRules';
import { dmeClaim, dmeClaimMissingPA, referringProviderClaim, referringProviderOrgClaim, sampleSubmitter, simpleClaim } from '../src/fixtures/sampleClaims';

describe('Rule 1: ISA/GS envelope', () => {
  it('passes with a valid 4-digit submitter ID and explicit mode', () => {
    expect(validateEnvelope(sampleSubmitter)).toEqual([]);
  });

  it('fails when the submitter ID is not 4 digits', () => {
    const errors = validateEnvelope({ ...sampleSubmitter, submitterId: '12' });
    expect(errors.some((e) => e.ruleId === 'envelope-submitter-id')).toBe(true);
  });
});

describe('Rule 2: BHT06', () => {
  it('passes for "CH" (fee-for-service)', () => {
    expect(validateBHT06('CH')).toEqual([]);
  });

  it('rejects "RP" (reporting) explicitly', () => {
    const errors = validateBHT06('RP');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('bht06-reporting-rejected');
  });
});

describe('Rule 3: Billing provider taxonomy required', () => {
  it('passes when PRV03 is present', () => {
    expect(validateBillingProviderTaxonomy({ npi: '1234567893', taxonomyCode: '103T00000X', name: 'Acme' })).toEqual([]);
  });

  it('fails when taxonomy code is missing', () => {
    const errors = validateBillingProviderTaxonomy({ npi: '1234567893', taxonomyCode: '', name: 'Acme' });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('billing-provider-taxonomy-required');
  });
});

describe('Rule 4: Subscriber ID format', () => {
  it('passes for 10 digits ending in an alpha character', () => {
    expect(validateSubscriberId('123456789A')).toEqual([]);
  });

  it('fails for an all-numeric ID', () => {
    const errors = validateSubscriberId('1234567890');
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('subscriber-id-format');
  });
});

describe('Rule 5: Diagnosis code consistency', () => {
  it('passes with consistent ICD-10 codes on/after the cutover date', () => {
    const errors = validateDiagnosisCodes({
      diagnosisCodes: [{ code: 'F41.1', codeSet: 'ICD10' }],
      dateOfService: '2024-03-15',
    });
    expect(errors).toEqual([]);
  });

  it('fails when a claim mixes ICD-9 and ICD-10 codes', () => {
    const errors = validateDiagnosisCodes({
      diagnosisCodes: [
        { code: 'F41.1', codeSet: 'ICD10' },
        { code: '300.00', codeSet: 'ICD9' },
      ],
      dateOfService: '2024-03-15',
    });
    expect(errors.some((e) => e.ruleId === 'diagnosis-mixed-code-sets')).toBe(true);
  });

  it('fails ICD-9 codes for dates of service on/after 2015-10-01', () => {
    const errors = validateDiagnosisCodes({
      diagnosisCodes: [{ code: '300.00', codeSet: 'ICD9' }],
      dateOfService: '2016-01-01',
    });
    expect(errors.some((e) => e.ruleId === 'diagnosis-icd9-after-cutover')).toBe(true);
  });

  it('fails ICD-10 codes for dates of service before 2015-10-01', () => {
    const errors = validateDiagnosisCodes({
      diagnosisCodes: [{ code: 'F41.1', codeSet: 'ICD10' }],
      dateOfService: '2014-01-01',
    });
    expect(errors.some((e) => e.ruleId === 'diagnosis-icd10-before-cutover')).toBe(true);
  });
});

describe('Rule 6: Referring/ordering provider must be a person', () => {
  it('passes when the referring provider has a first and last name', () => {
    expect(validateReferringProviderIsPerson(referringProviderClaim.referringProvider)).toEqual([]);
  });

  it('fails when the referring provider looks like an organization', () => {
    const errors = validateReferringProviderIsPerson(referringProviderOrgClaim.referringProvider);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('referring-provider-must-be-person');
  });
});

describe('Rule 7: DME procedure code bundle', () => {
  it('passes when PA number and local code are both present', () => {
    expect(validateDmeBundle(dmeClaim)).toEqual([]);
  });

  it('fails when the PA number is missing for a DME code', () => {
    const errors = validateDmeBundle(dmeClaimMissingPA);
    expect(errors.some((e) => e.ruleId === 'dme-prior-auth-required')).toBe(true);
  });
});

describe('Rule 8: Atypical provider (no NPI)', () => {
  it('passes when an atypical ID is supplied in place of an NPI', () => {
    expect(validateAtypicalProvider({ npi: '', taxonomyCode: '103T00000X', name: 'Acme', atypicalId: 'ATYP001' })).toEqual([]);
  });

  it('fails when neither an NPI nor an atypical ID is supplied', () => {
    const errors = validateAtypicalProvider({ npi: '', taxonomyCode: '103T00000X', name: 'Acme' });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('atypical-provider-id-required');
  });
});

describe('Rule 9: Claim filing indicator', () => {
  it('passes for a valid Medicare indicator', () => {
    expect(validateClaimFilingIndicator('MB', true)).toEqual([]);
  });

  it('fails for an invalid Medicare indicator', () => {
    const errors = validateClaimFilingIndicator('CI', true);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('claim-filing-indicator-medicare');
  });

  it('does not apply when the claim is not Medicare', () => {
    expect(validateClaimFilingIndicator(undefined, false)).toEqual([]);
  });
});

describe('Rule 10: COB payer paid amount', () => {
  it('accepts $0 as a valid, expected value', () => {
    expect(validateCobPayerPaidAmount(0)).toEqual([]);
  });

  it('fails when the amount is missing entirely', () => {
    const errors = validateCobPayerPaidAmount(undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('cob-payer-paid-amount-required');
  });
});

describe('Rule 11: Demonstration Project Identifier (H2023)', () => {
  it('passes when H2023 is billed with a milestone code', () => {
    const errors = validateDemonstrationProjectIdentifier({
      serviceLines: [{ procedureCode: 'H2023', productServiceIdQualifier: 'HC', chargeAmount: 50, units: 1 }],
      demonstrationProjectMilestone: 'M1',
    });
    expect(errors).toEqual([]);
  });

  it('fails when H2023 is billed without a milestone code', () => {
    const errors = validateDemonstrationProjectIdentifier({
      serviceLines: [{ procedureCode: 'H2023', productServiceIdQualifier: 'HC', chargeAmount: 50, units: 1 }],
      demonstrationProjectMilestone: undefined,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('ips-milestone-required');
  });

  it('does not apply when H2023 is not billed', () => {
    const errors = validateDemonstrationProjectIdentifier({
      serviceLines: [{ procedureCode: '90837', productServiceIdQualifier: 'HC', chargeAmount: 50, units: 1 }],
      demonstrationProjectMilestone: undefined,
    });
    expect(errors).toEqual([]);
  });
});

describe('Rule 12: Billing provider Tax ID required', () => {
  it('passes with a 9-digit Tax ID', () => {
    expect(validateBillingProviderTaxId(simpleClaim.billingProvider)).toEqual([]);
  });

  it('fails when the Tax ID is missing', () => {
    const errors = validateBillingProviderTaxId({ taxId: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('billing-provider-tax-id-required');
  });

  it('fails when the Tax ID is not exactly 9 digits', () => {
    const errors = validateBillingProviderTaxId({ taxId: '12-3456789' });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('billing-provider-tax-id-required');
  });
});

describe('Rule 13: Billing provider ZIP+4', () => {
  it('passes with a 9-digit ZIP', () => {
    expect(validateBillingProviderZip(simpleClaim.billingProvider)).toEqual([]);
  });

  it('fails with a 5-digit ZIP', () => {
    const errors = validateBillingProviderZip({ address: { line1: '', city: '', state: '', zip: '27601' } });
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('billing-provider-zip-plus-4-required');
  });

  it('accepts a ZIP+4 written with a dash', () => {
    const errors = validateBillingProviderZip({ address: { line1: '', city: '', state: '', zip: '27601-1234' } });
    expect(errors).toEqual([]);
  });
});
