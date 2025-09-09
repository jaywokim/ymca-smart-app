/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

// 1. Mock submitYmcaReferral before importing form.js
await jest.unstable_mockModule('../../src/fhir/referral.js', () => ({
  __esModule: true,
  submitYmcaReferral: jest.fn()
}));

// 2. Import the mocks and module under test
const { submitYmcaReferral } = await import('../../src/fhir/referral.js');
const { handleReferralSubmission } = await import('../../src/ui/form.js');

describe('handleReferralSubmission', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="program-select">
        <option value=""></option>
        <option value="Yoga">Yoga</option>
      </select>
      <select id="priority-select">
        <option value="routine">Routine</option>
        <option value="urgent">Urgent</option>
      </select>
      <textarea id="referral-notes"></textarea>
      <button id="submit-referral-btn">📤 Submit Referral to HAPI FHIR Server</button>
    `;
    submitYmcaReferral.mockClear();
    global.alert = jest.fn();
    console.error = jest.fn();
  });

  it('alerts and returns early when no program selected', async () => {
    const btn = document.getElementById('submit-referral-btn');
    await handleReferralSubmission();
    expect(global.alert).toHaveBeenCalledWith('Please select a YMCA program');
    expect(submitYmcaReferral).not.toHaveBeenCalled();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('📤 Submit Referral to HAPI FHIR Server');
  });

  it('disables button, calls submitYmcaReferral and resets form on success', async () => {
    submitYmcaReferral.mockResolvedValueOnce();
    const program = document.getElementById('program-select');
    const priority = document.getElementById('priority-select');
    const notes = document.getElementById('referral-notes');
    const btn = document.getElementById('submit-referral-btn');

    program.value = 'Yoga';
    priority.value = 'urgent';
    notes.value = 'Test notes';

    await handleReferralSubmission();

    // button re-enabled
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('📤 Submit Referral to HAPI FHIR Server');

    // submitYmcaReferral called with correct args
    expect(submitYmcaReferral).toHaveBeenCalledWith('Yoga', 'urgent', 'Test notes');

    // form reset to defaults
    expect(program.value).toBe('');
    expect(priority.value).toBe('routine');
    expect(notes.value).toBe('');
  });

  it('re-enables button and logs error when submit fails', async () => {
    submitYmcaReferral.mockRejectedValueOnce(new Error('fail'));
    const program = document.getElementById('program-select');
    const priority = document.getElementById('priority-select');
    const notes = document.getElementById('referral-notes');
    const btn = document.getElementById('submit-referral-btn');

    program.value = 'Yoga';
    priority.value = 'routine';
    notes.value = 'Failure case';

    await handleReferralSubmission();

    expect(submitYmcaReferral).toHaveBeenCalledWith('Yoga', 'routine', 'Failure case');
    expect(console.error).toHaveBeenCalledWith('Referral submission failed:', expect.any(Error));
    // button re-enabled, text restored
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('📤 Submit Referral to HAPI FHIR Server');
    // form values remain unchanged
    expect(program.value).toBe('Yoga');
    expect(priority.value).toBe('routine');
    expect(notes.value).toBe('Failure case');
  });
});