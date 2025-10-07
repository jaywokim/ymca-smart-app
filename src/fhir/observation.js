// This file contains functions for handling observations, including loading vital signs and other health-related data from the FHIR server.

import { getFhirClient } from './client.js'; // Import the FHIR client
import {
    displayVitalSigns,
    displayEmptyVitals,
    displayObservations,
    displayEmptyObservations
} from '../ui/display.js';

/**
 * Load and display vital signs for a given patient
 * @param {string} patientId - The ID of the patient
 * @returns {Promise<Array>} - A promise that resolves to an array of vital signs
 */
async function loadVitalSigns(patientId) {
    try {
        const fhirClient = getFhirClient();
        const observations = await fhirClient.request(`Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=10`);

        if (observations.entry && observations.entry.length > 0) {
            displayVitalSigns(observations.entry);
        } else {
            displayEmptyVitals();
        }
    } catch (error) {
        console.error('Error loading vital signs:', error);
        throw new Error('Unable to load vital signs');
    }
}

/**
 * Load and display recent observations for a given patient
 * @param {string} patientId - The ID of the patient
 * @returns {Promise<Array>} - A promise that resolves to an array of observations
 */
async function loadObservations(patientId) {
    try {
        const fhirClient = getFhirClient();
        const observations = await fhirClient.request(`Observation?patient=${patientId}&_sort=-date&_count=20`);

        if (observations.entry && observations.entry.length > 0) {
            displayObservations(observations.entry);
        } else {
            displayEmptyObservations();
        }
    } catch (error) {
        console.error('Error loading observations:', error);
        throw new Error('Unable to load observations');
    }
}

/**
 * Get observation name/display
 * @param {Object} observation - The observation resource
 * @returns {string} - The name or display of the observation
 */
function getObservationName(observation) {
    if (observation.code) {
        if (observation.code.text) {
            return observation.code.text;
        }
        if (observation.code.coding && observation.code.coding.length > 0) {
            return observation.code.coding[0].display || observation.code.coding[0].code;
        }
    }
    return 'Unknown Observation';
}

/**
 * Get observation value with units
 * @param {Object} observation - The observation resource
 * @returns {string} - The value of the observation with units
 */
function getObservationValue(observation) {
    if (observation.valueQuantity) {
        const value = observation.valueQuantity.value;
        const unit = observation.valueQuantity.unit || observation.valueQuantity.code || '';
        return `${value} ${unit}`.trim();
    }
    
    if (observation.valueString) {
        return observation.valueString;
    }
    
    if (observation.valueCodeableConcept) {
        if (observation.valueCodeableConcept.text) {
            return observation.valueCodeableConcept.text;
        }
        if (observation.valueCodeableConcept.coding && observation.valueCodeableConcept.coding.length > 0) {
            return observation.valueCodeableConcept.coding[0].display || observation.valueCodeableConcept.coding[0].code;
        }
    }

    if (observation.component && observation.component.length > 0) {
        // Handle components (like blood pressure)
        return observation.component.map(comp => {
            const compValue = getObservationValue(comp);
            const compName = getObservationName(comp);
            return `${compName}: ${compValue}`;
        }).join(', ');
    }
    
    return 'No value';
}

export {
    loadVitalSigns,
    loadObservations,
    getObservationName,
    getObservationValue
};