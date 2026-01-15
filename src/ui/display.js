// src/ui/display.js

import {
    getPatientName,
    getPatientIdentifier,
    getPatientAddress,
    getPatientPhone
} from '../fhir/patient.js';
import {
    getObservationValue,
    getObservationName
} from '../fhir/observation.js';
import {
    getVitalType
} from '../utils/helpers.js';
import { formatDate } from '../utils/format.js';

function displayPatientInfo(patient) {
    const patientInfoContainer = document.getElementById('patient-info');

    const name = getPatientName(patient);
    const birthDate = patient.birthDate || 'Unknown';
    const gender = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : 'Unknown';
    const mrn = getPatientIdentifier(patient, 'MR') || 'Not available';
    const address = getPatientAddress(patient);
    const phone = getPatientPhone(patient);

    patientInfoContainer.innerHTML = `
        <div class="info-item">
            <div class="info-label">Full Name</div>
            <div class="info-value">${name}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Date of Birth</div>
            <div class="info-value">${formatDate(birthDate)}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Gender</div>
            <div class="info-value">${gender}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Medical Record Number</div>
            <div class="info-value">${mrn}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Address</div>
            <div class="info-value">${address}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Phone</div>
            <div class="info-value">${phone}</div>
        </div>
    `;
}

function displayVitalSigns(vitalEntries) {
    const vitalsContainer = document.getElementById('vitals');

    const vitalsMap = new Map();

    vitalEntries.forEach(entry => {
        const observation = entry.resource;
        if (observation.code && observation.code.coding) {
            const coding = observation.code.coding[0];
            const vitalType = getVitalType(coding.code, coding.display);

            if (vitalType && (!vitalsMap.has(vitalType.key) ||
                new Date(observation.effectiveDateTime) > new Date(vitalsMap.get(vitalType.key).date))) {
                vitalsMap.set(vitalType.key, {
                    type: vitalType,
                    value: getObservationValue(observation),
                    date: observation.effectiveDateTime
                });
            }
        }
    });

    if (vitalsMap.size === 0) {
        displayEmptyVitals();
        return;
    }

    let vitalsHtml = '';
    vitalsMap.forEach(vital => {
        vitalsHtml += `
            <div class="vital-item">
                <div class="vital-value">${vital.value}</div>
                <div class="vital-label">${vital.type.label}</div>
            </div>
        `;
    });

    vitalsContainer.innerHTML = vitalsHtml;
}

function displayObservations(observationEntries) {
    const observationsContainer = document.getElementById('observations');

    let observationsHtml = '';

    observationEntries.slice(0, 10).forEach(entry => {
        const observation = entry.resource;
        const name = getObservationName(observation);
        const value = getObservationValue(observation);
        const date = observation.effectiveDateTime || observation.issued;

        observationsHtml += `
            <div class="observation-item">
                <div>
                    <div class="observation-name">${name}</div>
                    <div class="observation-date">${formatDate(date)}</div>
                </div>
                <div class="observation-value">${value}</div>
            </div>
        `;
    });

    observationsContainer.innerHTML = observationsHtml;
}

function displayEmptyVitals() {
    document.getElementById('vitals').innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">💓</div>
            <p>No recent vital signs available</p>
        </div>
    `;
}

function displayEmptyObservations() {
    document.getElementById('observations').innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📊</div>
            <p>No recent observations available</p>
        </div>
    `;
}

/**
 * Update the user name in the header
 */
function updateUserName(patient) {
    const userName = document.getElementById('user-name');
    const name = getPatientName(patient);
    userName.textContent = name;
}

export {
    displayPatientInfo,
    displayVitalSigns,
    displayObservations,
    displayEmptyVitals,
    displayEmptyObservations,
    updateUserName
};