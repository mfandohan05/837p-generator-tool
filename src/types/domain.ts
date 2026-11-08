// Friendly domain model that the UI form binds to directly.
// Builders translate this into the X12 segment tree (see segments.ts).

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface Provider {
  npi: string;
  taxonomyCode: string;
  /** Organization name, or last name if firstName is also present (a person). */
  name: string;
  firstName?: string;
  /** Used with REF*G2 in place of an NPI for atypical (non-HIPAA-covered) providers. */
  atypicalId?: string;
}

export interface BillingProvider extends Provider {
  /** Billing provider's own business address (2010AA N3/N4) - distinct from the patient's address. */
  address: Address;
  /** EIN or SSN, digits only. Carried in REF*EI (EIN) or REF*SY (SSN) at 2010AA. */
  taxId: string;
  /** true if taxId is an SSN (REF*SY); false/omitted means EIN (REF*EI). */
  taxIdIsSSN?: boolean;
}

export interface Patient {
  /** 10 digits, ending in an alpha character. */
  subscriberId: string;
  firstName: string;
  lastName: string;
  /** ISO date (YYYY-MM-DD). */
  dob: string;
  gender: 'M' | 'F';
  address: Address;
}

export type CodeSet = 'ICD9' | 'ICD10';

export interface DiagnosisCode {
  code: string;
  codeSet: CodeSet;
}

export interface ServiceLine {
  procedureCode: string;
  /** "ER" for DMH-specific claims; "HC" is the common default HCPCS/CPT qualifier. */
  productServiceIdQualifier: string;
  chargeAmount: number;
  units: number;
  /** ISO date (YYYY-MM-DD); defaults to the claim's dateOfService if omitted. */
  dateOfService?: string;
  priorAuthNumber?: string;
  /** PWK06 - local/attachment control number, required alongside PWK01=OZ/PWK02=EL for certain DME codes. */
  localCode?: string;
  /**
   * SV107 - 1-based indexes into claim.diagnosisCodes identifying which
   * diagnoses this line applies to (e.g. [1] or [1, 2]). Defaults to [1]
   * (the principal diagnosis) when omitted.
   */
  diagnosisPointers?: number[];
}

export type ClaimFilingIndicator = 'MA' | 'MB' | '16' | 'MC' | 'CI' | 'OF';

export interface Claim {
  claimId: string;
  patient: Patient;
  billingProvider: BillingProvider;
  renderingProvider?: Provider;
  referringProvider?: Provider;
  /** Usually "NCTracks". */
  payerName: string;
  /** Payer identification code, carried in NM1*PR (2010BB) NM109 with qualifier "PI". */
  payerId: string;
  diagnosisCodes: DiagnosisCode[];
  serviceLines: ServiceLine[];
  /** ISO date (YYYY-MM-DD) - claim-level date of service. */
  dateOfService: string;
  /** SBR09 - required on every claim; defaults to "MC" (Medicaid) when omitted. */
  claimFilingIndicator?: ClaimFilingIndicator;
  /** Claim-level prior authorization number. */
  priorAuthorizationNumber?: string;
  /** Milestone code for H2023 (Individual Placement and Support) claims - carried in REF*P4. */
  demonstrationProjectMilestone?: string;
}

export interface SubmitterInfo {
  /** 4-digit ID from the Trading Partner Agreement. */
  submitterId: string;
  submitterName: string;
  contactName: string;
  contactPhone: string;
  /** false = batch (NCTRACKSBAT), true = real-time (NCTRACKSREL). */
  isRealTime: boolean;
}

/** DME procedure codes that require a PA number + PWK local code bundle. */
export const DME_BUNDLE_CODES = ['E1399', 'B9998', 'K0108', 'A9900'] as const;

/** Procedure code that triggers the Individual Placement and Support demonstration project rule. */
export const IPS_DEMONSTRATION_CODE = 'H2023';

/** First date of service for which ICD-10 diagnosis codes are required. */
export const ICD10_CUTOVER_DATE = '2015-10-01';
