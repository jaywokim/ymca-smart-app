// src/fhir/patient.js
import { getFhirClient } from './client.js'; // Import the FHIR client
import { displayPatientInfo, updateUserName } from '../ui/display.js';
import { loadVitalSigns, loadObservations } from './observation.js';

/**
 * Get patient's full name
 */
export function getPatientName(patient) {
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
export function getPatientIdentifier(patient, type) {
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
export function getPatientAddress(patient) {
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
export function getPatientPhone(patient) {
    if (patient.telecom) {
        const phone = patient.telecom.find(contact => contact.system === 'phone');
        return phone ? phone.value : 'Not available';
    }
    return 'Not available';
}

export async function loadPatientData() {
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
            loadObservations(patient.id)
        ]);

        return patient;

    } catch (error) {
        console.error('Error loading patient data:', error);
        throw new Error('Unable to load patient information');
    }
}