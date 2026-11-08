import type { Segment } from '../types/segments';
import { toGE, toGS, toIEA, toISA, toSE, toST } from '../types/segments';
import type { SubmitterInfo } from '../types/domain';

export interface EnvelopeControlNumbers {
  /** ISA13 / IEA02 - 9 digits. */
  interchangeControlNumber: string;
  /** GS06 / GE02. */
  groupControlNumber: string;
  /** ST02 / SE02 base - each transaction in a batch gets base + its index (0001, 0002, ...). */
  transactionControlNumber: string;
}

export interface EnvelopeOptions {
  submitter: SubmitterInfo;
  /** Receiver id, e.g. "030240928" (NCTracks payer/receiver id). Defaults to submitter.submitterId padded. */
  receiverId?: string;
  controlNumbers: EnvelopeControlNumbers;
  /** Defaults to now. Injectable for deterministic tests. */
  now?: Date;
}

/** Zero-pads a numeric control number on the left (right-justified), e.g. "1" -> "000000001". */
function pad(n: string, length: number, char = '0'): string {
  return n.padStart(length, char).slice(-length);
}

/**
 * Space-pads an alphanumeric ISA element on the right (left-justified) to a
 * fixed width, truncating if too long. X12 AN elements are left-justified -
 * padding on the left (as `pad` does for numbers) produces an invalid value
 * for fields like ISA08 that a trading partner compares by prefix.
 */
function padRight(value: string, length: number): string {
  return value.slice(0, length).padEnd(length, ' ');
}

function formatDateYYMMDD(d: Date): string {
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = pad(String(d.getUTCMonth() + 1), 2);
  const dd = pad(String(d.getUTCDate()), 2);
  return `${yy}${mm}${dd}`;
}

function formatDateCCYYMMDD(d: Date): string {
  const yyyy = String(d.getUTCFullYear());
  const mm = pad(String(d.getUTCMonth() + 1), 2);
  const dd = pad(String(d.getUTCDate()), 2);
  return `${yyyy}${mm}${dd}`;
}

function formatTimeHHMM(d: Date): string {
  const hh = pad(String(d.getUTCHours()), 2);
  const mm = pad(String(d.getUTCMinutes()), 2);
  return `${hh}${mm}`;
}

export function receiverIdFor(submitter: SubmitterInfo): string {
  return submitter.isRealTime ? 'NCTRACKSREL' : 'NCTRACKSBAT';
}

/**
 * ST02/SE02 must be unique within the functional group. Each transaction in
 * a batch gets `transactionControlNumber` (the base) plus its 0-based index.
 */
export function transactionControlNumberFor(base: string, transactionIndex: number): string {
  return pad(String(Number(base) + transactionIndex), 4);
}

/** Builds the ISA/GS interchange + functional group header (shared by every transaction in the batch). */
export function buildInterchangeHeader(options: EnvelopeOptions): Segment[] {
  const now = options.now ?? new Date();
  const receiverId = receiverIdFor(options.submitter);

  const isa = toISA({
    authorizationInfoQualifier: '00',
    authorizationInfo: padRight('', 10),
    securityInfoQualifier: '00',
    securityInfo: padRight('', 10),
    senderIdQualifier: 'ZZ',
    senderId: padRight(options.submitter.submitterId, 15),
    receiverIdQualifier: 'ZZ',
    receiverId: padRight(receiverId, 15),
    date: formatDateYYMMDD(now),
    time: formatTimeHHMM(now),
    repetitionSeparator: '^',
    version: '00501',
    controlNumber: pad(options.controlNumbers.interchangeControlNumber, 9),
    ackRequested: '0',
    usageIndicator: 'P',
    componentSeparator: ':',
  });

  const gs = toGS({
    functionalIdCode: 'HC',
    senderId: options.submitter.submitterId,
    receiverId,
    date: formatDateCCYYMMDD(now),
    time: formatTimeHHMM(now),
    controlNumber: options.controlNumbers.groupControlNumber,
    responsibleAgencyCode: 'X',
    version: '005010X222A1',
  });

  return [isa, gs];
}

/** Builds the ST segment opening one transaction set (one claim) within the batch. */
export function buildTransactionHeader(controlNumbers: EnvelopeControlNumbers, transactionIndex: number): Segment[] {
  return [
    toST({
      transactionSetId: '837',
      controlNumber: transactionControlNumberFor(controlNumbers.transactionControlNumber, transactionIndex),
      implementationConventionRef: '005010X222A1',
    }),
  ];
}

/**
 * Builds the SE segment closing one transaction set, computing SE01 (segment
 * count) from what was actually written - never hardcoded.
 *
 * `bodySegmentCount` is the number of segments written between this
 * transaction's ST and this call (exclusive of ST, exclusive of SE itself).
 */
export function buildTransactionTrailer(
  controlNumbers: EnvelopeControlNumbers,
  transactionIndex: number,
  bodySegmentCount: number,
): Segment[] {
  // SE counts itself and ST through SE inclusive: ST + body + SE.
  const seSegmentCount = String(bodySegmentCount + 2);
  return [
    toSE({
      segmentCount: seSegmentCount,
      controlNumber: transactionControlNumberFor(controlNumbers.transactionControlNumber, transactionIndex),
    }),
  ];
}

/**
 * Builds the GE/IEA functional group + interchange trailer, computing GE01
 * (count of transaction sets actually included) and IEA01 (interchange
 * count, always 1 - one ISA per file) from what was actually written.
 */
export function buildInterchangeTrailer(controlNumbers: EnvelopeControlNumbers, transactionCount: number): Segment[] {
  const ge = toGE({
    functionalGroupCount: String(transactionCount),
    controlNumber: controlNumbers.groupControlNumber,
  });
  const iea = toIEA({
    interchangeCount: '1',
    controlNumber: pad(controlNumbers.interchangeControlNumber, 9),
  });
  return [ge, iea];
}
