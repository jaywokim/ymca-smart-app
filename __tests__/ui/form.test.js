/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// 1) Mock patient loader before importing form.js
await jest.unstable_mockModule('../../src/fhir/patient.js', () => ({
  __esModule: true,
  loadPatientData: jest.fn().mockResolvedValue({ id: 'p-dummy' })
}));

// 2) Mock referral submitter before importing form.js
await jest.unstable_mockModule('../../src/fhir/referral.js', () => ({
  __esModule: true,
  submitYmcaReferral: jest.fn()
}));

// 3) Now import everything
const { loadPatientData } = await import('../../src/fhir/patient.js');
const { submitYmcaReferral } = await import('../../src/fhir/referral.js');
const { handleReferralSubmission } = await import('../../src/ui/form.js');

describe('handleReferralSubmission', () => {
  let programSelect, prioritySelect, notesTextarea, submitBtn, origAlert, spyError;

  beforeEach(() => {
    // DOM setup
    document.body.innerHTML = `
      <select id="program-select">
        <option value="">--select--</option>
        <option value="Yoga">Yoga</option>
        <option value="Swim">Swim</option>
      </select>
      <select id="priority-select">
        <option value="routine">Routine</option>
        <option value="urgent">Urgent</option>
      </select>
      <textarea id="referral-notes"></textarea>
      <button id="submit-referral-btn">Submit</button>
    `;
    programSelect = document.getElementById('program-select');
    prioritySelect = document.getElementById('priority-select');
    notesTextarea = document.getElementById('referral-notes');
    submitBtn = document.getElementById('submit-referral-btn');

    // reset mocks
    loadPatientData.mockClear();
    submitYmcaReferral.mockClear();

    // spy alert & console.error
    origAlert = window.alert;
    window.alert = jest.fn();
    spyError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    window.alert = origAlert;
    spyError.mockRestore();
  });

  it('alerts and returns early when no program selected', async () => {
    programSelect.value = '';
    await handleReferralSubmission();
    expect(window.alert).toHaveBeenCalledWith('Please select a YMCA program');
    expect(submitYmcaReferral).not.toHaveBeenCalled();
  });

  it('disables button, calls submitYmcaReferral and resets form on success', async () => {
    programSelect.value = 'Yoga';
    prioritySelect.value = 'urgent';
    notesTextarea.value = 'Test notes';
    submitYmcaReferral.mockResolvedValue({ id: 'r1' });

    await handleReferralSubmission();

    // ensure submit called correctly
    expect(submitYmcaReferral).toHaveBeenCalledWith(
      { id: 'p-dummy' },
      'Yoga',
      'urgent',
      'Test notes'
    );

    // form reset
    expect(programSelect.value).toBe('');
    expect(prioritySelect.value).toBe('routine');
    expect(notesTextarea.value).toBe('');

    // button restored
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent).toBe('📤 Submit Referral to HAPI FHIR Server');
  });

  it('re-enables button and logs error when submit fails', async () => {
    programSelect.value = 'Swim';
    prioritySelect.value = 'routine';
    notesTextarea.value = 'Oops';
    submitYmcaReferral.mockRejectedValue(new Error('boom'));

    await handleReferralSubmission();

    expect(spyError).toHaveBeenCalledWith(
      'Referral submission failed:',
      expect.any(Error)
    );
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent).toBe('📤 Submit Referral to HAPI FHIR Server');
  });
});