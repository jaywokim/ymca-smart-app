import {
  getPatientName,
  getPatientIdentifier,
  getPatientAddress,
  getPatientPhone,
  getObservationName,
  getObservationValue,
  getVitalType
} from '../../src/utils/helpers.js';

describe('getPatientName', () => {
  it('returns full name when given and family present', () => {
    const patient = { name: [{ given: ['John', 'H'], family: 'Doe' }] };
    expect(getPatientName(patient)).toBe('John H Doe');
  });

  it('handles missing given or family', () => {
    expect(getPatientName({ name: [{ given: ['John'] }] })).toBe('John');
    expect(getPatientName({ name: [{ family: 'Smith' }] })).toBe('Smith');
  });

  it('returns "Unknown" when no name', () => {
    expect(getPatientName({})).toBe('Unknown');
    expect(getPatientName({ name: [] })).toBe('Unknown');
  });
});

describe('getPatientIdentifier', () => {
  it('returns matching identifier value', () => {
    const patient = {
      identifier: [
        { type: { coding: [{ code: 'MR' }] }, value: '123' },
        { type: { coding: [{ code: 'SS' }] }, value: 'ABC' }
      ]
    };
    expect(getPatientIdentifier(patient, 'MR')).toBe('123');
  });

  it('returns null when no matching identifier', () => {
    const patient = {
      identifier: [{ type: { coding: [{ code: 'SS' }] }, value: 'ABC' }]
    };
    expect(getPatientIdentifier(patient, 'MR')).toBeNull();
  });

  it('returns null when identifier array is missing', () => {
    expect(getPatientIdentifier({}, 'MR')).toBeNull();
  });
});

describe('getPatientAddress', () => {
  it('formats address parts correctly', () => {
    const patient = {
      address: [{
        line: ['123 A St'],
        city: 'City',
        state: 'ST',
        postalCode: '12345'
      }]
    };
    expect(getPatientAddress(patient)).toBe('123 A St, City, ST, 12345');
  });

  it('returns "Not available" when no address', () => {
    expect(getPatientAddress({})).toBe('Not available');
    expect(getPatientAddress({ address: [] })).toBe('Not available');
  });
});

describe('getPatientPhone', () => {
  it('returns phone value when present', () => {
    const patient = {
      telecom: [
        { system: 'email', value: 'x@y.com' },
        { system: 'phone', value: '555-1234' }
      ]
    };
    expect(getPatientPhone(patient)).toBe('555-1234');
  });

  it('returns "Not available" when no phone', () => {
    expect(getPatientPhone({ telecom: [] })).toBe('Not available');
    expect(getPatientPhone({})).toBe('Not available');
  });
});

describe('getObservationName', () => {
  it('uses code.text when available', () => {
    expect(getObservationName({ code: { text: 'TextVal' } })).toBe('TextVal');
  });

  it('uses coding[0].display when text missing', () => {
    expect(getObservationName({ code: { coding: [{ display: 'Disp', code: 'C1' }] } })).toBe('Disp');
  });

  it('falls back to coding[0].code if display missing', () => {
    expect(getObservationName({ code: { coding: [{ code: 'C1' }] } })).toBe('C1');
  });

  it('returns "Unknown Observation" when code missing', () => {
    expect(getObservationName({})).toBe('Unknown Observation');
  });
});

describe('getObservationValue', () => {
  it('formats valueQuantity with unit', () => {
    const obs = { valueQuantity: { value: 98.6, unit: 'F' } };
    expect(getObservationValue(obs)).toBe('98.6 F');
  });

  it('handles valueString', () => {
    expect(getObservationValue({ valueString: 'str' })).toBe('str');
  });

  it('handles valueCodeableConcept.text', () => {
    expect(getObservationValue({ valueCodeableConcept: { text: 'txt' } })).toBe('txt');
  });

  it('handles valueCodeableConcept.coding', () => {
    expect(getObservationValue({
      valueCodeableConcept: { coding: [{ display: 'Disp', code: 'C' }] }
    })).toBe('Disp');
  });

  it('handles component array by recursing', () => {
    const comp = {
      code: { coding: [{ display: 'c1' }] },
      valueString: 'v1'
    };
    expect(getObservationValue({ component: [comp] })).toBe('c1: v1');
  });

  it('returns "No value" when no matching fields', () => {
    expect(getObservationValue({})).toBe('No value');
  });
});

describe('getVitalType', () => {
  it('returns known vitalType entry', () => {
    expect(getVitalType('8867-4')).toEqual({ key: 'heartRate', label: 'Heart Rate' });
  });

  it('uses display when unknown code but label includes "vital"', () => {
    expect(getVitalType('X', 'My Vital Sign')).toEqual({ key: 'X', label: 'My Vital Sign' });
  });

  it('returns null when unknown code and display missing "vital"', () => {
    expect(getVitalType('X', 'Other')).toBeNull();
  });
});