import { jest } from '@jest/globals';

// Mock appConfig before importing task module
await jest.unstable_mockModule('../../src/config/appConfig.js', () => ({
    __esModule: true,
    VITAL_TYPES_URL: '/src/config/vitalTypes.json',
    LOCAL_FHIR_SERVER: 'http://test-fhir:8080/fhir',
}));

// Mock patient.js getPatientName
const mockGetPatientName = jest.fn(() => 'John Doe');
await jest.unstable_mockModule('../../src/fhir/patient.js', () => ({
    __esModule: true,
    getPatientName: mockGetPatientName,
}));

const {
    findLocalPatientId,
    findTaskForPatient,
    fetchCommunicationsForTask,
    loadTaskData,
} = await import('../../src/fhir/task.js');

const SERVER = 'http://test-fhir:8080/fhir';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBundle(resources = []) {
    return {
        resourceType: 'Bundle',
        entry: resources.map(r => ({ resource: r })),
    };
}

function mockFetchOnce(body, ok = true, status = 200) {
    global.fetch.mockResolvedValueOnce({
        ok,
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    });
}

// ---------------------------------------------------------------------------
// findLocalPatientId
// ---------------------------------------------------------------------------

describe('findLocalPatientId', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        mockGetPatientName.mockReturnValue('John Doe');
    });

    it('returns ID on Strategy 1 (identifier + system match)', async () => {
        const patient = { id: 'ehr-123', name: [{ given: ['John'], family: 'Doe' }] };
        mockFetchOnce(makeBundle([{ resourceType: 'Patient', id: 'local-123' }]));

        const result = await findLocalPatientId(patient, SERVER);
        expect(result).toBe('local-123');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('smart-health-it.org%2Fpatient-id')
        );
    });

    it('falls through to Strategy 2 (identifier value only) when system search misses', async () => {
        const patient = { id: 'ehr-456', name: [{ given: ['Jane'], family: 'Doe' }] };
        mockFetchOnce(makeBundle([]));                                                 // S1 miss
        mockFetchOnce(makeBundle([{ resourceType: 'Patient', id: 'local-456' }]));    // S2 hit

        const result = await findLocalPatientId(patient, SERVER);
        expect(result).toBe('local-456');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('falls through to Strategy 3 (existing identifiers) when S1 and S2 miss', async () => {
        const patient = {
            id: 'ehr-789',
            name: [{ given: ['Bob'], family: 'Smith' }],
            identifier: [{ system: 'http://hospital.org/mrn', value: 'MRN-001' }]
        };
        mockFetchOnce(makeBundle([]));                                                 // S1 miss
        mockFetchOnce(makeBundle([]));                                                 // S2 miss
        mockFetchOnce(makeBundle([{ resourceType: 'Patient', id: 'local-789' }]));    // S3 existing identifier hit

        const result = await findLocalPatientId(patient, SERVER);
        expect(result).toBe('local-789');
        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(global.fetch).toHaveBeenLastCalledWith(
            expect.stringContaining('MRN-001')
        );
    });

    it('falls through to Strategy 4 (name) when all identifier searches miss', async () => {
        const patient = { id: 'ehr-321', name: [{ given: ['Alice'], family: 'Jones' }] };
        mockGetPatientName.mockReturnValue('Alice Jones');
        mockFetchOnce(makeBundle([])); // S1
        mockFetchOnce(makeBundle([])); // S2
        // No existing identifiers, so S3 is skipped
        mockFetchOnce(makeBundle([{ resourceType: 'Patient', id: 'local-321' }])); // S4 name hit

        const result = await findLocalPatientId(patient, SERVER);
        expect(result).toBe('local-321');
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/Patient?name='));
    });

    it('returns null when all four strategies find nothing', async () => {
        const patient = { id: 'ehr-999', name: [{ given: ['Unknown'], family: 'Person' }] };
        mockFetchOnce(makeBundle([])); // S1
        mockFetchOnce(makeBundle([])); // S2
        // No existing identifiers
        mockFetchOnce(makeBundle([])); // S4 name

        const result = await findLocalPatientId(patient, SERVER);
        expect(result).toBeNull();
    });

    it('returns null and does not throw when fetch fails', async () => {
        const patient = { id: 'ehr-err', name: [{ given: ['John'], family: 'Doe' }] };
        global.fetch.mockRejectedValue(new Error('Network error'));

        const result = await findLocalPatientId(patient, SERVER);
        expect(result).toBeNull();
    });

    it('skips identifier strategies and uses name when patient has no id or identifiers', async () => {
        const patient = { name: [{ given: ['No'], family: 'Id' }] };
        mockGetPatientName.mockReturnValue('No Id');
        mockFetchOnce(makeBundle([{ resourceType: 'Patient', id: 'local-noid' }]));

        const result = await findLocalPatientId(patient, SERVER);
        expect(result).toBe('local-noid');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/Patient?name='));
    });
});

// ---------------------------------------------------------------------------
// findTaskForPatient
// ---------------------------------------------------------------------------

describe('findTaskForPatient', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    it('Strategy 1: returns Task when found via patient reference', async () => {
        const task = { resourceType: 'Task', id: 'task-001', status: 'in-progress' };
        mockFetchOnce(makeBundle([task])); // Task?patient=

        const result = await findTaskForPatient('local-123', SERVER);
        expect(result).toEqual(task);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('Strategy 2: falls through to focus= search after empty patient result', async () => {
        const task = { resourceType: 'Task', id: 'task-002', status: 'completed' };
        const sr = { resourceType: 'ServiceRequest', id: 'sr-001' };

        mockFetchOnce(makeBundle([]));          // Task?patient= → empty
        mockFetchOnce(makeBundle([sr]));         // ServiceRequest?subject= → one result
        mockFetchOnce(makeBundle([task]));        // Task?focus=ServiceRequest/sr-001 → found

        const result = await findTaskForPatient('local-123', SERVER);
        expect(result).toEqual(task);
    });

    it('Strategy 3: falls through to based-on= search after empty focus result', async () => {
        const task = { resourceType: 'Task', id: 'task-003', status: 'requested' };
        const sr = { resourceType: 'ServiceRequest', id: 'sr-002' };

        mockFetchOnce(makeBundle([]));          // Task?patient= → empty
        mockFetchOnce(makeBundle([sr]));         // ServiceRequest?subject= → one result
        mockFetchOnce(makeBundle([]));           // Task?focus= → empty
        mockFetchOnce(makeBundle([task]));        // Task?based-on= → found

        const result = await findTaskForPatient('local-123', SERVER);
        expect(result).toEqual(task);
    });

    it('returns null when all strategies find nothing', async () => {
        const sr = { resourceType: 'ServiceRequest', id: 'sr-003' };

        mockFetchOnce(makeBundle([]));   // Task?patient=
        mockFetchOnce(makeBundle([sr])); // ServiceRequest?subject=
        mockFetchOnce(makeBundle([]));   // Task?focus=
        mockFetchOnce(makeBundle([]));   // Task?based-on=
        mockFetchOnce(makeBundle([]));   // Communication?based-on= (Strategy 4)

        const result = await findTaskForPatient('local-123', SERVER);
        expect(result).toBeNull();
    });

    it('Strategy 4: finds Task via Communication.partOf after ServiceRequest lookup', async () => {
        const task = { resourceType: 'Task', id: 'task-004', status: 'in-progress' };
        const sr = { resourceType: 'ServiceRequest', id: 'sr-004' };
        const comm = {
            resourceType: 'Communication',
            id: 'c-s4',
            basedOn: [{ reference: 'ServiceRequest/sr-004' }],
            partOf: [{ reference: 'Task/task-004' }],
        };

        mockFetchOnce(makeBundle([]));         // Task?patient= → empty
        mockFetchOnce(makeBundle([sr]));        // ServiceRequest?subject=
        mockFetchOnce(makeBundle([]));          // Task?focus= → empty
        mockFetchOnce(makeBundle([]));          // Task?based-on= → empty
        mockFetchOnce(makeBundle([comm]));      // Communication?based-on= → found
        // Direct Task fetch
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(task),
        });

        const result = await findTaskForPatient('local-123', SERVER);
        expect(result).toEqual(task);
    });

    it('returns null when no ServiceRequests exist and Strategy 1 fails', async () => {
        mockFetchOnce(makeBundle([]));   // Task?patient= → empty
        mockFetchOnce(makeBundle([]));   // ServiceRequest?subject= → empty

        const result = await findTaskForPatient('local-123', SERVER);
        expect(result).toBeNull();
    });

    it('throws when fetch rejects unexpectedly', async () => {
        global.fetch.mockRejectedValueOnce(new Error('FHIR error'));
        await expect(findTaskForPatient('local-123', SERVER)).rejects.toThrow(
            'Failed to search for Task'
        );
    });
});

// ---------------------------------------------------------------------------
// fetchCommunicationsForTask
// ---------------------------------------------------------------------------

describe('fetchCommunicationsForTask', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    it('returns array of Communication resources', async () => {
        const comm1 = { resourceType: 'Communication', id: 'c-001', sent: '2026-01-01', payload: [{ contentString: 'Hello' }] };
        const comm2 = { resourceType: 'Communication', id: 'c-002', sent: '2026-01-02', payload: [{ contentString: 'Follow up' }] };
        mockFetchOnce(makeBundle([comm1, comm2]));

        const result = await fetchCommunicationsForTask('task-001', SERVER);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('c-001');
        expect(result[1].id).toBe('c-002');
        expect(global.fetch).toHaveBeenCalledWith(
            `${SERVER}/Communication?part-of=Task/task-001&_sort=sent`
        );
    });

    it('returns empty array when bundle has no entries', async () => {
        mockFetchOnce(makeBundle([]));
        const result = await fetchCommunicationsForTask('task-001', SERVER);
        expect(result).toEqual([]);
    });

    it('returns empty array on non-OK response', async () => {
        mockFetchOnce({}, false, 404);
        const result = await fetchCommunicationsForTask('task-001', SERVER);
        expect(result).toEqual([]);
    });

    it('throws on fetch rejection', async () => {
        global.fetch.mockRejectedValueOnce(new Error('timeout'));
        await expect(fetchCommunicationsForTask('task-001', SERVER)).rejects.toThrow(
            'Failed to fetch Communications for Task'
        );
    });
});

// ---------------------------------------------------------------------------
// loadTaskData
// ---------------------------------------------------------------------------

describe('loadTaskData', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        mockGetPatientName.mockReturnValue('John Doe');
    });

    it('returns { task, communications } on success', async () => {
        const localPatient = { resourceType: 'Patient', id: 'local-p1' };
        const task = { resourceType: 'Task', id: 'task-A', status: 'in-progress' };
        const comm = { resourceType: 'Communication', id: 'c-A', sent: '2026-03-01', payload: [{ contentString: 'Note 1' }] };

        mockFetchOnce(makeBundle([localPatient]));    // Patient?name=
        mockFetchOnce(makeBundle([task]));             // Task?patient= (Strategy 1)
        mockFetchOnce(makeBundle([comm]));             // Communication?part-of=Task/task-A

        const patient = { name: [{ given: ['John'], family: 'Doe' }] };
        const result = await loadTaskData(patient, SERVER);

        expect(result).not.toBeNull();
        expect(result.task.id).toBe('task-A');
        expect(result.communications).toHaveLength(1);
        expect(result.communications[0].id).toBe('c-A');
    });

    it('returns null when patient not found on local server', async () => {
        mockFetchOnce(makeBundle([])); // Patient?name= → empty

        const patient = { name: [{ given: ['Unknown'], family: 'Patient' }] };
        const result = await loadTaskData(patient, SERVER);
        expect(result).toBeNull();
    });

    it('returns null when no Task found for patient', async () => {
        const localPatient = { resourceType: 'Patient', id: 'local-p2' };
        const sr = { resourceType: 'ServiceRequest', id: 'sr-x' };

        mockFetchOnce(makeBundle([localPatient])); // Patient?name=
        mockFetchOnce(makeBundle([]));              // Task?patient= → empty
        mockFetchOnce(makeBundle([sr]));            // ServiceRequest?subject=
        mockFetchOnce(makeBundle([]));              // Task?focus=
        mockFetchOnce(makeBundle([]));              // Task?based-on=
        mockFetchOnce(makeBundle([]));              // Communication?based-on= (Strategy 4)

        const patient = { name: [{ given: ['John'], family: 'Doe' }] };
        const result = await loadTaskData(patient, SERVER);
        expect(result).toBeNull();
    });

    it('throws with a descriptive message on unexpected errors', async () => {
        mockFetchOnce(makeBundle([{ id: 'local-p3' }])); // Patient?name=
        global.fetch.mockRejectedValueOnce(new Error('internal failure'));

        const patient = { name: [{ given: ['John'], family: 'Doe' }] };
        await expect(loadTaskData(patient, SERVER)).rejects.toThrow('Failed to load Task data');
    });
});
