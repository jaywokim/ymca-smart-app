const {
  getPatientName,
  getPatientIdentifier,
  getPatientAddress,
  getPatientPhone,
  getObservationName,
  getObservationValue,
  getVitalType,
  formatDate
} = require('../app.js');

describe('Patient Utility Functions', () => {
  test('getPatientName returns full name', () => {
    const patient = { name: [{ given: ['Jane'], family: 'Doe' }] };
    expect(getPatientName(patient)).toBe('Jane Doe');
  });

  test('getPatientName returns Unknown if missing', () => {
    expect(getPatientName({})).toBe('Unknown');
  });

  test('getPatientIdentifier returns correct value', () => {
    const patient = { identifier: [{ type: { coding: [{ code: 'MR' }] }, value: '12345' }] };
    expect(getPatientIdentifier(patient, 'MR')).toBe('12345');
  });

  test('getPatientIdentifier returns null if not found', () => {
    expect(getPatientIdentifier({}, 'MR')).toBeNull();
  });

  // ...add more tests for other utility functions
});