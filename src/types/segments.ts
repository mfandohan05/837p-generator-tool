// Raw X12 segment shapes for the 005010X222A1 837P transaction.
// Each interface's fields are ordered/named to match the segment's element
// positions (elementN in comments); `toSegment()` flattens it into the
// generic `Segment` the writer/parser operate on.

/** Generic segment: an ID plus its ordered elements (element separator = "*"). */
export interface Segment {
  id: string;
  elements: string[];
}

const seg = (id: string, ...elements: (string | undefined)[]): Segment => ({
  id,
  elements: elements.map((e) => e ?? ''),
});

// ---------------------------------------------------------------------------
// Envelope segments
// ---------------------------------------------------------------------------

export interface ISASegment {
  authorizationInfoQualifier: string; // ISA01
  authorizationInfo: string; // ISA02
  securityInfoQualifier: string; // ISA03 - "00"
  securityInfo: string; // ISA04
  senderIdQualifier: string; // ISA05 - "ZZ"
  senderId: string; // ISA06
  receiverIdQualifier: string; // ISA07 - "ZZ"
  receiverId: string; // ISA08 - "NCTRACKSBAT" | "NCTRACKSREL"
  date: string; // ISA09 - YYMMDD
  time: string; // ISA10 - HHMM
  repetitionSeparator: string; // ISA11
  version: string; // ISA12 - "00501"
  controlNumber: string; // ISA13 - 9 digits
  ackRequested: string; // ISA14
  usageIndicator: string; // ISA15 - "P" | "T"
  componentSeparator: string; // ISA16
}
export const toISA = (f: ISASegment): Segment =>
  seg(
    'ISA',
    f.authorizationInfoQualifier,
    f.authorizationInfo,
    f.securityInfoQualifier,
    f.securityInfo,
    f.senderIdQualifier,
    f.senderId,
    f.receiverIdQualifier,
    f.receiverId,
    f.date,
    f.time,
    f.repetitionSeparator,
    f.version,
    f.controlNumber,
    f.ackRequested,
    f.usageIndicator,
    f.componentSeparator,
  );

export interface GSSegment {
  functionalIdCode: string; // GS01 - "HC"
  senderId: string; // GS02
  receiverId: string; // GS03 - "NCTRACKSBAT" | "NCTRACKSREL"
  date: string; // GS04 - CCYYMMDD
  time: string; // GS05 - HHMM
  controlNumber: string; // GS06
  responsibleAgencyCode: string; // GS07 - "X"
  version: string; // GS08 - "005010X222A1"
}
export const toGS = (f: GSSegment): Segment =>
  seg(
    'GS',
    f.functionalIdCode,
    f.senderId,
    f.receiverId,
    f.date,
    f.time,
    f.controlNumber,
    f.responsibleAgencyCode,
    f.version,
  );

export interface STSegment {
  transactionSetId: string; // ST01 - "837"
  controlNumber: string; // ST02
  implementationConventionRef: string; // ST03 - "005010X222A1"
}
export const toST = (f: STSegment): Segment =>
  seg('ST', f.transactionSetId, f.controlNumber, f.implementationConventionRef);

export interface BHTSegment {
  hierarchicalStructureCode: string; // BHT01 - "0019"
  transactionSetPurposeCode: string; // BHT02 - "00"
  referenceId: string; // BHT03
  date: string; // BHT04
  time: string; // BHT05
  transactionTypeCode: string; // BHT06 - "CH" (fee-for-service); "RP" rejected by NCTracks
}
export const toBHT = (f: BHTSegment): Segment =>
  seg(
    'BHT',
    f.hierarchicalStructureCode,
    f.transactionSetPurposeCode,
    f.referenceId,
    f.date,
    f.time,
    f.transactionTypeCode,
  );

export interface SESegment {
  segmentCount: string; // SE01
  controlNumber: string; // SE02
}
export const toSE = (f: SESegment): Segment => seg('SE', f.segmentCount, f.controlNumber);

export interface GESegment {
  functionalGroupCount: string; // GE01
  controlNumber: string; // GE02
}
export const toGE = (f: GESegment): Segment => seg('GE', f.functionalGroupCount, f.controlNumber);

export interface IEASegment {
  interchangeCount: string; // IEA01
  controlNumber: string; // IEA02
}
export const toIEA = (f: IEASegment): Segment => seg('IEA', f.interchangeCount, f.controlNumber);

// ---------------------------------------------------------------------------
// Loop segments
// ---------------------------------------------------------------------------

export interface NM1Segment {
  entityIdCode: string; // NM101 - e.g. "41" submitter, "40" receiver, "85" billing provider, "IL" subscriber, "82" rendering, "DN" referring, "PR" payer
  entityTypeQualifier: '1' | '2'; // NM102 - 1=person, 2=non-person entity
  lastName?: string; // NM103
  firstName?: string; // NM104
  middleName?: string; // NM105
  identificationCodeQualifier?: string; // NM108 - "XX" NPI, "46" ETIN, "PI" payer id
  identificationCode?: string; // NM109
}
export const toNM1 = (f: NM1Segment): Segment =>
  seg(
    'NM1',
    f.entityIdCode,
    f.entityTypeQualifier,
    f.lastName,
    f.firstName,
    f.middleName,
    undefined,
    undefined,
    f.identificationCodeQualifier,
    f.identificationCode,
  );

export interface PERSegment {
  contactFunctionCode: string; // PER01 - "IC"
  name: string; // PER02
  commQualifier1?: string; // PER03 - "TE"
  commNumber1?: string; // PER04
  commQualifier2?: string; // PER05
  commNumber2?: string; // PER06
}
export const toPER = (f: PERSegment): Segment =>
  seg('PER', f.contactFunctionCode, f.name, f.commQualifier1, f.commNumber1, f.commQualifier2, f.commNumber2);

export interface N3Segment {
  addressLine1: string; // N301
  addressLine2?: string; // N302
}
export const toN3 = (f: N3Segment): Segment => seg('N3', f.addressLine1, f.addressLine2);

export interface N4Segment {
  city: string; // N401
  state: string; // N402
  zip: string; // N403
}
export const toN4 = (f: N4Segment): Segment => seg('N4', f.city, f.state, f.zip);

export interface HLSegment {
  hierarchicalId: string; // HL01
  parentId?: string; // HL02
  levelCode: string; // HL03 - "20" billing provider, "22" subscriber, "23" patient
  childCode: string; // HL04 - "1" has subordinates, "0" does not
}
export const toHL = (f: HLSegment): Segment =>
  seg('HL', f.hierarchicalId, f.parentId, f.levelCode, f.childCode);

export interface SBRSegment {
  payerResponsibilityCode: string; // SBR01 - "P" primary
  individualRelationshipCode?: string; // SBR02 - "18" self
  claimFilingIndicatorCode?: string; // SBR09 - "MA" | "MB" | "16" | "CI" commercial etc.
}
export const toSBR = (f: SBRSegment): Segment =>
  seg(
    'SBR',
    f.payerResponsibilityCode,
    f.individualRelationshipCode,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    f.claimFilingIndicatorCode,
  );

export interface PRVSegment {
  providerCode: string; // PRV01 - "BI" billing
  referenceIdQualifier: string; // PRV02 - "PXC" taxonomy
  taxonomyCode: string; // PRV03
}
export const toPRV = (f: PRVSegment): Segment => seg('PRV', f.providerCode, f.referenceIdQualifier, f.taxonomyCode);

export interface REFSegment {
  qualifier: string; // REF01 - "G2" atypical id, "EA" medical record #, "9F" PA, "P4" demonstration project id
  value: string; // REF02
}
export const toREF = (f: REFSegment): Segment => seg('REF', f.qualifier, f.value);

export interface DMGSegment {
  dateFormatQualifier: string; // DMG01 - "D8"
  dob: string; // DMG02 - CCYYMMDD
  gender: 'M' | 'F'; // DMG03
}
export const toDMG = (f: DMGSegment): Segment => seg('DMG', f.dateFormatQualifier, f.dob, f.gender);

export interface CLMSegment {
  claimId: string; // CLM01
  totalChargeAmount: string; // CLM02
  placeOfServiceCode?: string; // CLM05-1 (composite, position 1)
  facilityCodeQualifier?: string; // CLM05-2
  claimFrequencyCode?: string; // CLM05-3
  providerSignatureIndicator: string; // CLM06 - "Y"
  assignmentOrPlanParticipationCode: string; // CLM07 - "A"
  benefitsAssignmentCertificationIndicator: string; // CLM08 - "Y"
  releaseOfInformationCode: string; // CLM09 - "Y"
}
export const toCLM = (f: CLMSegment): Segment =>
  seg(
    'CLM',
    f.claimId,
    f.totalChargeAmount,
    undefined,
    undefined,
    [f.placeOfServiceCode, f.facilityCodeQualifier, f.claimFrequencyCode].join(':'),
    f.providerSignatureIndicator,
    f.assignmentOrPlanParticipationCode,
    f.benefitsAssignmentCertificationIndicator,
    f.releaseOfInformationCode,
  );

export interface HISegment {
  /** Each entry is a composite qualifier:code, e.g. "ABK:R51" (ICD-10) or "BK:7840" (ICD-9). */
  diagnosisCodes: string[]; // HI01..HI12
}
export const toHI = (f: HISegment): Segment => seg('HI', ...f.diagnosisCodes);

export interface DTPSegment {
  qualifier: string; // DTP01 - "472" service date
  dateFormatQualifier: string; // DTP02 - "D8" | "RD8"
  date: string; // DTP03
}
export const toDTP = (f: DTPSegment): Segment => seg('DTP', f.qualifier, f.dateFormatQualifier, f.date);

export interface SV1Segment {
  procedureCodeQualifier: string; // SV101-1 - "HC" | "ER"
  procedureCode: string; // SV101-2
  chargeAmount: string; // SV102
  unitBasisMeasurementCode: string; // SV103 - "UN"
  units: string; // SV104
  /** SV107 - composite diagnosis code pointer, e.g. ["1"] or ["1", "2"]. Must Use. */
  diagnosisCodePointers: string[];
}
export const toSV1 = (f: SV1Segment): Segment =>
  seg(
    'SV1',
    `${f.procedureCodeQualifier}:${f.procedureCode}`,
    f.chargeAmount,
    f.unitBasisMeasurementCode,
    f.units,
    undefined, // SV105 - Place of Service, not used
    undefined, // SV106 - not used
    f.diagnosisCodePointers.join(':'),
  );

export interface PWKSegment {
  reportTypeCode: string; // PWK01 - "OZ"
  reportTransmissionCode: string; // PWK02 - "EL"
  attachmentControlNumber?: string; // PWK06
}
export const toPWK = (f: PWKSegment): Segment =>
  seg('PWK', f.reportTypeCode, f.reportTransmissionCode, undefined, undefined, undefined, f.attachmentControlNumber);

export interface CASSegment {
  claimAdjustmentGroupCode: string; // CAS01
  adjustmentReasonCode: string; // CAS02
  adjustmentAmount: string; // CAS03
}
export const toCAS = (f: CASSegment): Segment =>
  seg('CAS', f.claimAdjustmentGroupCode, f.adjustmentReasonCode, f.adjustmentAmount);

export interface AMTSegment {
  qualifier: string; // AMT01
  amount: string; // AMT02
}
export const toAMT = (f: AMTSegment): Segment => seg('AMT', f.qualifier, f.amount);

export interface SVDSegment {
  payerId: string; // SVD01
  paidAmount: string; // SVD02
}
export const toSVD = (f: SVDSegment): Segment => seg('SVD', f.payerId, f.paidAmount);
