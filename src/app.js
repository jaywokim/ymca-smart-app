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
        await logFhirUserContext(fhirClientInit);
        
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

async function logFhirUserContext(client) {
    if (!client?.user) {
        console.log('Missing FHIR user context; ensure the SMART launch requests openid and fhirUser scopes.');
        return;
    }

    console.log('FHIR user identifier (fhirUser):', client.user.fhirUser);
    console.log('FHIR user resource type:', client.user.resourceType);
    console.log('FHIR user id:', client.user.id);

    try {
        const userResource = await client.user.read();
        console.log('FHIR user read result:', userResource);

        if (userResource.resourceType === 'PractitionerRole') {
            const [organization, practitioner] = await Promise.all([
                fetchReferenceResource(client, userResource.organization),
                fetchReferenceResource(client, userResource.practitioner),
            ]);
            console.log('PractitionerRole organization resource:', organization ?? 'missing organization reference');
            console.log('PractitionerRole practitioner resource:', practitioner ?? 'missing practitioner reference');
            return;
        }

        if (userResource.resourceType === 'Practitioner') {
            let roleBundle;
            try {
                roleBundle = await client.request({
                    url: `PractitionerRole?practitioner=${encodeURIComponent(userResource.id)}`,
                });
            } catch (error) {
                console.log('PractitionerRole search failed:', error);
                return;
            }

            const firstEntry = roleBundle?.entry?.[0];
            if (!firstEntry?.resource) {
                console.log('No PractitionerRole found for practitioner', userResource.id);
                return;
            }

            const firstRole = firstEntry.resource;
            console.log('First PractitionerRole for practitioner:', firstRole);
            const associatedOrganization = await fetchReferenceResource(client, firstRole.organization);
            console.log('Organization linked to first PractitionerRole:', associatedOrganization ?? 'missing organization reference');
        }
    } catch (error) {
        console.log('Error while logging FHIR user context:', error);
    }
}

async function fetchReferenceResource(client, reference) {
    const referenceValue = getReferenceValue(reference);
    if (!referenceValue) {
        return null;
    }

    const cleanedReference = referenceValue.startsWith('http')
        ? referenceValue
        : referenceValue.replace(/^\/+/, '');

    try {
        return await client.request({ url: cleanedReference });
    } catch (error) {
        console.log('Failed to fetch reference', referenceValue, error);
        return null;
    }
}

function getReferenceValue(reference) {
    if (!reference) {
        return null;
    }
    if (typeof reference === 'string') {
        return reference;
    }
    return reference.reference || reference.target?.reference || null;
}