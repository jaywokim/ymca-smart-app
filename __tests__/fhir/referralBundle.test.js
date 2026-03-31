import { jest } from '@jest/globals';

// Mock the fhir client before importing the module under test
const mockRequest = jest.fn(async (url) => {
  // ServiceRequest search
  if (url.startsWith('ServiceRequest?')) {
    return {
      resourceType: 'Bundle',
      entry: [
        { resource: {
          resourceType: 'ServiceRequest',
          id: 'sr1',
          requester: { reference: 'Practitioner/pr1' },
          performer: { reference: 'Organization/org1' },
          supportingInfo: [{ reference: 'Observation/obs1' }]
        }}
      ]
    };
  }

  // Patient by id
  if (url === 'Patient/pat1') {
    return { resourceType: 'Patient', id: 'pat1' };
  }

  // Conditions search -> empty
  if (url.startsWith('Condition?')) {
    return { resourceType: 'Bundle', entry: [] };
  }

  // Coverage search -> empty
  if (url.startsWith('Coverage?')) {
    return { resourceType: 'Bundle', entry: [] };
  }

  // Observations - vital signs return obs1
  if (url.startsWith('Observation?') && url.includes('category=vital-signs')) {
    return { resourceType: 'Bundle', entry: [ { resource: { resourceType: 'Observation', id: 'obs1' } } ] };
  }

  // Observations laboratory -> empty
  if (url.startsWith('Observation?') && url.includes('category=laboratory')) {
    return { resourceType: 'Bundle', entry: [] };
  }

  // Direct resource fetches
  if (url === 'Practitioner/pr1') {
    return { resourceType: 'Practitioner', id: 'pr1' };
  }
  if (url === 'Organization/org1') {
    return { resourceType: 'Organization', id: 'org1' };
  }
  if (url === 'Observation/obs1') {
    return { resourceType: 'Observation', id: 'obs1' };
  }

  // Fallback empty bundle
  return { resourceType: 'Bundle', entry: [] };
});

await jest.unstable_mockModule('../../src/fhir/client.js', () => ({
  __esModule: true,
  getFhirClient: () => ({ request: mockRequest })
}));

const mod = await import('../../src/fhir/referralBundle.js');
const { buildReferralBundle } = mod;

describe('buildReferralBundle', () => {
  beforeEach(() => {
    mockRequest.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it('assembles a bundle including ServiceRequest, Patient, Practitioner, Organization, and Observation', async () => {
    const bundle = await buildReferralBundle('pat1');
    expect(bundle).toBeDefined();
    expect(bundle.resourceType).toBe('Bundle');
    const types = bundle.entry.map(e => e.resource.resourceType).sort();
    expect(types).toEqual(expect.arrayContaining(['ServiceRequest', 'Patient', 'Practitioner', 'Organization', 'Coverage', 'Observation']));
    // Expect 7 unique entries since we are generating automatic Organization and Coverage fallbacks
    expect(bundle.entry.length).toBe(7);
  });
});
