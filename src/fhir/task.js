// src/fhir/task.js
// Fetches Task and Communication resources from the referral FHIR server for a given patient.

import { REFERRAL_FHIR_SERVER } from '../config/appConfig.js';
import { getPatientName } from '../fhir/patient.js';

/**
 * Search the local FHIR server with a single query URL and return the first Patient id found.
 * Returns null (never throws) so callers can chain fallbacks.
 */
async function searchLocalPatient(url, label) {
    try {
        console.log(`[Patient lookup ${label}] GET ${url}`);
        const resp = await fetch(url);
        if (!resp.ok) {
            console.warn(`[Patient lookup ${label}] Server returned ${resp.status}`);
            return null;
        }
        const bundle = await resp.json();
        const total = bundle.total ?? bundle.entry?.length ?? 0;
        console.log(`[Patient lookup ${label}] ${total} result(s)`);
        const id = bundle.entry?.[0]?.resource?.id ?? null;
        if (id) console.log(`[Patient lookup ${label}] ✓ Found local patient id: ${id}`);
        return id;
    } catch (err) {
        console.warn(`[Patient lookup ${label}] Error:`, err.message);
        return null;
    }
}

/**
 * Locate the patient's record on the local HAPI FHIR server.
 *
 * Tries in order:
 *   1. identifier with system  http://smart-health-it.org/patient-id|{ehrId}
 *   2. identifier value only   ?identifier={ehrId}
 *   3. name search             ?name={fullName}
 *
 * Returns the local patient ID string, or null if not found.
 *
 * @param {object} patientResource - FHIR Patient resource from the EHR SMART client
 * @param {string} [server]
 * @returns {Promise<string|null>}
 */
export async function findLocalPatientId(patientResource, server = REFERRAL_FHIR_SERVER) {
    const ehrId = patientResource?.id;
    const name  = getPatientName(patientResource);

    console.log(`[Patient lookup] EHR patient id: ${ehrId}, name: "${name}"`);

    // 1. Identifier with known system (set by formatPatientForReferral when patient had no identifiers)
    if (ehrId) {
        const id = await searchLocalPatient(
            `${server}/Patient?identifier=${encodeURIComponent('http://smart-health-it.org/patient-id')}|${encodeURIComponent(ehrId)}`,
            '1-identifier+system'
        );
        if (id) return id;
    }

    // 2. Identifier value only — the EHR patient id itself
    if (ehrId) {
        const id = await searchLocalPatient(
            `${server}/Patient?identifier=${encodeURIComponent(ehrId)}`,
            '2-identifier-value'
        );
        if (id) return id;
    }

    // 3. Each existing identifier on the EHR patient resource (e.g. MRN, MR)
    //    These are copied verbatim into the local patient by formatPatientForReferral.
    const existingIdentifiers = patientResource?.identifier ?? [];
    for (let i = 0; i < existingIdentifiers.length; i++) {
        const ident = existingIdentifiers[i];
        if (!ident?.value) continue;
        const query = ident.system
            ? `${encodeURIComponent(ident.system)}|${encodeURIComponent(ident.value)}`
            : encodeURIComponent(ident.value);
        const id = await searchLocalPatient(
            `${server}/Patient?identifier=${query}`,
            `3-existing-identifier[${i}]`
        );
        if (id) return id;
    }

    // 4. Name fallback
    if (name) {
        const id = await searchLocalPatient(
            `${server}/Patient?name=${encodeURIComponent(name)}`,
            '4-name'
        );
        if (id) return id;
    }

    console.warn('[Patient lookup] Patient not found on local FHIR server after all strategies');
    return null;
}

/**
 * Resolve the local HAPI FHIR IDs for all ServiceRequests belonging to the patient.
 * @param {string} localPatientId
 * @param {string} server
 * @returns {Promise<string[]>}
 */
async function findServiceRequestIds(localPatientId, server) {
    const srResponse = await fetch(`${server}/ServiceRequest?subject=Patient/${localPatientId}`);
    if (!srResponse.ok) {
        console.warn('findServiceRequestIds: server returned', srResponse.status);
        return [];
    }
    const srBundle = await srResponse.json();
    const ids = srBundle.entry?.map(e => e.resource?.id).filter(Boolean) ?? [];
    console.log(`findServiceRequestIds: found ${ids.length} ServiceRequest(s) for patient ${localPatientId}:`, ids);
    return ids;
}

/**
 * Try four sequential search strategies to find a Task associated with the patient.
 * Stops and returns the first Task resource found, or null if none match.
 *
 * Strategy 1: Task?patient={localPatientId}  (Task.for = Patient)
 * Strategy 2: ServiceRequest?subject → Task?focus=ServiceRequest/{id}
 * Strategy 3: ServiceRequest?subject → Task?based-on=ServiceRequest/{id}
 * Strategy 4: ServiceRequest?subject → Communication?based-on=ServiceRequest/{id}
 *             → extract Task ID from Communication.partOf → GET Task/{id}
 *
 * @param {string} localPatientId - Patient ID on the local FHIR server
 * @param {string} [server]
 * @returns {Promise<object|null>} FHIR Task resource or null
 */
export async function findTaskForPatient(localPatientId, server = REFERRAL_FHIR_SERVER) {
    try {
        // Strategy 1: Task?patient= (maps to Task.for when subject is a Patient)
        console.log(`[Task S1] Searching Task?patient=${localPatientId}`);
        const s1Resp = await fetch(`${server}/Task?patient=${localPatientId}`);
        if (s1Resp.ok) {
            const bundle = await s1Resp.json();
            const task = bundle.entry?.[0]?.resource;
            if (task) {
                console.log('[Task S1] ✓ Task found via patient reference:', task.id);
                return task;
            }
            console.log('[Task S1] No entries in bundle');
        } else {
            console.warn('[Task S1] Response not OK:', s1Resp.status);
        }

        // Fetch ServiceRequests shared by strategies 2, 3, 4
        const srIds = await findServiceRequestIds(localPatientId, server);

        if (srIds.length === 0) {
            console.log('[Task] No ServiceRequests found — cannot proceed with strategies 2/3/4');
            return null;
        }

        // Strategy 2: Task?focus=ServiceRequest/{id}
        for (const srId of srIds) {
            console.log(`[Task S2] Searching Task?focus=ServiceRequest/${srId}`);
            const s2Resp = await fetch(`${server}/Task?focus=ServiceRequest/${srId}`);
            if (s2Resp.ok) {
                const bundle = await s2Resp.json();
                const task = bundle.entry?.[0]?.resource;
                if (task) {
                    console.log('[Task S2] ✓ Task found via focus reference:', task.id);
                    return task;
                }
                console.log('[Task S2] No entries for SR', srId);
            } else {
                console.warn('[Task S2] Response not OK:', s2Resp.status, 'for SR', srId);
            }
        }

        // Strategy 3: Task?based-on=ServiceRequest/{id}
        for (const srId of srIds) {
            console.log(`[Task S3] Searching Task?based-on=ServiceRequest/${srId}`);
            const s3Resp = await fetch(`${server}/Task?based-on=ServiceRequest/${srId}`);
            if (s3Resp.ok) {
                const bundle = await s3Resp.json();
                const task = bundle.entry?.[0]?.resource;
                if (task) {
                    console.log('[Task S3] ✓ Task found via based-on reference:', task.id);
                    return task;
                }
                console.log('[Task S3] No entries for SR', srId);
            } else {
                console.warn('[Task S3] Response not OK:', s3Resp.status, 'for SR', srId);
            }
        }

        // Strategy 4: Communication?based-on=ServiceRequest/{id} → extract Task from partOf
        // Matches the pattern: Communication.basedOn → ServiceRequest, Communication.partOf → Task
        for (const srId of srIds) {
            console.log(`[Task S4] Searching Communication?based-on=ServiceRequest/${srId}`);
            const commResp = await fetch(`${server}/Communication?based-on=ServiceRequest/${srId}`);
            if (commResp.ok) {
                const commBundle = await commResp.json();
                const communications = commBundle.entry?.map(e => e.resource).filter(Boolean) ?? [];
                console.log(`[Task S4] Found ${communications.length} Communication(s) for SR`, srId);

                for (const comm of communications) {
                    const partOfRef = comm.partOf?.[0]?.reference;
                    if (partOfRef?.startsWith('Task/')) {
                        const taskId = partOfRef.replace('Task/', '');
                        console.log(`[Task S4] Communication.partOf points to Task/${taskId} — fetching directly`);
                        const taskResp = await fetch(`${server}/Task/${taskId}`);
                        if (taskResp.ok) {
                            const task = await taskResp.json();
                            console.log('[Task S4] ✓ Task fetched via Communication.partOf:', task.id);
                            return task;
                        } else {
                            console.warn(`[Task S4] Could not fetch Task/${taskId}:`, taskResp.status);
                        }
                    }
                }
            } else {
                console.warn('[Task S4] Response not OK:', commResp.status, 'for SR', srId);
            }
        }

        console.log('[Task] No Task found after all 4 strategies for patient', localPatientId);
        return null;
    } catch (error) {
        console.error('findTaskForPatient error:', error);
        throw new Error('Failed to search for Task: ' + error.message);
    }
}

/**
 * Fetch Communication resources that reference the given Task via partOf.
 * Results are sorted by sent date ascending (oldest first).
 *
 * @param {string} taskId - FHIR Task resource ID on the local server
 * @param {string} [server]
 * @returns {Promise<object[]>} Array of FHIR Communication resources (may be empty)
 */
export async function fetchCommunicationsForTask(taskId, server = REFERRAL_FHIR_SERVER) {
    try {
        const response = await fetch(`${server}/Communication?part-of=Task/${taskId}&_sort=sent`);
        if (!response.ok) {
            console.warn('fetchCommunicationsForTask: server returned', response.status);
            return [];
        }
        const bundle = await response.json();
        return bundle.entry?.map(e => e.resource).filter(Boolean) ?? [];
    } catch (error) {
        console.error('fetchCommunicationsForTask error:', error);
        throw new Error('Failed to fetch Communications for Task: ' + error.message);
    }
}

/**
 * Orchestrator: resolve local patient, find Task, fetch Communication comments.
 *
 * @param {object} patientResource - FHIR Patient from the EHR SMART client
 * @param {string} [server]
 * @returns {Promise<{task: object, communications: object[]}|null>}
 *   Returns null if no Task is found; throws on unexpected errors.
 */
export async function loadTaskData(patientResource, server = REFERRAL_FHIR_SERVER) {
    try {
        const localPatientId = await findLocalPatientId(patientResource, server);
        if (!localPatientId) {
            console.log('loadTaskData: patient not found on local FHIR server');
            return null;
        }

        const task = await findTaskForPatient(localPatientId, server);
        if (!task) {
            return null;
        }

        const communications = await fetchCommunicationsForTask(task.id, server);
        return { task, communications };
    } catch (error) {
        console.error('loadTaskData error:', error);
        throw new Error('Failed to load Task data: ' + error.message);
    }
}
