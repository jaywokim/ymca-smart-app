import { jest } from '@jest/globals';

// src/fhir/referral.test.js

const mockGetPatientName = jest.fn();

// 1. Mock getPatientName before loading referral module
await jest.unstable_mockModule('../../src/utils/helpers.js', () => ({
    __esModule: true,
    getPatientName: mockGetPatientName
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
    });

    it('should default notes to empty and set reasonCode text', () => {
        const localPatient = { id: '456' };
        const svc = createServiceRequest(localPatient, 'Swim', 'routine');
        expect(svc.note).toEqual([]);
        expect(svc.reasonCode[0].text).toContain('Patient referral for Swim');
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
    });

    it('throws if patientData is missing', async () => {
        await expect(submitYmcaReferral(null, null, 'Yoga'))
            .rejects.toThrow('Patient data not available');
    });

    it('submits referral when flow succeeds', async () => {
        const localPat = { id: 'p1' };
        global.fetch
            // search patient
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ entry: [{ resource: localPat }] })
            })
            // post ServiceRequest
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: 'r1' })
            });

        const result = await submitYmcaReferral(null, {}, 'Swim', 'routine', 'notes');
        expect(result).toEqual({ id: 'r1' });
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[1][0]).toMatch(/\/ServiceRequest$/);
        expect(global.fetch.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    });

    it('throws on server POST error', async () => {
        const localPat = { id: 'p2' };
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ entry: [{ resource: localPat }] })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Server down')
            });

        await expect(submitYmcaReferral(null, {}, 'Run'))
            .rejects.toThrow('FHIR server error: 500 - Server down');
    });
});