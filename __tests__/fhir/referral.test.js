import { jest } from '@jest/globals';

// Mock appConfig so tests don't depend on the deployment placeholder value
// in src/config/appConfig.js (REFERRAL_FHIR_SERVER).
await jest.unstable_mockModule('../../src/config/appConfig.js', () => ({
  __esModule: true,
  VITAL_TYPES_URL: '/src/config/vitalTypes.json',
  REFERRAL_FHIR_SERVER: 'http://localhost:8080/fhir',
}));

// --- new: mock FHIR client before loading referral module ---
const mockRequest = jest.fn((url, opts) =>
  global.fetch(url, opts).then(async resp => {
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`FHIR server error: ${resp.status} - ${txt}`);
    }
    return resp.json();
  })
);

await jest.unstable_mockModule('../../src/fhir/client.js', () => ({
  __esModule: true,
  getFhirClient: () => ({ request: mockRequest })
}));
// --- end new mock ---

// src/fhir/referral.test.js

const mockGetPatientName = jest.fn();

// 1. Mock functions from patient.js before loading referral module
await jest.unstable_mockModule('../../src/fhir/patient.js', () => ({
    __esModule: true,
    getPatientName: mockGetPatientName,
    formatPatientForReferral: jest.fn((p) => p) // mock it to pass through
}));

// 2. Import module under test
const referralModule = await import('../../src/fhir/referral.js');
const {
    submitYmcaReferral,
    ensurePatientInLocalFhir,
    createPatientInLocalFhir,
    createServiceRequest
} = referralModule;

// 3. Tests
describe('createServiceRequest', () => {
    beforeEach(() => {
        mockGetPatientName.mockClear().mockReturnValue('John Doe');
    });

    it('should include notes when provided', () => {
        const localPatient = { id: '123' };
        const svc = createServiceRequest(localPatient, 'Yoga', 'urgent', 'Take notes');
        expect(svc.resourceType).toBe('ServiceRequest');
        expect(svc.priority).toBe('urgent');
        expect(svc.code.coding[0].code).toBe('Yoga');
        expect(svc.note).toHaveLength(1);
        expect(svc.note[0].text).toBe('Take notes');
        expect(svc.subject.reference).toBe('Patient/123');
        expect(mockGetPatientName).toHaveBeenCalledWith(localPatient);
        expect(svc.reasonReference).toEqual([]);
    });

    it('should default notes to empty and set reasonCode text', () => {
        const localPatient = { id: '456' };
        const svc = createServiceRequest(localPatient, 'Swim', 'routine');
        expect(svc.note).toEqual([]);
        expect(svc.reasonCode[0].text).toContain('Patient referral for Swim');
        expect(svc.reasonReference).toEqual([]);
    });

    it('includes provided reasonReference entries', () => {
        const localPatient = { id: '789' };
        const sourceRefs = [
            { reference: 'Condition/123', display: 'Type 2 diabetes' }
        ];
        const svc = createServiceRequest(localPatient, 'Swim', 'routine', null, sourceRefs);
        expect(svc.reasonReference).toEqual([
            { reference: 'Condition/123', display: 'Type 2 diabetes', type: 'Condition' }
        ]);
    });
});

describe('createPatientInLocalFhir', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    it('posts patient and returns created resource', async () => {
        const patientData = {
            id: 'abc',
            name: [{ given: ['A'], family: 'B' }],
            gender: 'female',
            birthDate: '2000-01-01',
            address: [],
            telecom: []
        };
        const created = { id: 'new-pat' };
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(created)
        });

        const result = await createPatientInLocalFhir(patientData);

        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:8080/fhir/Patient',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/fhir+json',
                    'Accept': 'application/fhir+json'
                }),
                // check that the body string includes the Patient resourceType
                body: expect.stringContaining('"resourceType":"Patient"')
            })
        );
        expect(result).toEqual(created);
    });

    it('throws on non-ok response', async () => {
        const patientData = { id: 'abc' };
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: () => Promise.resolve('error text')
        });
        await expect(createPatientInLocalFhir(patientData))
            .rejects.toThrow('Failed to create patient in local HAPI FHIR: 400 - error text');
    });
});

describe('ensurePatientInLocalFhir', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        mockGetPatientName.mockClear().mockReturnValue('Alice');
    });

    it('returns existing patient when found', async () => {
        const existing = { id: 'ex' };
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ entry: [{ resource: existing }] })
        });

        const result = await ensurePatientInLocalFhir(null, { });
        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:8080/fhir/Patient?name=Alice',
            expect.any(Object)
        );
        expect(result).toEqual(existing);
    });

    it('creates new patient when not found', async () => {
        const newPat = { id: 'np' };
        // 1st fetch = search → empty bundle
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ entry: [] })
        });
        // 2nd fetch = createPatientInLocalFhir POST → returns newPat
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(newPat)
        });

        const result = await ensurePatientInLocalFhir(null, {});
        // should have called search then POST
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[0][0]).toMatch(/\/Patient\?name=Alice$/);
        expect(global.fetch.mock.calls[1][0]).toMatch(/\/Patient$/);
        expect(result).toEqual(newPat);
    });

    it('throws if fetch errors', async () => {
        global.fetch.mockRejectedValue(new Error('fail'));
        await expect(ensurePatientInLocalFhir(null, {}))
            .rejects.toThrow('Failed to ensure patient exists in local HAPI FHIR: fail');
    });
});

describe('submitYmcaReferral', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        mockRequest.mockClear();
    });

    it('throws if patientData is missing', async () => {
        await expect(submitYmcaReferral(null, null, 'Yoga'))
            .rejects.toThrow('Patient data not available');
    });

    it('submits referral when flow succeeds', async () => {
        const localPat = { id: 'p1' };
        const conditionResource = {
            resourceType: 'Condition',
            id: 'cond-1',
            code: {
                text: 'Type 2 diabetes',
                coding: [
                    {
                        code: '44054006',
                        display: 'Type 2 diabetes'
                    }
                ]
            }
        };
        global.fetch.mockImplementation((url, opts) => {
            if (url.includes('Patient?name=')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ entry: [{ resource: localPat }] })
                });
            }
            if (url.includes('Condition?patient=')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ resourceType: 'Bundle', entry: [{ resource: conditionResource }] })
                });
            }
            if (url.endsWith('/ServiceRequest')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ id: 'r1' })
                });
            }
            return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
        });

        const patientPayload = { id: 'remote-1' };
        const result = await submitYmcaReferral(patientPayload, 'Swim', 'routine', 'notes');
        expect(result).toEqual({ id: 'r1' });
        expect(global.fetch).toHaveBeenCalledTimes(3);
        const serviceRequestCall = global.fetch.mock.calls.find(call => call[0].includes('/ServiceRequest'));
        expect(serviceRequestCall).toBeDefined();
        expect(serviceRequestCall[1]).toMatchObject({ method: 'POST' });
        expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('Condition?patient='));
        const serviceRequestBody = JSON.parse(serviceRequestCall[1].body);
        expect(serviceRequestBody.reasonReference).toEqual([
            expect.objectContaining({ reference: 'Condition/cond-1', display: 'Type 2 diabetes' })
        ]);
    });

    it('throws on server POST error', async () => {
        const localPat = { id: 'p2' };
        const conditionResource = {
            resourceType: 'Condition',
            id: 'cond-2',
            code: {
                text: 'Type 1 diabetes',
                coding: [
                    {
                        code: '46635009',
                        display: 'Type 1 diabetes'
                    }
                ]
            }
        };
        global.fetch.mockImplementation((url, opts) => {
            if (url.includes('Patient?name=')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ entry: [{ resource: localPat }] })
                });
            }
            if (url.includes('Condition?patient=')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ resourceType: 'Bundle', entry: [{ resource: conditionResource }] })
                });
            }
            if (url.endsWith('/ServiceRequest')) {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    text: () => Promise.resolve('Server down')
                });
            }
            return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
        });

        const patientPayload = { id: 'remote-2' };
        await expect(submitYmcaReferral(patientPayload, 'Run'))
            .rejects.toThrow('FHIR server error: 500 - Server down');
    });
});