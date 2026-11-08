import type { Segment } from '../types/segments';
import { parseX12 } from './x12Parser';

export type AckStatusCode = 'A' | 'E' | 'M' | 'P' | 'R' | 'W' | 'X';

const STATUS_LABELS: Record<AckStatusCode, string> = {
  A: 'Accepted',
  E: 'Accepted, but errors were noted',
  M: 'Rejected, message authentication code failed',
  P: 'Partially accepted, at least one transaction set rejected',
  R: 'Rejected',
  W: 'Rejected, assurance failed validity tests',
  X: 'Rejected, content after decryption could not be analyzed',
};

// IK5-02..05 / AK9-02..05 error reason codes (subset commonly seen).
const SYNTAX_ERROR_CODES: Record<string, string> = {
  '1': 'Transaction Set Not Supported',
  '2': 'Transaction Set Trailer Missing',
  '3': 'Transaction Set Control Number in Header and Trailer Do Not Match',
  '4': 'Number of Included Segments Does Not Match Actual Count',
  '5': 'One or More Segments in Error',
  '6': 'Missing or Invalid Transaction Set Identifier',
  '7': 'Missing or Invalid Transaction Set Control Number',
  '8': 'Authentication Key Name Unknown',
  '9': 'Encryption Key Name Unknown',
  '10': 'Requested Service (Authentication or Encrypted) Not Available',
  '15': 'Unknown Security Recipient',
  '23': 'Transaction Set Control Number Not Unique within the Functional Group',
  '24': "Syntax Error Noted in Bytes 116-200 of the '2/010' Data Segment",
};

const SEGMENT_ERROR_CODES: Record<string, string> = {
  '1': 'Unrecognized segment ID',
  '2': 'Unexpected segment',
  '3': 'Mandatory segment missing',
  '4': 'Loop occurs over maximum times',
  '5': 'Segment exceeds maximum use',
  '6': 'Segment not in defined transaction set',
  '7': 'Segment not in proper sequence',
  '8': 'Segment has data element errors',
};

const ELEMENT_ERROR_CODES: Record<string, string> = {
  '1': 'Mandatory data element missing',
  '2': 'Conditional required data element missing',
  '3': 'Too many data elements',
  '4': 'Data element too short',
  '5': 'Data element too long',
  '6': 'Invalid character in data element',
  '7': 'Invalid code value',
  '8': 'Invalid date',
  '9': 'Invalid time',
  '10': 'Exclusion condition violated',
  '12': 'Too many repetitions',
  '13': 'Too many components',
};

export interface SegmentError {
  segmentIdInError: string;
  segmentPosition: string;
  loopIdentifier?: string;
  errorCode: string;
  errorDescription: string;
  elementErrors: ElementError[];
}

export interface ElementError {
  elementPosition: string;
  referenceDesignator?: string;
  errorCode: string;
  errorDescription: string;
  badData?: string;
}

export interface TransactionSetAck {
  transactionSetControlNumber: string;
  statusCode: AckStatusCode;
  statusLabel: string;
  segmentErrors: SegmentError[];
}

export interface FunctionalGroupAck {
  statusCode: AckStatusCode;
  statusLabel: string;
  transactionSets: TransactionSetAck[];
}

export interface Ack999Result {
  functionalGroups: FunctionalGroupAck[];
  /** Flattened plain-English lines, one per finding, for display. */
  summaryLines: string[];
}

function isStatusCode(value: string): value is AckStatusCode {
  return value in STATUS_LABELS;
}

function statusLabel(code: string): string {
  return isStatusCode(code) ? STATUS_LABELS[code] : `Unknown status code "${code}"`;
}

/**
 * Parses a 999 (Implementation Acknowledgment) into a structured, per-loop
 * summary. Interprets AK9 (functional group response), IK5 (transaction set
 * response), IK3 (segment errors), and IK4 (element errors within the
 * segment reported by the preceding IK3).
 */
export function parseAck999(raw: string): Ack999Result {
  const segments = parseX12(raw);
  const functionalGroups: FunctionalGroupAck[] = [];
  const summaryLines: string[] = [];

  let currentGroup: FunctionalGroupAck | null = null;
  let currentTxSet: TransactionSetAck | null = null;
  let currentSegmentError: SegmentError | null = null;

  const flushSegmentError = () => {
    if (currentSegmentError && currentTxSet) {
      currentTxSet.segmentErrors.push(currentSegmentError);
      currentSegmentError = null;
    }
  };

  for (const seg of segments) {
    switch (seg.id) {
      case 'GS':
        currentGroup = { statusCode: 'A', statusLabel: '', transactionSets: [] };
        break;
      case 'ST':
        currentTxSet = { transactionSetControlNumber: seg.elements[1] ?? '', statusCode: 'A', statusLabel: '', segmentErrors: [] };
        break;
      case 'IK3': {
        flushSegmentError();
        const [segmentIdInError, segmentPosition, loopIdentifier, errorCode] = seg.elements;
        currentSegmentError = {
          segmentIdInError,
          segmentPosition,
          loopIdentifier: loopIdentifier || undefined,
          errorCode,
          errorDescription: SEGMENT_ERROR_CODES[errorCode] ?? `Unknown segment error code "${errorCode}"`,
          elementErrors: [],
        };
        break;
      }
      case 'CTX':
        // Context detail for the preceding IK3/IK4 - not required for the summary, skipped.
        break;
      case 'IK4': {
        const [elementPosition, referenceDesignator, errorCode, badData] = seg.elements;
        const elementError: ElementError = {
          elementPosition,
          referenceDesignator: referenceDesignator || undefined,
          errorCode,
          errorDescription: ELEMENT_ERROR_CODES[errorCode] ?? `Unknown element error code "${errorCode}"`,
          badData: badData || undefined,
        };
        if (currentSegmentError) {
          currentSegmentError.elementErrors.push(elementError);
        }
        break;
      }
      case 'IK5': {
        flushSegmentError();
        if (currentTxSet) {
          const code = seg.elements[0];
          currentTxSet.statusCode = isStatusCode(code) ? code : 'R';
          currentTxSet.statusLabel = statusLabel(code);
          const syntaxCodes = seg.elements.slice(1).filter(Boolean);
          if (currentGroup) currentGroup.transactionSets.push(currentTxSet);
          summaryLines.push(
            `Transaction set ${currentTxSet.transactionSetControlNumber}: ${currentTxSet.statusLabel}` +
              (syntaxCodes.length
                ? ` (${syntaxCodes.map((c) => SYNTAX_ERROR_CODES[c] ?? `code ${c}`).join(', ')})`
                : ''),
          );
          for (const segErr of currentTxSet.segmentErrors) {
            summaryLines.push(
              `  Segment ${segErr.segmentIdInError} (position ${segErr.segmentPosition}${segErr.loopIdentifier ? `, loop ${segErr.loopIdentifier}` : ''}): ${segErr.errorDescription}`,
            );
            for (const elErr of segErr.elementErrors) {
              summaryLines.push(
                `    Element ${elErr.elementPosition}${elErr.referenceDesignator ? ` (${elErr.referenceDesignator})` : ''}: ${elErr.errorDescription}${elErr.badData ? ` - got "${elErr.badData}"` : ''}`,
              );
            }
          }
        }
        currentTxSet = null;
        break;
      }
      case 'AK9': {
        if (currentGroup) {
          const code = seg.elements[0];
          currentGroup.statusCode = isStatusCode(code) ? code : 'R';
          currentGroup.statusLabel = statusLabel(code);
          functionalGroups.push(currentGroup);
          summaryLines.unshift(`Functional group: ${currentGroup.statusLabel}`);
        }
        currentGroup = null;
        break;
      }
      default:
        break;
    }
  }

  return { functionalGroups, summaryLines };
}

export type { Segment };
