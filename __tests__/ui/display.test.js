/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// 1. Mock utils/helpers.js
await jest.unstable_mockModule('../../src/utils/helpers.js', () => ({
  __esModule: true,
  getPatientName: jest.fn(),
  getPatientIdentifier: jest.fn(),
  getPatientAddress: jest.fn(),
  getPatientPhone: jest.fn(),
  getVitalType: jest.fn(),
  getObservationValue: jest.fn(),
  getObservationName: jest.fn(),
}));

// 2. Mock utils/format.js
await jest.unstable_mockModule('../../src/utils/format.js', () => ({
  __esModule: true,
  formatDate: jest.fn(),
}));

// 3. Import mocks and module under test
const helpers = await import('../../src/utils/helpers.js');
const { formatDate } = await import('../../src/utils/format.js');
const {
  displayPatientInfo,
  displayVitalSigns,
  displayObservations,
  displayEmptyVitals,
  displayEmptyObservations,
  updateUserName
} = await import('../../src/ui/display.js');

describe('displayPatientInfo', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="patient-info"></div>`;
    helpers.getPatientName.mockReturnValue('John Doe');
    helpers.getPatientIdentifier.mockReturnValue('MR123');
    helpers.getPatientAddress.mockReturnValue('123 Main St');
    helpers.getPatientPhone.mockReturnValue('(555) 123-4567');
    formatDate.mockReturnValue('01/01/1990');
  });

  it('renders all patient fields correctly', () => {
    const stubPatient = { birthDate: '1990-01-01', gender: 'female' };
    displayPatientInfo(stubPatient);

    const html = document.getElementById('patient-info').innerHTML;
    expect(html).toContain('John Doe');
    expect(html).toContain('01/01/1990');
    expect(html).toContain('Female');
    expect(html).toContain('MR123');
    expect(html).toContain('123 Main St');
    expect(html).toContain('(555) 123-4567');
  });

  it('falls back to Unknown when fields are missing', () => {
    helpers.getPatientName.mockReturnValue('Unknown Name');
    helpers.getPatientIdentifier.mockReturnValue(null);
    helpers.getPatientAddress.mockReturnValue('');
    helpers.getPatientPhone.mockReturnValue('');
    formatDate.mockReturnValue('Unknown');

    displayPatientInfo({});
    const html = document.getElementById('patient-info').innerHTML;
    expect(html).toContain('Unknown Name');
    expect(html).toContain('Unknown');
    expect(html).toContain('Not available');
  });
});

describe('displayVitalSigns', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="vitals"></div>`;
    helpers.getVitalType.mockClear();
    helpers.getObservationValue.mockClear();
  });

  it('shows most recent vitals', () => {
    // Two entries for same vital, later one wins
    const entries = [
      { resource: { code: { coding: [{ code: 'HR', display: 'Heart Rate' }] }, effectiveDateTime: '2025-01-01T00:00:00Z' } },
      { resource: { code: { coding: [{ code: 'HR', display: 'Heart Rate' }] }, effectiveDateTime: '2025-02-01T00:00:00Z' } }
    ];
    helpers.getVitalType.mockReturnValue({ key: 'heartRate', label: 'Heart Rate' });
    helpers.getObservationValue.mockReturnValue('75 bpm');

    displayVitalSigns(entries);
    const html = document.getElementById('vitals').innerHTML;
    expect(html).toContain('75 bpm');
    expect(html).toContain('Heart Rate');
  });

  it('renders empty state when no vitals', () => {
    displayVitalSigns([]);
    const html = document.getElementById('vitals').innerHTML;
    expect(html).toContain('No recent vital signs available');
  });
});

describe('displayObservations', () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="observations"></div>`;
    helpers.getObservationName.mockClear();
    helpers.getObservationValue.mockClear();
    formatDate.mockClear();
  });

  it('renders up to 10 observations', () => {
    const obs = [];
    for (let i = 0; i < 12; i++) {
      obs.push({ resource: { effectiveDateTime: `2025-03-0${i+1}`, issued: `2025-03-0${i+1}` } });
    }
    helpers.getObservationName.mockImplementation((o) => `Obs${o.effectiveDateTime}`);
    helpers.getObservationValue.mockImplementation(() => 'ValueX');
    formatDate.mockImplementation((d) => `Fmt${d}`);

    displayObservations(obs);
    const html = document.getElementById('observations').innerHTML;
    // only first 10 rendered
    expect((html.match(/observation-item/g) || []).length).toBe(10);
    expect(html).toContain('Obs2025-03-01');
    expect(html).toContain('ValueX');
    expect(html).toContain('Fmt2025-03-01');
  });

  it('renders empty state when no observations', () => {
    displayEmptyObservations();
    const html = document.getElementById('observations').innerHTML;
    expect(html).toContain('No recent observations available');
  });
});

describe('updateUserName', () => {
  it('updates header text', () => {
    document.body.innerHTML = `<span id="user-name"></span>`;
    helpers.getPatientName.mockReturnValue('Jane Doe');
    updateUserName({});

    expect(document.getElementById('user-name').textContent).toBe('Jane Doe');
  });
});