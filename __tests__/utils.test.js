const {
  getPatientName,
  getPatientIdentifier,
  getPatientAddress,
  getPatientPhone,
  getObservationName,
  getObservationValue,
  getVitalType,
  formatDate
} = require('../src/app.js');

describe('Patient Utility Functions', () => {
  describe('getPatientName', () => {
    it('returns full name when given and family are present', () => {
      const patient = { name: [{ given: ['Jane', 'A.'], family: 'Doe' }] };
      expect(getPatientName(patient)).toBe('Jane A. Doe');
    });
    it('returns family name only if given is missing', () => {
      const patient = { name: [{ family: 'Doe' }] };
      expect(getPatientName(patient)).toBe('Doe');
    });
    it('returns given name only if family is missing', () => {
      const patient = { name: [{ given: ['Jane'] }] };
      expect(getPatientName(patient)).toBe('Jane');
    });
    it('returns Unknown if name array is empty', () => {
      const patient = { name: [] };
      expect(getPatientName(patient)).toBe('Unknown');
    });
    it('returns Unknown if name is missing', () => {
      expect(getPatientName({})).toBe('Unknown');
    });
  });

  describe('getPatientIdentifier', () => {
    it('returns identifier value for matching type', () => {
      const patient = {
        identifier: [
          { type: { coding: [{ code: 'MR' }] }, value: '12345' },
          { type: { coding: [{ code: 'SS' }] }, value: '999-99-9999' }
        ]
      };
      expect(getPatientIdentifier(patient, 'MR')).toBe('12345');
      expect(getPatientIdentifier(patient, 'SS')).toBe('999-99-9999');
    });
    it('returns null if no identifier matches type', () => {
      const patient = {
        identifier: [
          { type: { coding: [{ code: 'MR' }] }, value: '12345' }
        ]
      };
      expect(getPatientIdentifier(patient, 'SS')).toBeNull();
    });
    it('returns null if identifier is missing', () => {
      expect(getPatientIdentifier({}, 'MR')).toBeNull();
    });
  });

  describe('getPatientAddress', () => {
    it('returns formatted address with all fields', () => {
      const patient = {
        address: [{
          line: ['123 Main St', 'Apt 4'],
          city: 'Springfield',
          state: 'IL',
          postalCode: '62704'
        }]
      };
      expect(getPatientAddress(patient)).toBe('123 Main St, Apt 4, Springfield, IL, 62704');
    });
    it('returns formatted address with partial fields', () => {
      const patient = {
        address: [{
          line: ['456 Oak Ave'],
          city: 'Metropolis'
        }]
      };
      expect(getPatientAddress(patient)).toBe('456 Oak Ave, Metropolis');
    });
    it('returns Not available if address is empty', () => {
      const patient = { address: [] };
      expect(getPatientAddress(patient)).toBe('Not available');
    });
    it('returns Not available if address is missing', () => {
      expect(getPatientAddress({})).toBe('Not available');
    });
  });

  describe('getPatientPhone', () => {
    it('returns phone value if present', () => {
      const patient = {
        telecom: [
          { system: 'email', value: 'test@example.com' },
          { system: 'phone', value: '555-1234' }
        ]
      };
      expect(getPatientPhone(patient)).toBe('555-1234');
    });
    it('returns Not available if no phone entry', () => {
      const patient = {
        telecom: [
          { system: 'email', value: 'test@example.com' }
        ]
      };
      expect(getPatientPhone(patient)).toBe('Not available');
    });
    it('returns Not available if telecom is missing', () => {
      expect(getPatientPhone({})).toBe('Not available');
    });
  });

  describe('getObservationName', () => {
    it('returns code.text if present', () => {
      const obs = { code: { text: 'Blood Pressure' } };
      expect(getObservationName(obs)).toBe('Blood Pressure');
    });
    it('returns code.coding[0].display if text is missing', () => {
      const obs = { code: { coding: [{ display: 'Heart Rate' }] } };
      expect(getObservationName(obs)).toBe('Heart Rate');
    });
    it('returns code.coding[0].code if display and text are missing', () => {
      const obs = { code: { coding: [{ code: '8867-4' }] } };
      expect(getObservationName(obs)).toBe('8867-4');
    });
    it('returns Unknown Observation if code is missing', () => {
      expect(getObservationName({})).toBe('Unknown Observation');
    });
  });

  describe('getObservationValue', () => {
    it('returns valueQuantity with unit', () => {
      const obs = { valueQuantity: { value: 120, unit: 'mmHg' } };
      expect(getObservationValue(obs)).toBe('120 mmHg');
    });
    it('returns valueString', () => {
      const obs = { valueString: 'Positive' };
      expect(getObservationValue(obs)).toBe('Positive');
    });
    it('returns valueCodeableConcept display', () => {
      const obs = { valueCodeableConcept: { coding: [{ display: 'Normal' }] } };
      expect(getObservationValue(obs)).toBe('Normal');
    });
    it('returns joined component values', () => {
      const obs = {
        component: [
          { code: { text: 'Systolic' }, valueQuantity: { value: 120, unit: 'mmHg' } },
          { code: { text: 'Diastolic' }, valueQuantity: { value: 80, unit: 'mmHg' } }
        ]
      };
      expect(getObservationValue(obs)).toBe('Systolic: 120 mmHg, Diastolic: 80 mmHg');
    });
    it('returns No value if no value fields are present', () => {
      expect(getObservationValue({})).toBe('No value');
    });
  });

  describe('getVitalType', () => {
    it('returns correct vital type for known code', () => {
      expect(getVitalType('8867-4')).toEqual({ key: 'heartRate', label: 'Heart Rate' });
    });
    it('returns null for unknown code', () => {
      expect(getVitalType('unknown-code')).toBeNull();
    });
  });

  describe('formatDate', () => {
    it('formats valid date string', () => {
      const result = formatDate('2023-01-01T12:00:00Z');
      expect(typeof result).toBe('string');
      expect(result).not.toBe('Unknown');
      expect(result).not.toBe('Invalid Date');
    });
    it('returns Unknown for invalid date', () => {
      expect(formatDate('not-a-date')).toBe('Invalid Date');
    });
    it('returns Unknown for missing date', () => {
      expect(formatDate()).toBe('Unknown');
    });
  });
});