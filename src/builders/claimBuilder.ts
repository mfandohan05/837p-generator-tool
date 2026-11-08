import type { Segment } from '../types/segments';
import {
  toBHT,
  toCLM,
  toDMG,
  toDTP,
  toHI,
  toHL,
  toN3,
  toN4,
  toNM1,
  toPER,
  toPRV,
  toPWK,
  toREF,
  toSBR,
  toSV1,
} from '../types/segments';
import type { Claim, DiagnosisCode, Provider, ServiceLine, SubmitterInfo } from '../types/domain';
import { DME_BUNDLE_CODES, IPS_DEMONSTRATION_CODE } from '../types/domain';
import type { EnvelopeControlNumbers } from './envelopeBuilder';
import {
  buildInterchangeHeader,
  buildInterchangeTrailer,
  buildTransactionHeader,
  buildTransactionTrailer,
  receiverIdFor,
} from './envelopeBuilder';

function isoToCCYYMMDD(iso: string): string {
  return iso.replaceAll('-', '');
}

function isPerson(provider: Provider): boolean {
  return Boolean(provider.firstName);
}

/** Strips non-digits so a "27601-1234" input becomes the 9-digit "276011234" N403 requires. */
function normalizeZip9(zip: string): string {
  return zip.replace(/\D/g, '');
}

/** DME bundle codes require a PA number + PWK*OZ*EL local code (Step 3, rule 7). */
export function requiresDmeBundle(procedureCode: string): boolean {
  return (DME_BUNDLE_CODES as readonly string[]).includes(procedureCode);
}

function buildLX(lineNumber: number): Segment {
  return { id: 'LX', elements: [String(lineNumber)] };
}

function diagnosisComposite(dx: DiagnosisCode, isPrincipal: boolean): string {
  const qualifier = dx.codeSet === 'ICD10' ? (isPrincipal ? 'ABK' : 'ABF') : isPrincipal ? 'BK' : 'BF';
  // X12/HIPAA convention: diagnosis codes are carried without the decimal point.
  return `${qualifier}:${dx.code.replace('.', '')}`;
}

/**
 * `prvProviderCode` opts into a PRV (provider specialty) segment right after
 * NM1 - required for the rendering provider (2310B, code "PE") per NCTracks
 * partner-specific rules, but not for referring (2310A).
 */
function buildProviderNameLoop(entityIdCode: string, provider: Provider, prvProviderCode?: string): Segment[] {
  const segments: Segment[] = [];
  const nm1 = provider.npi
    ? toNM1({
        entityIdCode,
        entityTypeQualifier: isPerson(provider) ? '1' : '2',
        lastName: provider.name,
        firstName: provider.firstName,
        identificationCodeQualifier: 'XX',
        identificationCode: provider.npi,
      })
    : toNM1({
        entityIdCode,
        entityTypeQualifier: isPerson(provider) ? '1' : '2',
        lastName: provider.name,
        firstName: provider.firstName,
      });
  segments.push(nm1);

  if (prvProviderCode && provider.taxonomyCode) {
    segments.push(toPRV({ providerCode: prvProviderCode, referenceIdQualifier: 'PXC', taxonomyCode: provider.taxonomyCode }));
  }

  if (!provider.npi && provider.atypicalId) {
    // Atypical (non-NPI) provider must be identified via REF*G2 (Step 3, rule 8).
    segments.push(toREF({ qualifier: 'G2', value: provider.atypicalId }));
  }

  return segments;
}

function buildSubmitterLoop(submitter: SubmitterInfo): Segment[] {
  return [
    toNM1({
      entityIdCode: '41',
      entityTypeQualifier: '2',
      lastName: submitter.submitterName,
      identificationCodeQualifier: '46',
      identificationCode: submitter.submitterId,
    }),
    toPER({
      contactFunctionCode: 'IC',
      name: submitter.contactName,
      commQualifier1: 'TE',
      commNumber1: submitter.contactPhone,
    }),
  ];
}

function buildReceiverLoop(submitter: SubmitterInfo): Segment[] {
  const receiverId = receiverIdFor(submitter);
  return [
    toNM1({
      entityIdCode: '40',
      entityTypeQualifier: '2',
      lastName: 'NCTRACKS',
      identificationCodeQualifier: '46',
      identificationCode: receiverId,
    }),
  ];
}

function buildBillingProviderLoop(claim: Claim): Segment[] {
  const provider = claim.billingProvider;
  const segments: Segment[] = [];
  segments.push(toHL({ hierarchicalId: '1', parentId: undefined, levelCode: '20', childCode: '1' }));
  segments.push(toPRV({ providerCode: 'BI', referenceIdQualifier: 'PXC', taxonomyCode: provider.taxonomyCode }));
  segments.push(...buildProviderNameLoop('85', provider));
  segments.push(toN3({ addressLine1: provider.address.line1, addressLine2: provider.address.line2 || undefined }));
  segments.push(
    toN4({ city: provider.address.city, state: provider.address.state, zip: normalizeZip9(provider.address.zip) }),
  );
  // REF (Billing Provider Tax Identification) - Must Use at 2010AA position 0350.
  segments.push(toREF({ qualifier: provider.taxIdIsSSN ? 'SY' : 'EI', value: provider.taxId }));
  return segments;
}

function buildSubscriberLoop(claim: Claim): Segment[] {
  const segments: Segment[] = [];
  segments.push(toHL({ hierarchicalId: '2', parentId: '1', levelCode: '22', childCode: '0' }));
  segments.push(
    toSBR({
      payerResponsibilityCode: 'P',
      individualRelationshipCode: '18',
      // SBR09 is Must Use on every claim (situational rule tied to National
      // PlanID not yet being mandated) - default to Medicaid when not set.
      claimFilingIndicatorCode: claim.claimFilingIndicator ?? 'MC',
    }),
  );
  segments.push(
    toNM1({
      entityIdCode: 'IL',
      entityTypeQualifier: '1',
      lastName: claim.patient.lastName,
      firstName: claim.patient.firstName,
      identificationCodeQualifier: 'MI',
      identificationCode: claim.patient.subscriberId,
    }),
  );
  segments.push(toN3({ addressLine1: claim.patient.address.line1 }));
  segments.push(
    toN4({
      city: claim.patient.address.city,
      state: claim.patient.address.state,
      zip: normalizeZip9(claim.patient.address.zip),
    }),
  );
  segments.push(toDMG({ dateFormatQualifier: 'D8', dob: isoToCCYYMMDD(claim.patient.dob), gender: claim.patient.gender }));
  segments.push(
    toNM1({
      entityIdCode: 'PR',
      entityTypeQualifier: '2',
      lastName: claim.payerName,
      identificationCodeQualifier: 'PI',
      identificationCode: claim.payerId,
    }),
  );
  return segments;
}

function buildClaimLevelSegments(claim: Claim): Segment[] {
  const segments: Segment[] = [];

  segments.push(
    toCLM({
      claimId: claim.claimId,
      totalChargeAmount: totalCharge(claim).toFixed(2),
      placeOfServiceCode: '11',
      facilityCodeQualifier: 'B',
      claimFrequencyCode: '1',
      providerSignatureIndicator: 'Y',
      assignmentOrPlanParticipationCode: 'A',
      benefitsAssignmentCertificationIndicator: 'Y',
      releaseOfInformationCode: 'Y',
    }),
  );

  // Claim-level REF (prior auth, demonstration project id) precede HI in the
  // 2300 loop - a REF placed after HI reads as unrecognized data, since the
  // guideline expects nothing but the 2310 provider loops after HI.
  if (claim.priorAuthorizationNumber) {
    segments.push(toREF({ qualifier: '9F', value: claim.priorAuthorizationNumber }));
  }

  const ipsLine = claim.serviceLines.find((line) => line.procedureCode === IPS_DEMONSTRATION_CODE);
  if (ipsLine && claim.demonstrationProjectMilestone) {
    segments.push(toREF({ qualifier: 'P4', value: claim.demonstrationProjectMilestone }));
  }

  const principal = claim.diagnosisCodes[0];
  const secondary = claim.diagnosisCodes.slice(1);
  if (principal) {
    segments.push(
      toHI({
        diagnosisCodes: [
          diagnosisComposite(principal, true),
          ...secondary.map((dx) => diagnosisComposite(dx, false)),
        ],
      }),
    );
  }

  if (claim.referringProvider) {
    segments.push(...buildProviderNameLoop('DN', claim.referringProvider));
  }
  if (claim.renderingProvider) {
    // PRV (Rendering Provider Taxonomy) - required by NCTracks partner-specific rule.
    segments.push(...buildProviderNameLoop('82', claim.renderingProvider, 'PE'));
  }

  return segments;
}

function buildServiceLineSegments(claim: Claim, line: ServiceLine, lineNumber: number): Segment[] {
  const segments: Segment[] = [];
  segments.push(buildLX(lineNumber));
  const diagnosisPointers = line.diagnosisPointers && line.diagnosisPointers.length > 0 ? line.diagnosisPointers : [1];
  segments.push(
    toSV1({
      procedureCodeQualifier: line.productServiceIdQualifier,
      procedureCode: line.procedureCode,
      chargeAmount: line.chargeAmount.toFixed(2),
      unitBasisMeasurementCode: 'UN',
      units: String(line.units),
      diagnosisCodePointers: diagnosisPointers.map(String),
    }),
  );
  segments.push(toDTP({ qualifier: '472', dateFormatQualifier: 'D8', date: isoToCCYYMMDD(line.dateOfService ?? claim.dateOfService) }));

  if (line.priorAuthNumber) {
    segments.push(toREF({ qualifier: '9F', value: line.priorAuthNumber }));
  }

  if (requiresDmeBundle(line.procedureCode) && line.localCode) {
    segments.push(toPWK({ reportTypeCode: 'OZ', reportTransmissionCode: 'EL', attachmentControlNumber: line.localCode }));
  }

  return segments;
}

/**
 * Builds a complete ISA...IEA file containing one ST...SE transaction set
 * per claim, all sharing a single ISA/GS envelope (batch submission) - GE01
 * (transaction count) and each SE01 (segment count) are computed from what
 * was actually written, and ST02/SE02 increment per claim (see
 * envelopeBuilder).
 */
export function buildBatchTransaction(
  claims: Claim[],
  submitter: SubmitterInfo,
  controlNumbers: EnvelopeControlNumbers,
  now: Date = new Date(),
): Segment[] {
  const header = buildInterchangeHeader({ submitter, controlNumbers, now });

  const transactions = claims.flatMap((claim, index) => {
    const st = buildTransactionHeader(controlNumbers, index);
    const body = buildClaimBody(claim, submitter, now);
    const se = buildTransactionTrailer(controlNumbers, index, body.length);
    return [...st, ...body, ...se];
  });

  const trailer = buildInterchangeTrailer(controlNumbers, claims.length);
  return [...header, ...transactions, ...trailer];
}

/**
 * Builds the complete ISA...IEA transaction for a single claim - a
 * convenience wrapper around `buildBatchTransaction` for the one-claim case.
 */
export function buildFullTransaction(
  claim: Claim,
  submitter: SubmitterInfo,
  controlNumbers: EnvelopeControlNumbers,
  now: Date = new Date(),
): Segment[] {
  return buildBatchTransaction([claim], submitter, controlNumbers, now);
}

export function totalCharge(claim: Claim): number {
  return claim.serviceLines.reduce((sum, line) => sum + line.chargeAmount, 0);
}

/**
 * Builds the transaction body: BHT through the last service line segment
 * (everything between ST and SE, exclusive of both).
 */
export function buildClaimBody(claim: Claim, submitter: SubmitterInfo, now: Date = new Date()): Segment[] {
  const segments: Segment[] = [];

  segments.push(
    toBHT({
      hierarchicalStructureCode: '0019',
      transactionSetPurposeCode: '00',
      referenceId: claim.claimId,
      date: isoToCCYYMMDD(now.toISOString().slice(0, 10)),
      time: `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`,
      transactionTypeCode: 'CH',
    }),
  );

  segments.push(...buildSubmitterLoop(submitter));
  segments.push(...buildReceiverLoop(submitter));
  segments.push(...buildBillingProviderLoop(claim));
  segments.push(...buildSubscriberLoop(claim));
  segments.push(...buildClaimLevelSegments(claim));

  claim.serviceLines.forEach((line, index) => {
    segments.push(...buildServiceLineSegments(claim, line, index + 1));
  });

  return segments;
}
