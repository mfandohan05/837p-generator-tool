import type { Claim, SubmitterInfo } from '../types/domain';

export const sampleSubmitter: SubmitterInfo = {
  submitterId: '1234',
  submitterName: 'Acme Behavioral Health',
  contactName: 'Jane Smith',
  contactPhone: '9195551234',
  isRealTime: false,
};

/** 1. Simple claim - one diagnosis, one service line, no special cases. */
export const simpleClaim: Claim = {
  claimId: 'CLAIM0001',
  patient: {
    subscriberId: '123456789A',
    firstName: 'John',
    lastName: 'Doe',
    dob: '1980-05-15',
    gender: 'M',
    address: { line1: '123 Main St', city: 'Raleigh', state: 'NC', zip: '27601' },
  },
  billingProvider: {
    npi: '1234567893',
    taxonomyCode: '103T00000X',
    name: 'Acme Behavioral Health',
    address: { line1: '500 Business Pkwy', city: 'Raleigh', state: 'NC', zip: '276011234' },
    taxId: '581234567',
  },
  payerName: 'NCTracks',
  payerId: 'NCMED01',
  diagnosisCodes: [{ code: 'F41.1', codeSet: 'ICD10' }],
  serviceLines: [
    {
      procedureCode: '90837',
      productServiceIdQualifier: 'HC',
      chargeAmount: 150,
      units: 1,
      diagnosisPointers: [1],
    },
  ],
  dateOfService: '2024-03-15',
};

/** 2. DME claim - E1399 with PA number, local code, and PWK segment. */
export const dmeClaim: Claim = {
  claimId: 'CLAIM0002',
  patient: {
    subscriberId: '223456789B',
    firstName: 'Mary',
    lastName: 'Jones',
    dob: '1975-11-02',
    gender: 'F',
    address: { line1: '456 Oak Ave', city: 'Durham', state: 'NC', zip: '27701' },
  },
  billingProvider: {
    npi: '1234567893',
    taxonomyCode: '332B00000X',
    name: 'Acme DME Supply',
    address: { line1: '900 Supply Rd', city: 'Durham', state: 'NC', zip: '277011234' },
    taxId: '581234567',
  },
  payerName: 'NCTracks',
  payerId: 'NCMED01',
  diagnosisCodes: [{ code: 'M54.5', codeSet: 'ICD10' }],
  serviceLines: [
    {
      procedureCode: 'E1399',
      productServiceIdQualifier: 'HC',
      chargeAmount: 500,
      units: 1,
      priorAuthNumber: 'PA1234567',
      localCode: 'LOCAL001',
      diagnosisPointers: [1],
    },
  ],
  dateOfService: '2024-03-15',
  priorAuthorizationNumber: 'PA1234567',
};

/** 2b. Broken variant of the DME claim: missing PA number - validator should catch it. */
export const dmeClaimMissingPA: Claim = {
  ...dmeClaim,
  claimId: 'CLAIM0002B',
  priorAuthorizationNumber: undefined,
  serviceLines: [
    {
      ...dmeClaim.serviceLines[0],
      priorAuthNumber: undefined,
    },
  ],
};

/** 3. Referring provider claim - Loop 2310A with a referring provider NPI. */
export const referringProviderClaim: Claim = {
  claimId: 'CLAIM0003',
  patient: {
    subscriberId: '323456789C',
    firstName: 'Robert',
    lastName: 'Brown',
    dob: '1990-01-20',
    gender: 'M',
    address: { line1: '789 Pine Rd', city: 'Charlotte', state: 'NC', zip: '28202' },
  },
  billingProvider: {
    npi: '1234567893',
    taxonomyCode: '103T00000X',
    name: 'Acme Behavioral Health',
    address: { line1: '500 Business Pkwy', city: 'Raleigh', state: 'NC', zip: '276011234' },
    taxId: '581234567',
  },
  referringProvider: {
    npi: '9876543210',
    taxonomyCode: '208D00000X',
    name: 'Adams',
    firstName: 'Alice',
  },
  payerName: 'NCTracks',
  payerId: 'NCMED01',
  diagnosisCodes: [{ code: 'F32.9', codeSet: 'ICD10' }],
  serviceLines: [
    {
      procedureCode: '90834',
      productServiceIdQualifier: 'HC',
      chargeAmount: 120,
      units: 1,
      diagnosisPointers: [1],
    },
  ],
  dateOfService: '2024-03-15',
};

/** 3b. Broken variant: referring provider is an organization, not a person. */
export const referringProviderOrgClaim: Claim = {
  ...referringProviderClaim,
  claimId: 'CLAIM0003B',
  referringProvider: {
    npi: '9876543210',
    taxonomyCode: '208D00000X',
    name: 'Acme Referral Group',
    firstName: undefined,
  },
};
