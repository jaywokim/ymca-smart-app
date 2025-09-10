// This file contains functions for creating and submitting referrals to the FHIR server.
// It includes logic for ensuring patient existence and handling referral submissions.

const localFhirServer = 'http://localhost:8080/fhir'; // Local HAPI FHIR server
import { getPatientName } from '../fhir/patient.js';

/**
 * Submit a referral to local HAPI FHIR server
 */
async function submitYmcaReferral(fhirClient, patientData, programType, priority = 'routine', notes = '') {
    try {
        if (!patientData) {
            throw new Error('Patient data not available');
        }

        // First, ensure patient exists in local HAPI FHIR server
        const localPatient = await ensurePatientInLocalFhir(fhirClient, patientData);
        
        // Create FHIR ServiceRequest for YMCA referral
        const serviceRequest = createServiceRequest(localPatient, programType, priority, notes);

        // Submit to local HAPI FHIR server
        const response = await fetch(`${localFhirServer}/ServiceRequest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json'
            },
            body: JSON.stringify(serviceRequest)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`FHIR server error: ${response.status} - ${errorText}`);
        }

        const createdReferral = await response.json();
        return createdReferral;

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
    const localPatient = {
        resourceType: 'Patient',
        identifier: [
            {
                system: 'http://smart-health-it.org/patient-id',
                value: patientData.id
            }
        ],
        name: patientData.name || [
            {
                family: 'Unknown',
                given: ['Patient']
            }
        ],
        gender: patientData.gender || 'unknown',
        birthDate: patientData.birthDate || '1990-01-01',
        address: patientData.address || [],
        telecom: patientData.telecom || [],
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
function createServiceRequest(localPatient, programType, priority, notes) {
    return {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        priority: priority,
        category: [
            {
                coding: [
                    {
                        system: 'http://snomed.info/sct',
                        code: '306206005',
                        display: 'Referral to service'
                    }
                ]
            }
        ],
        code: {
            coding: [
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
            display: 'Healthcare Provider'
        },
        performer: [
            {
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
                text: notes || `Patient referral for ${programType} program based on health assessment`
            }
        ],
        note: notes ? [
            {
                text: notes,
                time: new Date().toISOString()
            }
        ] : []
    };
}

// Export functions for use in other modules
export {
    submitYmcaReferral,
    ensurePatientInLocalFhir,
    createPatientInLocalFhir,
    createServiceRequest
};