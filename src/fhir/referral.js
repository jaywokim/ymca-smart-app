// This file contains functions for creating and submitting referrals to the FHIR server.
// It includes logic for ensuring patient existence and handling referral submissions.

const localFhirServer = 'http://localhost:8080/fhir'; // Local HAPI FHIR server
import { getPatientName, formatPatientForReferral } from '../fhir/patient.js';
import { getFhirClient } from '../fhir/client.js';
import {
    buildConditionReasonReferences,
    fetchDiabetesConditions
} from './conditions.js';
import { buildReferralBundle } from './referralBundle.js';

/**
 * Submit a referral to local HAPI FHIR server
 */
async function submitYmcaReferral(patientData, programType, priority = 'routine', notes = '') {
    try {
        if (!patientData) {
            throw new Error('Patient data not available');
        }
        console.log('starting referral submission for patient:');

        const fhirClient = await getFhirClient();

        // First, ensure patient exists in local HAPI FHIR server
        let localPatient;
        try {
            localPatient = await ensurePatientInLocalFhir(fhirClient, patientData);
            console.log('Local patient record:', localPatient);
        } catch (error) {
            console.warn('Unable to reach local HAPI FHIR patient endpoint, falling back to SMART patient data', error);
            localPatient = await fetchPatientFromSmartClient(fhirClient);
        }

        if (!localPatient) {
            localPatient = await fetchPatientFromSmartClient(fhirClient);
        }

        if (!localPatient) {
            throw new Error('Unable to resolve patient data for referral');
        }

        // Fetch diabetes conditions from the EHR so the referral can reference them
        const diabetesConditions = await fetchDiabetesConditions(fhirClient, patientData?.id);
        const reasonReferences = buildConditionReasonReferences(diabetesConditions);

        // Fetch client_id from manifest
        let clientId = 'unknown-client';
        try {
            const manifestRes = await fetch('/smart-app-manifest.json');
            if (manifestRes.ok) {
                const manifest = await manifestRes.json();
                clientId = manifest.client_id;
            }
        } catch (e) {
            console.warn('Could not fetch manifest for client_id', e);
        }

        console.log('Diabetes condition references for referral:', reasonReferences);
        
        // 1. Create the ServiceRequest object locally to inject into the bundle
        const localServiceRequest = createServiceRequest(localPatient, programType, priority, notes, reasonReferences, clientId, []);

        // 2. Generate the comprehensive bundle using our centralized builder
        // Passing the localServiceRequest so it doesn't try to fetch a random one from the EHR
        const bundle = await buildReferralBundle(localPatient.id, {
            bundleType: 'transaction', 
            serviceRequest: localServiceRequest
        });

        console.log('Submitting Full Integrated Bundle:', JSON.stringify(bundle, null, 2));

        // Submit to local HAPI FHIR server
        const response = await fetch(`${localFhirServer}/Bundle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json'
            },
            body: JSON.stringify(bundle)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`FHIR server error: ${response.status} - ${errorText}`);
        }

        const createdBundle = await response.json();
        return createdBundle;

    } catch (error) {
        console.error('Error submitting referral:', error);
        throw error;
    }
}

/**
 * Ensure patient exists in local HAPI FHIR server
 */
async function ensurePatientInLocalFhir(fhirClient, patientData) {
    try {
        const searchName = getPatientName(patientData).replace(' ', '%20');
        const searchResponse = await fetch(`${localFhirServer}/Patient?name=${searchName}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/fhir+json'
            }
        });

        if (searchResponse.ok) {
            const searchBundle = await searchResponse.json();
            if (searchBundle.entry && searchBundle.entry.length > 0) {
                return searchBundle.entry[0].resource;
            }
        }

        // Patient not found, create new one
        return await createPatientInLocalFhir(patientData);

    } catch (error) {
        console.error('Error ensuring patient in local HAPI FHIR:', error);
        throw new Error(`Failed to ensure patient exists in local HAPI FHIR: ${error.message}`);
    }
}

/**
 * Create a new patient in local HAPI FHIR
 */
async function createPatientInLocalFhir(patientData) {
    const formattedPatient = formatPatientForReferral(patientData);
    
    const localPatient = {
        ...formattedPatient,
        active: true,
        meta: {
            tag: [
                {
                    system: 'http://ymca.org/source',
                    code: 'smart-health-it',
                    display: 'Imported from SMART Health IT'
                }
            ]
        }
    };

    const createResponse = await fetch(`${localFhirServer}/Patient`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/fhir+json',
            'Accept': 'application/fhir+json'
        },
        body: JSON.stringify(localPatient)
    });

    if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create patient in local HAPI FHIR: ${createResponse.status} - ${errorText}`);
    }

    return await createResponse.json();
}

/**
 * Create a ServiceRequest object for the referral
 */
function createServiceRequest(localPatient, programType, priority, notes, reasonReferences = [], clientId = 'unknown', supportingInfo = []) {
    const normalizedReasonReferences = (Array.isArray(reasonReferences) ? reasonReferences : [])
        .map(ref => {
            const normalized = {
                type: ref?.type || 'Condition'
            };
            if (ref?.reference) {
                normalized.reference = ref.reference;
            }
            if (ref?.display) {
                normalized.display = ref.display;
            }
            if (ref?.identifier) {
                normalized.identifier = ref.identifier;
            }
            return normalized;
        })
        .filter(ref => ref.reference || ref.display || ref.identifier);

    const serviceRequest = {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        priority: priority,
        code: {
            coding: [
                {
                    system: 'http://snomed.info/sct',
                    code: '306206005',
                    display: 'Referral to diabetes education program'
                },
                {
                    system: 'http://ymca.org/services',
                    code: programType,
                    display: `YMCA ${programType} Program`
                }
            ],
            text: `Referral to YMCA ${programType} Program`
        },
        subject: {
            reference: `Patient/${localPatient.id}`,
            display: getPatientName(localPatient)
        },
        authoredOn: new Date().toISOString(),
        requester: {
            type: 'Organization',
            display: 'YMCA Health Dashboard',
            identifier: {
                system: 'http://ymca.org/smart-app/client-id',
                value: clientId
            }
        },
        performer: [
            {
                reference: 'Organization/ymca-diabetes-program',
                display: 'YMCA Health Programs',
                extension: [
                    {
                        url: 'http://ymca.org/contact',
                        valueString: 'health-programs@ymca.org'
                    }
                ]
            }
        ],
        reasonCode: [
            {
                text: notes || `Patient referral for ${programType} program based on health assessment`,
                coding: [
                    {
                        system: 'http://snomed.info/sct',
                        code: '44054006',
                        display: 'Type 2 diabetes mellitus'
                    }
                ]
            }
        ],
        reasonReference: normalizedReasonReferences,
        note: notes ? [
            {
                text: notes,
                time: new Date().toISOString()
            }
        ] : []
    };

    if (supportingInfo && supportingInfo.length > 0) {
        serviceRequest.supportingInfo = supportingInfo;
    }

    return serviceRequest;
}

async function fetchPatientFromSmartClient(fhirClient) {
    if (!fhirClient || !fhirClient.patient || typeof fhirClient.patient.read !== 'function') {
        return null;
    }
    try {
        return await fhirClient.patient.read();
    } catch (error) {
        console.warn('Failed to read patient from SMART client', error);
        return null;
    }
}

function createRequestBundle(localPatient, programType, priority, notes, reasonReferences = [], clientId = 'unknown', supportingInfo = []) {
    const serviceRequest = createServiceRequest(localPatient, programType, priority, notes, reasonReferences, clientId, supportingInfo);

    console.log('Created ServiceRequest for Bundle:', serviceRequest);

    return {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
            {
                fullUrl: `urn:uuid:${crypto.randomUUID()}`,
                resource: serviceRequest
            }
        ]
    };
}

// Export functions for use in other modules
export {
    submitYmcaReferral,
    ensurePatientInLocalFhir,
    createPatientInLocalFhir,
    createServiceRequest,
    createRequestBundle
};