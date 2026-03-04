// src/fhir/patient.js
import { getFhirClient } from './client.js'; // Import the FHIR client
import { displayPatientInfo, updateUserName } from '../ui/display.js';
import { loadVitalSigns, loadObservations } from './observation.js';
import { buildReferralBundle } from './referralBundle.js';

/**
 * Get patient's full name
 */
function getPatientName(patient) {
    if (patient.name && patient.name.length > 0) {
        const name = patient.name[0];
        const given = name.given ? name.given.join(' ') : '';
        const family = name.family || '';
        return `${given} ${family}`.trim() || 'Unknown';
    }
    return 'Unknown';
}

/**
 * Get patient identifier by type
 */
function getPatientIdentifier(patient, type) {
    if (patient.identifier) {
        const identifier = patient.identifier.find(id => 
            id.type && id.type.coding && 
            id.type.coding.some(coding => coding.code === type)
        );
        return identifier ? identifier.value : null;
    }
    return null;
}

/**
 * Get patient address
 */
function getPatientAddress(patient) {
    if (patient.address && patient.address.length > 0) {
        const address = patient.address[0];
        const parts = [];
        if (address.line) parts.push(...address.line);
        if (address.city) parts.push(address.city);
        if (address.state) parts.push(address.state);
        if (address.postalCode) parts.push(address.postalCode);
        return parts.join(', ') || 'Not available';
    }
    return 'Not available';
}

/**
 * Get patient phone number
 */
function getPatientPhone(patient) {
    if (patient.telecom) {
        const phone = patient.telecom.find(contact => contact.system === 'phone');
        return phone ? phone.value : 'Not available';
    }
    return 'Not available';
}

/**
 * Format raw EHR Patient data into a compliant bundle Patient resource.
 * Enforces necessary core demographics, telecom, communication, and required extensions.
 */
function formatPatientForReferral(rawPatient) {
    const patient = JSON.parse(JSON.stringify(rawPatient)); // deep copy

    // 1. Identifier
    if (!patient.identifier || patient.identifier.length === 0) {
        if (patient.id) {
            patient.identifier = [{
                system: 'http://smart-health-it.org/patient-id',
                value: patient.id
            }];
        }
    }

    // 2. Name (No defaults generated for name)

    // 3. Gender, BirthDate, Address
    patient.gender = patient.gender || 'unknown';
    // No defaults generated for birthDate
    patient.address = patient.address && patient.address.length > 0 ? patient.address : [];

    // 4. Telecom
    const formattedTelecom = [];
    if (patient.telecom && patient.telecom.length > 0) {
        let phoneAdded = false;
        let emailAdded = false;

        for (const t of patient.telecom) {
            if (t.system === 'phone' && !phoneAdded) {
                formattedTelecom.push({ ...t, rank: 1 });
                phoneAdded = true;
            } else if (t.system === 'email' && !emailAdded) {
                formattedTelecom.push({ ...t });
                emailAdded = true;
            } else {
                formattedTelecom.push({ ...t });
            }
        }
        
        if (!phoneAdded) {
            formattedTelecom.push({ system: 'phone', value: '555-000-0000', rank: 1 });
        }
        if (!emailAdded) {
            formattedTelecom.push({ system: 'email', value: 'unknown@example.com' });
        }
    } else {
        formattedTelecom.push({ system: 'phone', value: '555-000-0000', rank: 1 });
        formattedTelecom.push({ system: 'email', value: 'unknown@example.com' });
    }
    patient.telecom = formattedTelecom;

    // 5. Communication
    if (!patient.communication || patient.communication.length === 0) {
        patient.communication = [{
            language: {
                coding: [{
                    system: 'urn:ietf:bcp:47',
                    code: 'en-US',
                    display: 'English (United States)'
                }]
            },
            preferred: true
        }];
    }

    // 6. Extensions
    const extensions = patient.extension || [];
    
    const hasExtension = (url) => extensions.some(e => e.url === url);

    // US Core Birthsex
    if (!hasExtension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex')) {
        extensions.push({
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
            valueCode: 'UNK'
        });
    }

    // Gender Identity
    if (!hasExtension('http://hl7.org/fhir/StructureDefinition/patient-genderIdentity')) {
        extensions.push({
            url: 'http://hl7.org/fhir/StructureDefinition/patient-genderIdentity',
            valueCodeableConcept: {
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
                    code: 'UNK',
                    display: 'Unknown'
                }]
            }
        });
    }

    // US Core Race
    if (!hasExtension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-race')) {
        extensions.push({
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
            extension: [{
                url: 'ombCategory',
                valueCoding: {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
                    code: 'UNK',
                    display: 'Unknown'
                }
            }, {
                url: 'text',
                valueString: 'Unknown'
            }]
        });
    }

    // US Core Ethnicity
    if (!hasExtension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity')) {
        extensions.push({
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
            extension: [{
                url: 'ombCategory',
                valueCoding: {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
                    code: 'UNK',
                    display: 'Unknown'
                }
            }, {
                url: 'text',
                valueString: 'Unknown'
            }]
        });
    }

    // Education Level Extension
    if (!hasExtension('http://hl7.org/fhir/StructureDefinition/patient-education')) {
        extensions.push({
            url: 'http://hl7.org/fhir/StructureDefinition/patient-education',
            valueCodeableConcept: {
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
                    code: 'UNK',
                    display: 'Unknown'
                }]
            }
        });
    }

    patient.extension = extensions;

    return patient;
}

async function loadPatientData() {
    try {
        // Get current patient
        const fhirClient = await getFhirClient();
        const patient = await fhirClient.patient.read();
        
        console.log('Patient data:', patient);
        
        // Update UI with patient info
        displayPatientInfo(patient);
        updateUserName(patient);
        
        // Load additional data
        await Promise.all([
            loadVitalSigns(patient.id),
            loadObservations(patient.id),
            buildReferralBundle(patient.id)
        ]);

        return patient;

    } catch (error) {
        console.error('Error loading patient data:', error);
        throw new Error('Unable to load patient information');
    }
}

export {
    getPatientName,
    getPatientIdentifier,
    getPatientAddress,
    getPatientPhone,
    loadPatientData,
    formatPatientForReferral
};