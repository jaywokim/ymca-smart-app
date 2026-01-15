// This file serves as the main entry point for the application. It initializes the FHIR client, handles the application lifecycle, and manages the overall flow of the app.

import { initializeFhirClient, getFhirClient } from './fhir/client.js';
import { loadPatientData } from './fhir/patient.js';
import { showError } from './ui/error.js';
import { handleReferralSubmission } from './ui/form.js';

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const fhirClientInit = await initializeFhirClient();
        console.log('FHIR Client initialized:', fhirClientInit);
        
        await loadPatientData();

        // Hide loading and show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';

    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the application: ' + error.message);
    }
});

// Expose the form handler so inline onclick attributes can invoke it
window.handleReferralSubmission = handleReferralSubmission;