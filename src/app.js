// This file serves as the main entry point for the application. It initializes the FHIR client, handles the application lifecycle, and manages the overall flow of the app.

import { initializeFhirClient, getFhirClient } from './fhir/client.js';
import { loadPatientData } from './fhir/patient.js';
import { loadVitalSigns, loadObservations } from './fhir/observation.js';
import { submitYmcaReferral } from './fhir/referral.js';
import { showError } from './ui/error.js';
import { handleReferralSubmission } from './ui/form.js';
import { updateUserName, displayPatientInfo } from './ui/display.js';

let fhirClient = null;
let patientData = null;

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const fhirClientInit = await initializeFhirClient();
        console.log('FHIR Client initialized:', fhirClientInit);
        
        await loadPatientData();

        // Hide loading and show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        // displayPatientInfo(patientData);
        // updateUserName(patientData);
        
        // await Promise.all([
        //     loadVitalSigns(patientData.id),
        //     loadObservations(patientData.id)
        // ]);
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the application: ' + error.message);
    }
});

// Expose utility functions for testing if in Node.js environment
// if (typeof module !== 'undefined' && module.exports) {
//     module.exports = {
//         initializeApp,
//         loadPatientData,
//         displayPatientInfo,
//         loadVitalSigns,
//         loadObservations,
//         submitYmcaReferral,
//         showError,
//         handleReferralSubmission,
//         updateUserName
//     };
// }