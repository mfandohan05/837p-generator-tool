import { describe, expect, it } from 'vitest';
import { buildFullTransaction } from '../src/builders/claimBuilder';
import { writeSegments } from '../src/serializers/segmentWriter';
import { parseX12 } from '../src/parsers/x12Parser';
import { reconstructClaim } from '../src/parsers/claimParser';
import { dmeClaim, referringProviderClaim, sampleSubmitter, simpleClaim } from '../src/fixtures/sampleClaims';
import type { Claim } from '../src/types/domain';

const controlNumbers = {
  interchangeControlNumber: '000000001',
  groupControlNumber: '1',
  transactionControlNumber: '0001',
};

const renderingProviderClaim: Claim = {
  ...referringProviderClaim,
  claimId: 'CLAIM0004',
  renderingProvider: { npi: '1287382737', taxonomyCode: '103T00000X', name: 'Whitfield', firstName: 'Dana' },
};

const fixtures = [
  { name: 'simple claim', claim: simpleClaim },
  { name: 'DME claim', claim: dmeClaim },
  { name: 'referring provider claim', claim: referringProviderClaim },
  { name: 'rendering provider claim', claim: renderingProviderClaim },
];

describe('round-trip: generate -> parse -> rebuild', () => {
  for (const { name, claim } of fixtures) {
    it(`rebuilds an equivalent domain object for the ${name} fixture`, () => {
      const segments = buildFullTransaction(claim, sampleSubmitter, controlNumbers, new Date('2024-03-15T10:00:00Z'));
      const raw = writeSegments(segments);

      const parsed = parseX12(raw);
      const { claim: rebuilt, submitter: rebuiltSubmitter } = reconstructClaim(parsed);

      // The referring provider's taxonomy code is not part of the 837P wire
      // format (2310A carries no PRV segment - only the billing provider's
      // 2000A PRV and the rendering provider's 2310B PRV do), SBR09 is
      // always written (defaulting to "MC" when the claim didn't set one),
      // and HI diagnosis codes drop their decimal point on the wire
      // (X12/HIPAA convention) - normalize to match.
      const expectedClaim: Claim = {
        ...claim,
        referringProvider: claim.referringProvider && { ...claim.referringProvider, taxonomyCode: '' },
        claimFilingIndicator: claim.claimFilingIndicator ?? 'MC',
        diagnosisCodes: claim.diagnosisCodes.map((dx) => ({ ...dx, code: dx.code.replace('.', '') })),
      };

      expect(rebuilt).toEqual(expectedClaim);
      expect(rebuiltSubmitter).toEqual(sampleSubmitter);
    });
  }
});
