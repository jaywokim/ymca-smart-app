// This file contains the logic for initializing and managing the FHIR client. 
// It handles authentication and communication with the FHIR server.

let fhirClient = null;

/**
 * Initialize the FHIR client using SMART on FHIR authorization flow.
 */
async function initializeFhirClient() {
    try {
        fhirClient = await FHIR.oauth2.ready();
        console.log('FHIR Client initialized:', fhirClient);
        return fhirClient;
    } catch (error) {
        console.error('Error initializing FHIR client:', error);
        throw new Error('Failed to initialize FHIR client');
    }
}

/**
 * Get the current FHIR client instance.
 */
function getFhirClient() {
    if (!fhirClient) {
        throw new Error('FHIR client is not initialized');
    }
    return fhirClient;
}

export { initializeFhirClient, getFhirClient };