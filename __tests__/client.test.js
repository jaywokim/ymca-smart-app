import { describe, beforeAll, beforeEach, afterAll, it, expect, jest } from '@jest/globals';

describe('FHIR Client', () => {
  let initializeFhirClient, getFhirClient;

  beforeAll(async () => {
    // Silence console output (prevent FHIR client init logs/errors from cluttering test results)
    // The Client throws errors on failed init which is fine since we want to unit test but not integration test here
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock the global FHIR (loaded via CDN in production)
    globalThis.FHIR = { oauth2: { ready: jest.fn() } };
    ({ initializeFhirClient, getFhirClient } = await import('../src/fhir/client.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Do NOT reset modules here so fhirClient state is preserved
  });

  afterAll(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  it('initializeFhirClient → returns the fake client on success', async () => {
    const fakeClient = { user: 'test' };
    globalThis.FHIR.oauth2.ready.mockResolvedValue(fakeClient);
    const client = await initializeFhirClient();
    expect(client).toBe(fakeClient);
  });

  it('initializeFhirClient → throws on failure', async () => {
    globalThis.FHIR.oauth2.ready.mockRejectedValue(new Error('fail'));
    await expect(initializeFhirClient())
      .rejects
      .toThrow('Failed to initialize FHIR client');
  });

  it('getFhirClient → throws if not initialized', async () => {
    // Reset module state so fhirClient is null
    jest.resetModules();
    globalThis.FHIR = { oauth2: { ready: jest.fn() } };
    const { getFhirClient } = await import('../src/fhir/client.js');

    expect(() => getFhirClient()).toThrow('FHIR client is not initialized');
  });

  it('getFhirClient → returns initialized client', async () => {
    const fakeClient = { user: 'test' };
    globalThis.FHIR.oauth2.ready.mockResolvedValue(fakeClient);
    await initializeFhirClient();
    expect(getFhirClient()).toBe(fakeClient);
  });
});