// This file manages the referral form, including validation, submission handling, and resetting the form after submission.

import { submitYmcaReferral } from '../fhir/referral.js';
import { loadPatientData } from '../fhir/patient.js';

async function handleReferralSubmission() {
    const programSelect = document.getElementById('program-select');
    const prioritySelect = document.getElementById('priority-select');
    const notesTextarea = document.getElementById('referral-notes');
    const submitBtn = document.getElementById('submit-referral-btn');
    const patientData = await loadPatientData();

    // Validate form
    if (!programSelect.value) {
        alert('Please select a YMCA program');
        return;
    }

    // Disable button during submission
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Preparing patient data...';

    try {
        await submitYmcaReferral(
            patientData,
            programSelect.value,
            prioritySelect.value,
            notesTextarea.value
        );

        // Reset form on success
        programSelect.value = '';
        prioritySelect.value = 'routine';
        notesTextarea.value = '';

    } catch (error) {
        console.error('Referral submission failed:', error);
    } finally {
        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 Submit Referral to HAPI FHIR Server';
    }
}

// Expose the handleReferralSubmission function for use in other modules
export { handleReferralSubmission };