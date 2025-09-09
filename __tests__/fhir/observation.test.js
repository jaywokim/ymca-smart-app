import { jest } from '@jest/globals';

//
// first, set up mocks *before* loading anything else
//
const mockRequest = jest.fn();
const mockClient = { request: mockRequest };

await jest.unstable_mockModule('../../src/fhir/client.js', () => ({
  __esModule: true,
  getFhirClient: () => mockClient
}));

await jest.unstable_mockModule('../../src/ui/display.js', () => ({
  __esModule: true,
  displayVitalSigns:    jest.fn(),
  displayEmptyVitals:   jest.fn(),
  displayObservations:  jest.fn(),
  displayEmptyObservations: jest.fn()
}));

// now dynamically import the module under test
const {
  loadVitalSigns,
  loadObservations,
  getObservationName,
  getObservationValue
} = await import('../../src/fhir/observation.js');

// and grab the mocks you just defined
const { getFhirClient } = await import('../../src/fhir/client.js');
const {
  displayVitalSigns,
  displayEmptyVitals,
  displayObservations,
  displayEmptyObservations
} = await import('../../src/ui/display.js');

describe('getObservationName', () => {
  it('returns code.text if present', () => {
    expect(getObservationName({ code: { text: 'BP' } })).toBe('BP');
  });
  it('returns coding[0].display if text missing', () => {
    expect(getObservationName({ code: { coding: [{ display: 'HR' }] } })).toBe('HR');
  });
  it('returns coding[0].code if display/text missing', () => {
    expect(getObservationName({ code: { coding: [{ code: '8867-4' }] } })).toBe('8867-4');
  });
  it('returns Unknown Observation if code missing', () => {
    expect(getObservationName({})).toBe('Unknown Observation');
  });
});

describe('getObservationValue', () => {
  it('returns valueQuantity with unit', () => {
    expect(getObservationValue({ valueQuantity: { value: 120, unit: 'mmHg' } })).toBe('120 mmHg');
  });
  it('falls back to code if unit missing', () => {
    expect(getObservationValue({ valueQuantity: { value: 70, code: 'kg' } })).toBe('70 kg');
  });
  it('returns valueString', () => {
    expect(getObservationValue({ valueString: 'Positive' })).toBe('Positive');
  });
  it('returns valueCodeableConcept.text if present', () => {
    expect(getObservationValue({
      valueCodeableConcept: { text: 'High', coding: [{ display: 'Low'}] }
    })).toBe('High');
  });
  it('returns valueCodeableConcept.display if text missing', () => {
    expect(getObservationValue({
      valueCodeableConcept: { coding: [{ display: 'Normal' }] }
    })).toBe('Normal');
  });
  it('falls back to valueCodeableConcept.code if display/text missing', () => {
    expect(getObservationValue({
      valueCodeableConcept: { coding: [{ code: 'C123' }] }
    })).toBe('C123');
  });
  it('returns joined component values', () => {
    const obs = {
      component: [
        { code: { text: 'Sys' }, valueQuantity: { value: 120, unit: 'mmHg' } },
        { code: { text: 'Dia' }, valueQuantity: { value: 80, unit: 'mmHg' } }
      ]
    };
    expect(getObservationValue(obs)).toBe('Sys: 120 mmHg, Dia: 80 mmHg');
  });
  it('returns No value for nothing else', () => {
    expect(getObservationValue({})).toBe('No value');
  });
});

describe('loadVitalSigns', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('fetches & displays when entries exist', async () => {
    mockRequest.mockResolvedValue({ entry: [{ foo: 1 }] });
    await loadVitalSigns('pat1');
    expect(getFhirClient()).toBe(mockClient);
    expect(mockRequest).toHaveBeenCalledWith(
      'Observation?patient=pat1&category=vital-signs&_sort=-date&_count=10'
    );
    expect(displayVitalSigns).toHaveBeenCalledWith([{ foo: 1 }]);
  });

  it('calls displayEmptyVitals when no entries', async () => {
    mockRequest.mockResolvedValue({ entry: [] });
    await loadVitalSigns('pat2');
    expect(displayEmptyVitals).toHaveBeenCalled();
  });

  it('throws on client error', async () => {
    mockRequest.mockRejectedValue(new Error('fail'));
    await expect(loadVitalSigns('pat3'))
      .rejects.toThrow('Unable to load vital signs');
  });
});

describe('loadObservations', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('fetches & displays when entries exist', async () => {
    mockRequest.mockResolvedValue({ entry: [{ bar: 2 }] });
    await loadObservations('patA');
    expect(mockRequest).toHaveBeenCalledWith(
      'Observation?patient=patA&_sort=-date&_count=20'
    );
    expect(displayObservations).toHaveBeenCalledWith([{ bar: 2 }]);
  });

  it('calls displayEmptyObservations when no entries', async () => {
    mockRequest.mockResolvedValue({ entry: [] });
    await loadObservations('patB');
    expect(displayEmptyObservations).toHaveBeenCalled();
  });

  it('throws on client error', async () => {
    mockRequest.mockRejectedValue(new Error('oops'));
    await expect(loadObservations('patC'))
      .rejects.toThrow('Unable to load observations');
  });
});
