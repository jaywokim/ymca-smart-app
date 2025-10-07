import { getVitalType } from '../../src/utils/helpers.js';

describe('getVitalType', () => {
  it('returns known vitalType entry', async () => {
    const vt = await getVitalType('8867-4');
    expect(vt).toEqual({ key: 'heartRate', label: 'Heart Rate' });
  });

  it('uses display when unknown code but label includes "vital"', async () => {
    const vt = await getVitalType('X', 'My Vital Sign');
    expect(vt).toEqual({ key: 'X', label: 'My Vital Sign' });
  });

  it('returns null when unknown code and display missing "vital"', async () => {
    const vt = await getVitalType('X', 'Other');
    expect(vt).toBeNull();
  });
});