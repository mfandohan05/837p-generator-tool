import { describe, expect, it } from 'vitest';
import { buildBatchTransaction, buildClaimBody, buildFullTransaction, totalCharge } from '../src/builders/claimBuilder';
import { writeSegments } from '../src/serializers/segmentWriter';
import { dmeClaim, referringProviderClaim, sampleSubmitter, simpleClaim } from '../src/fixtures/sampleClaims';

const controlNumbers = {
  interchangeControlNumber: '000000001',
  groupControlNumber: '1',
  transactionControlNumber: '0001',
};

describe('claimBuilder loop ordering', () => {
  it('produces segments in the required 837P loop order for a simple claim', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter, new Date('2024-03-15T10:00:00Z'));
    const ids = body.map((s) => s.id);

    expect(ids[0]).toBe('BHT');
    expect(ids).toContain('NM1'); // submitter/receiver/provider/subscriber/payer all use NM1
    expect(ids).toContain('HL');
    expect(ids).toContain('PRV');
    expect(ids).toContain('SBR');
    expect(ids).toContain('DMG');
    expect(ids).toContain('CLM');
    expect(ids).toContain('HI');
    expect(ids).toContain('LX');
    expect(ids).toContain('SV1');
    expect(ids).toContain('DTP');

    // HL (billing provider) must precede HL (subscriber), which must precede CLM.
    const hlIndexes = ids.reduce<number[]>((acc, id, i) => (id === 'HL' ? [...acc, i] : acc), []);
    expect(hlIndexes.length).toBe(2);
    const clmIndex = ids.indexOf('CLM');
    expect(hlIndexes[0]).toBeLessThan(hlIndexes[1]);
    expect(hlIndexes[1]).toBeLessThan(clmIndex);

    // Claim (CLM/HI) must precede the service line (LX/SV1).
    expect(clmIndex).toBeLessThan(ids.indexOf('LX'));
    expect(ids.indexOf('LX')).toBeLessThan(ids.indexOf('SV1'));
  });

  it('includes PRV03 taxonomy for the billing provider', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const prv = body.find((s) => s.id === 'PRV');
    expect(prv?.elements[2]).toBe(simpleClaim.billingProvider.taxonomyCode);
  });

  it('emits PWK and REF*9F for a DME line with PA number and local code', () => {
    const body = buildClaimBody(dmeClaim, sampleSubmitter);
    const pwk = body.find((s) => s.id === 'PWK');
    expect(pwk?.elements[0]).toBe('OZ');
    expect(pwk?.elements[1]).toBe('EL');
    expect(pwk?.elements[5]).toBe('LOCAL001');

    const refs = body.filter((s) => s.id === 'REF');
    expect(refs.some((r) => r.elements[0] === '9F' && r.elements[1] === 'PA1234567')).toBe(true);
  });

  it('includes a 2310A referring provider NM1 loop when present', () => {
    const body = buildClaimBody(referringProviderClaim, sampleSubmitter);
    const referringNm1 = body.find((s) => s.id === 'NM1' && s.elements[0] === 'DN');
    expect(referringNm1).toBeDefined();
    expect(referringNm1?.elements[2]).toBe('Adams');
    expect(referringNm1?.elements[3]).toBe('Alice');
  });

  it('computes CLM02 as the sum of service line charges', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const clm = body.find((s) => s.id === 'CLM');
    expect(clm?.elements[1]).toBe(totalCharge(simpleClaim).toFixed(2));
  });

  it('emits the billing provider Tax ID as a REF*EI segment after N4', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const n4Index = body.findIndex((s) => s.id === 'N4');
    const taxIdRef = body.find((s) => s.id === 'REF' && s.elements[0] === 'EI');
    expect(taxIdRef?.elements[1]).toBe(simpleClaim.billingProvider.taxId);
    expect(body.indexOf(taxIdRef!)).toBeGreaterThan(n4Index);
  });

  it('uses SY instead of EI when the billing provider Tax ID is an SSN', () => {
    const ssnClaim = { ...simpleClaim, billingProvider: { ...simpleClaim.billingProvider, taxIdIsSSN: true } };
    const body = buildClaimBody(ssnClaim, sampleSubmitter);
    expect(body.some((s) => s.id === 'REF' && s.elements[0] === 'SY')).toBe(true);
  });

  it('formats the billing provider ZIP as 9 digits with no punctuation', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const n4 = body.find((s) => s.id === 'N4');
    expect(n4?.elements[2]).toBe('276011234');
    expect(n4?.elements[2]).toMatch(/^\d{9}$/);
  });

  it('carries a payer identification code in the NM1*PR segment', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const payerNm1 = body.find((s) => s.id === 'NM1' && s.elements[0] === 'PR');
    expect(payerNm1?.elements[7]).toBe('PI');
    expect(payerNm1?.elements[8]).toBe(simpleClaim.payerId);
  });

  it('defaults SBR09 (claim filing indicator) to "MC" when not set on the claim', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const sbr = body.find((s) => s.id === 'SBR');
    expect(sbr?.elements[8]).toBe('MC');
  });

  it('includes a SV107 diagnosis code pointer on every service line, defaulting to "1"', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const sv1 = body.find((s) => s.id === 'SV1');
    expect(sv1?.elements[6]).toBe('1');
  });

  it('strips decimal points from ICD-10 codes in the HI segment', () => {
    const body = buildClaimBody(simpleClaim, sampleSubmitter);
    const hi = body.find((s) => s.id === 'HI');
    expect(hi?.elements[0]).toBe('ABK:F411');
  });
});

describe('envelope control numbers', () => {
  it('keeps SE01, GE01, and IEA01 consistent with what was actually written', () => {
    const segments = buildFullTransaction(simpleClaim, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));

    const isaIndex = segments.findIndex((s) => s.id === 'ISA');
    const stIndex = segments.findIndex((s) => s.id === 'ST');
    const seIndex = segments.findIndex((s) => s.id === 'SE');
    const geIndex = segments.findIndex((s) => s.id === 'GE');
    const ieaIndex = segments.findIndex((s) => s.id === 'IEA');

    expect(isaIndex).toBe(0);
    expect(ieaIndex).toBe(segments.length - 1);

    // SE01 = count of segments from ST through SE, inclusive.
    const expectedSeCount = seIndex - stIndex + 1;
    const se = segments[seIndex];
    expect(se.elements[0]).toBe(String(expectedSeCount));

    // GE01 = number of functional groups (always 1 here); IEA01 = number of interchanges (always 1).
    expect(segments[geIndex].elements[0]).toBe('1');
    expect(segments[ieaIndex].elements[0]).toBe('1');

    // Control numbers must match between header and trailer.
    expect(se.elements[1]).toBe(segments[stIndex].elements[1]);
    expect(segments[geIndex].elements[1]).toBe(segments.find((s) => s.id === 'GS')?.elements[5]);
    expect(segments[ieaIndex].elements[1]).toBe(segments[isaIndex].elements[12]);
  });

  it('recomputes SE01 correctly as the number of service lines changes', () => {
    const oneLineCount = buildFullTransaction(simpleClaim, sampleSubmitter, controlNumbers).find((s) => s.id === 'SE')!
      .elements[0];

    const twoLineClaim = { ...dmeClaim, serviceLines: [...dmeClaim.serviceLines, ...dmeClaim.serviceLines] };
    const twoLineCount = buildFullTransaction(twoLineClaim, sampleSubmitter, controlNumbers).find((s) => s.id === 'SE')!
      .elements[0];

    expect(Number(twoLineCount)).toBeGreaterThan(Number(oneLineCount));
  });

  it('round-trips through the serializer without breaking segment count', () => {
    const segments = buildFullTransaction(simpleClaim, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
    const raw = writeSegments(segments);
    const segmentCountInRaw = raw.split('~').filter((s) => s.trim().length > 0).length;
    expect(segmentCountInRaw).toBe(segments.length);
  });

  it('left-justifies ISA06/ISA08 with trailing spaces rather than leading spaces', () => {
    const segments = buildFullTransaction(simpleClaim, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
    const isa = segments.find((s) => s.id === 'ISA')!;
    const senderId = isa.elements[5]; // ISA06
    const receiverId = isa.elements[7]; // ISA08

    expect(senderId).toHaveLength(15);
    expect(senderId.startsWith(sampleSubmitter.submitterId)).toBe(true);
    expect(senderId.trimEnd()).toBe(sampleSubmitter.submitterId);

    expect(receiverId).toHaveLength(15);
    expect(receiverId.startsWith('NCTRACKSBAT')).toBe(true);
    expect(receiverId.trimEnd()).toBe('NCTRACKSBAT');
  });
});

describe('batch transactions (multiple claims in one file)', () => {
  it('writes one ST...SE transaction set per claim inside a single ISA/GS envelope', () => {
    const claims = [simpleClaim, dmeClaim, referringProviderClaim];
    const segments = buildBatchTransaction(claims, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));

    expect(segments.filter((s) => s.id === 'ISA')).toHaveLength(1);
    expect(segments.filter((s) => s.id === 'GS')).toHaveLength(1);
    expect(segments.filter((s) => s.id === 'IEA')).toHaveLength(1);
    expect(segments.filter((s) => s.id === 'GE')).toHaveLength(1);
    expect(segments.filter((s) => s.id === 'ST')).toHaveLength(3);
    expect(segments.filter((s) => s.id === 'SE')).toHaveLength(3);
    expect(segments.filter((s) => s.id === 'BHT')).toHaveLength(3);
  });

  it('gives each transaction a unique, sequential ST02/SE02 control number', () => {
    const claims = [simpleClaim, dmeClaim, referringProviderClaim];
    const segments = buildBatchTransaction(claims, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));

    const stNumbers = segments.filter((s) => s.id === 'ST').map((s) => s.elements[1]);
    const seNumbers = segments.filter((s) => s.id === 'SE').map((s) => s.elements[1]);
    expect(stNumbers).toEqual(['0001', '0002', '0003']);
    expect(seNumbers).toEqual(['0001', '0002', '0003']);
  });

  it('sets GE01 to the number of transaction sets actually included, not hardcoded to 1', () => {
    const claims = [simpleClaim, dmeClaim, referringProviderClaim];
    const segments = buildBatchTransaction(claims, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
    const ge = segments.find((s) => s.id === 'GE')!;
    expect(ge.elements[0]).toBe('3');
  });

  it('computes each SE01 from that transaction\'s own segment count, not a shared/hardcoded value', () => {
    const claims = [simpleClaim, dmeClaim];
    const segments = buildBatchTransaction(claims, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
    const seCounts = segments.filter((s) => s.id === 'SE').map((s) => s.elements[0]);
    // simpleClaim and dmeClaim have different numbers of segments (DME adds PWK + an extra REF*9F).
    expect(seCounts[0]).not.toBe(seCounts[1]);
  });

  it('matches buildFullTransaction exactly for a single claim (batch of one)', () => {
    const single = buildFullTransaction(simpleClaim, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
    const batchOfOne = buildBatchTransaction([simpleClaim], sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
    expect(batchOfOne).toEqual(single);
  });

  it('round-trips a 3-claim batch through the serializer with a consistent total segment count', () => {
    const claims = [simpleClaim, dmeClaim, referringProviderClaim];
    const segments = buildBatchTransaction(claims, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
    const raw = writeSegments(segments);
    const segmentCountInRaw = raw.split('~').filter((s) => s.trim().length > 0).length;
    expect(segmentCountInRaw).toBe(segments.length);
  });
});

describe('rendering provider (2310B)', () => {
  const claimWithRenderingProvider = {
    ...simpleClaim,
    renderingProvider: { npi: '1287382737', taxonomyCode: '103T00000X', name: 'Whitfield', firstName: 'Dana' },
  };

  it('emits a PRV*PE segment carrying the rendering provider taxonomy, right after its NM1', () => {
    const body = buildClaimBody(claimWithRenderingProvider, sampleSubmitter);
    const nm1Index = body.findIndex((s) => s.id === 'NM1' && s.elements[0] === '82');
    expect(nm1Index).toBeGreaterThan(-1);
    const next = body[nm1Index + 1];
    expect(next.id).toBe('PRV');
    expect(next.elements[0]).toBe('PE');
    expect(next.elements[2]).toBe('103T00000X');
  });

  it('does not emit a PRV for the referring provider (2310A)', () => {
    const claim = {
      ...referringProviderClaim,
      renderingProvider: claimWithRenderingProvider.renderingProvider,
    };
    const body = buildClaimBody(claim, sampleSubmitter);
    const dnIndex = body.findIndex((s) => s.id === 'NM1' && s.elements[0] === 'DN');
    expect(body[dnIndex + 1].id).not.toBe('PRV');
  });
});

describe('claim-level REF ordering (must precede HI)', () => {
  it('places REF*9F (claim-level prior auth) before the HI segment', () => {
    const claim = { ...simpleClaim, priorAuthorizationNumber: 'PA12345678' };
    const body = buildClaimBody(claim, sampleSubmitter);
    const refIndex = body.findIndex((s) => s.id === 'REF' && s.elements[0] === '9F');
    const hiIndex = body.findIndex((s) => s.id === 'HI');
    expect(refIndex).toBeGreaterThan(-1);
    expect(refIndex).toBeLessThan(hiIndex);
  });

  it('places REF*P4 (demonstration project) before the HI segment', () => {
    const claim = {
      ...simpleClaim,
      demonstrationProjectMilestone: 'M1',
      serviceLines: [{ ...simpleClaim.serviceLines[0], procedureCode: 'H2023' }],
    };
    const body = buildClaimBody(claim, sampleSubmitter);
    const refIndex = body.findIndex((s) => s.id === 'REF' && s.elements[0] === 'P4');
    const hiIndex = body.findIndex((s) => s.id === 'HI');
    expect(refIndex).toBeGreaterThan(-1);
    expect(refIndex).toBeLessThan(hiIndex);
  });

  it('places both claim-level REFs, then HI, then the 2310 provider loops, in that order', () => {
    const claim = {
      ...referringProviderClaim,
      priorAuthorizationNumber: 'PA12345678',
      renderingProvider: { npi: '1287382737', taxonomyCode: '103T00000X', name: 'Whitfield', firstName: 'Dana' },
    };
    const body = buildClaimBody(claim, sampleSubmitter);
    const refIndex = body.findIndex((s) => s.id === 'REF' && s.elements[0] === '9F');
    const hiIndex = body.findIndex((s) => s.id === 'HI');
    const dnIndex = body.findIndex((s) => s.id === 'NM1' && s.elements[0] === 'DN');
    const renderingIndex = body.findIndex((s) => s.id === 'NM1' && s.elements[0] === '82');

    expect(refIndex).toBeLessThan(hiIndex);
    expect(hiIndex).toBeLessThan(dnIndex);
    expect(dnIndex).toBeLessThan(renderingIndex);
  });
});
