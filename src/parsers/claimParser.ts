import type { Segment } from '../types/segments';
import type {
  Address,
  BillingProvider,
  Claim,
  CodeSet,
  DiagnosisCode,
  Provider,
  ServiceLine,
  SubmitterInfo,
} from '../types/domain';

function ccyymmddToIso(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function el(segment: Segment, index: number): string | undefined {
  const value = segment.elements[index];
  return value === undefined || value === '' ? undefined : value;
}

function diagnosisFromComposite(composite: string): DiagnosisCode {
  const [qualifier, code] = composite.split(':');
  const codeSet: CodeSet = qualifier === 'ABK' || qualifier === 'ABF' ? 'ICD10' : 'ICD9';
  return { code, codeSet };
}

function providerFromNM1(nm1: Segment, ref?: Segment): Provider {
  const npi = el(nm1, 7) === 'XX' ? el(nm1, 8) : undefined;
  const atypicalId = !npi && ref?.id === 'REF' && el(ref, 0) === 'G2' ? el(ref, 1) : undefined;
  return {
    npi: npi ?? '',
    taxonomyCode: '',
    name: el(nm1, 2) ?? '',
    firstName: el(nm1, 3),
    atypicalId,
  };
}

const emptyAddress = (): Address => ({ line1: '', city: '', state: '', zip: '' });

/**
 * Reconstructs a Claim + SubmitterInfo from a parsed 837P segment list
 * (BHT through the last service line segment, or a full ISA...IEA
 * transaction - envelope segments are ignored except NM1*40's receiver ID).
 */
export function reconstructClaim(segments: Segment[]): { claim: Claim; submitter: SubmitterInfo } {
  let claimId = '';
  let submitterId = '';
  let submitterName = '';
  let contactName = '';
  let contactPhone = '';
  let isRealTime = false;
  let billingProvider: BillingProvider = {
    npi: '',
    taxonomyCode: '',
    name: '',
    address: emptyAddress(),
    taxId: '',
  };
  let referringProvider: Provider | undefined;
  let renderingProvider: Provider | undefined;
  let claimFilingIndicator: Claim['claimFilingIndicator'];
  let subscriberId = '';
  let firstName = '';
  let lastName = '';
  let dob = '';
  let gender: 'M' | 'F' = 'M';
  let patientAddress = emptyAddress();
  let payerName = '';
  let payerId = '';
  let diagnosisCodes: DiagnosisCode[] = [];
  let priorAuthorizationNumber: string | undefined;
  let demonstrationProjectMilestone: string | undefined;
  let claimDateOfService = '';

  const serviceLines: ServiceLine[] = [];
  let currentLine: Partial<ServiceLine> | null = null;

  // Track which NM1 loop we're inside so a following N3/N4/REF/PRV attaches correctly.
  let currentNm1Context: 'submitter' | 'receiver' | 'billing' | 'subscriber' | 'payer' | 'referring' | 'rendering' | null = null;

  const flushLine = () => {
    if (currentLine) {
      serviceLines.push(currentLine as ServiceLine);
      currentLine = null;
    }
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];

    switch (seg.id) {
      case 'BHT':
        claimId = el(seg, 2) ?? '';
        break;

      case 'PRV':
        // Billing provider's PRV precedes its NM1 (context still 'receiver' at
        // that point); the rendering provider's PRV follows its NM1*82.
        if (currentNm1Context === 'rendering' && renderingProvider) {
          renderingProvider = { ...renderingProvider, taxonomyCode: el(seg, 2) ?? '' };
        } else {
          billingProvider = { ...billingProvider, taxonomyCode: el(seg, 2) ?? '' };
        }
        break;

      case 'NM1': {
        const entityIdCode = el(seg, 0);
        const refFollows = next?.id === 'REF' ? next : undefined;
        if (entityIdCode === '41') {
          currentNm1Context = 'submitter';
          submitterName = el(seg, 2) ?? '';
          submitterId = el(seg, 8) ?? '';
        } else if (entityIdCode === '40') {
          currentNm1Context = 'receiver';
          isRealTime = el(seg, 8) === 'NCTRACKSREL';
        } else if (entityIdCode === '85') {
          currentNm1Context = 'billing';
          billingProvider = {
            ...billingProvider,
            ...providerFromNM1(seg, refFollows),
            taxonomyCode: billingProvider.taxonomyCode,
            address: billingProvider.address,
            taxId: billingProvider.taxId,
          };
        } else if (entityIdCode === 'IL') {
          currentNm1Context = 'subscriber';
          lastName = el(seg, 2) ?? '';
          firstName = el(seg, 3) ?? '';
          subscriberId = el(seg, 8) ?? '';
        } else if (entityIdCode === 'PR') {
          currentNm1Context = 'payer';
          payerName = el(seg, 2) ?? '';
          payerId = el(seg, 8) ?? '';
        } else if (entityIdCode === 'DN') {
          currentNm1Context = 'referring';
          referringProvider = providerFromNM1(seg, refFollows);
        } else if (entityIdCode === '82') {
          currentNm1Context = 'rendering';
          renderingProvider = providerFromNM1(seg, refFollows);
        }
        break;
      }

      case 'PER':
        contactName = el(seg, 1) ?? '';
        contactPhone = el(seg, 3) ?? '';
        break;

      case 'N3':
        if (currentNm1Context === 'billing') {
          billingProvider = { ...billingProvider, address: { ...billingProvider.address, line1: el(seg, 0) ?? '' } };
        } else if (currentNm1Context === 'subscriber') {
          patientAddress = { ...patientAddress, line1: el(seg, 0) ?? '' };
        }
        break;

      case 'N4':
        if (currentNm1Context === 'billing') {
          billingProvider = {
            ...billingProvider,
            address: { ...billingProvider.address, city: el(seg, 0) ?? '', state: el(seg, 1) ?? '', zip: el(seg, 2) ?? '' },
          };
        } else if (currentNm1Context === 'subscriber') {
          patientAddress = { ...patientAddress, city: el(seg, 0) ?? '', state: el(seg, 1) ?? '', zip: el(seg, 2) ?? '' };
        }
        break;

      case 'SBR':
        claimFilingIndicator = el(seg, 8) as Claim['claimFilingIndicator'];
        break;

      case 'DMG':
        dob = el(seg, 1) ? ccyymmddToIso(el(seg, 1)!) : '';
        gender = (el(seg, 2) as 'M' | 'F') ?? 'M';
        break;

      case 'CLM':
        claimId = el(seg, 0) ?? claimId;
        break;

      case 'HI':
        diagnosisCodes = seg.elements.filter(Boolean).map(diagnosisFromComposite);
        break;

      case 'REF': {
        const qualifier = el(seg, 0);
        const value = el(seg, 1) ?? '';
        if (qualifier === 'EI' || qualifier === 'SY') {
          billingProvider = { ...billingProvider, taxId: value, taxIdIsSSN: qualifier === 'SY' || undefined };
        } else if (qualifier === '9F') {
          if (!currentLine) {
            priorAuthorizationNumber = value;
          } else {
            currentLine.priorAuthNumber = value;
          }
        } else if (qualifier === 'P4') {
          demonstrationProjectMilestone = value;
        }
        // REF*G2 is consumed by providerFromNM1 via look-ahead; skip here.
        break;
      }

      case 'LX':
        flushLine();
        currentLine = {};
        break;

      case 'SV1': {
        const [qualifier, code] = (el(seg, 0) ?? '').split(':');
        currentLine!.productServiceIdQualifier = qualifier;
        currentLine!.procedureCode = code;
        currentLine!.chargeAmount = Number(el(seg, 1) ?? '0');
        currentLine!.units = Number(el(seg, 3) ?? '0');
        const pointers = el(seg, 6);
        currentLine!.diagnosisPointers = pointers ? pointers.split(':').map(Number) : [1];
        break;
      }

      case 'DTP': {
        const date = el(seg, 2);
        if (date) {
          const iso = ccyymmddToIso(date);
          if (currentLine) {
            currentLine.dateOfService = iso;
          } else if (!claimDateOfService) {
            claimDateOfService = iso;
          }
        }
        break;
      }

      case 'PWK':
        if (currentLine) {
          currentLine.localCode = el(seg, 5);
        }
        break;

      default:
        break;
    }
  }
  flushLine();

  // Claim-level date of service defaults to the first line's date if not set separately.
  const dateOfService = claimDateOfService || serviceLines[0]?.dateOfService || '';

  // Drop a line's dateOfService when it matches the claim's, mirroring the
  // builder's convention of treating claim.dateOfService as the default.
  const normalizedLines = serviceLines.map((line) =>
    line.dateOfService === dateOfService ? { ...line, dateOfService: undefined } : line,
  );

  const claim: Claim = {
    claimId,
    patient: { subscriberId, firstName, lastName, dob, gender, address: patientAddress },
    billingProvider,
    renderingProvider,
    referringProvider,
    payerName,
    payerId,
    diagnosisCodes,
    serviceLines: normalizedLines,
    dateOfService,
    claimFilingIndicator,
    priorAuthorizationNumber,
    demonstrationProjectMilestone,
  };

  const submitter: SubmitterInfo = {
    submitterId,
    submitterName,
    contactName,
    contactPhone,
    isRealTime,
  };

  return { claim, submitter };
}
