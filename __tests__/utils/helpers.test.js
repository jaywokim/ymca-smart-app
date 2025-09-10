import {
  getVitalType
} from '../../src/utils/helpers.js';

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