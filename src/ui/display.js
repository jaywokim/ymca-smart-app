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

/**
 * Map a FHIR Task.status value to a display label and CSS modifier class.
 */
const TASK_STATUS_MAP = {
    requested:       { label: 'Requested',        cls: 'status-requested' },
    received:        { label: 'Received',          cls: 'status-requested' },
    accepted:        { label: 'Accepted',          cls: 'status-in-progress' },
    rejected:        { label: 'Rejected',          cls: 'status-cancelled' },
    ready:           { label: 'Ready',             cls: 'status-in-progress' },
    cancelled:       { label: 'Cancelled',         cls: 'status-cancelled' },
    'in-progress':   { label: 'In Progress',       cls: 'status-in-progress' },
    'on-hold':       { label: 'On Hold',           cls: 'status-cancelled' },
    failed:          { label: 'Failed',            cls: 'status-failed' },
    completed:       { label: 'Completed',         cls: 'status-completed' },
    'entered-in-error': { label: 'Entered in Error', cls: 'status-failed' },
};

/**
 * Render the content for a single Communication resource as a comment item.
 */
function renderCommentItem(communication) {
    const text = communication.payload?.[0]?.contentString
        ?? communication.note?.[0]?.text
        ?? '(no content)';
    const rawDate = communication.sent ?? communication.meta?.lastUpdated;
    const sent = rawDate ? formatDate(rawDate) : 'Unknown date';
    const author = communication.sender?.display ?? communication.sender?.reference ?? 'System';

    return `
        <div class="comment-item">
            <div class="comment-header">
                <span class="comment-author">${author}</span>
                <span class="comment-date">${sent}</span>
            </div>
            <div class="comment-text">${text}</div>
        </div>
    `;
}

/**
 * Populate #task-content with the Task status and a log of Communication comments.
 * @param {{ task: object, communications: object[] }} data
 */
function displayTaskSection({ task, communications }) {
    const container = document.getElementById('task-content');

    const rawStatus = task.status ?? 'unknown';
    const statusInfo = TASK_STATUS_MAP[rawStatus] ?? { label: rawStatus, cls: 'status-requested' };

    const taskDescription = task.description
        ?? task.code?.text
        ?? task.code?.coding?.[0]?.display
        ?? 'YMCA Referral Task';

    const authoredOn = task.authoredOn ? formatDate(task.authoredOn) : null;
    const lastModified = task.lastModified ? formatDate(task.lastModified) : null;

    let metaHtml = '';
    if (authoredOn) {
        metaHtml += `<div class="task-meta-item"><span class="info-label">Created</span><span class="info-value">${authoredOn}</span></div>`;
    }
    if (lastModified) {
        metaHtml += `<div class="task-meta-item"><span class="info-label">Last Updated</span><span class="info-value">${lastModified}</span></div>`;
    }

    let commentsHtml = '';
    if (!communications || communications.length === 0) {
        commentsHtml = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <p>No comments yet</p>
            </div>
        `;
    } else {
        commentsHtml = `<div class="comment-list">${communications.map(renderCommentItem).join('')}</div>`;
    }

    container.innerHTML = `
        <div class="task-status-row">
            <div class="task-status">
                <span class="status-badge ${statusInfo.cls}">${statusInfo.label}</span>
                <span class="task-description">${taskDescription}</span>
            </div>
        </div>
        ${metaHtml ? `<div class="task-meta">${metaHtml}</div>` : ''}
        <div class="task-comments-section">
            <h3 class="comments-heading">Comments Log</h3>
            ${commentsHtml}
        </div>
    `;
}

/**
 * Show an empty state in #task-content when no Task is found for this patient.
 */
function displayEmptyTaskSection() {
    const container = document.getElementById('task-content');
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>No referral task found for this patient</p>
        </div>
    `;
}

/**
 * Show a loading state in #task-content while fetching.
 */
function displayTaskLoading() {
    const container = document.getElementById('task-content');
    container.innerHTML = `
        <div class="task-loading">
            <div class="spinner spinner-sm"></div>
            <span>Checking for tasks...</span>
        </div>
    `;
}

export {
    displayPatientInfo,
    displayVitalSigns,
    displayObservations,
    displayEmptyVitals,
    displayEmptyObservations,
    updateUserName,
    displayTaskSection,
    displayEmptyTaskSection,
    displayTaskLoading
};