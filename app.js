// YMCA SMART on FHIR Application
// Main application logic for handling patient data and UI

let fhirClient = null;
let patientData = null;
let localFhirServer = 'http://localhost:8080/fhir'; // Local HAPI FHIR server

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

/**
 * Initialize the SMART on FHIR application
 */
async function initializeApp() {
    try {
        // Get the FHIR client from the authorization flow
        fhirClient = await FHIR.oauth2.ready();
        
        console.log('FHIR Client initialized:', fhirClient);
        
        // Load patient data
        await loadPatientData();
        
        // Hide loading and show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the application: ' + error.message);
    }
}

/**
 * Load patient data from FHIR server
 */
async function loadPatientData() {
    try {
        // Get current patient
        const patient = await fhirClient.patient.read();
        patientData = patient;
        
        console.log('Patient data:', patient);
        
        // Update UI with patient info
        displayPatientInfo(patient);
        updateUserName(patient);
        
        // Load additional data
        await Promise.all([
            loadVitalSigns(),
            loadObservations()
        ]);
        
    } catch (error) {
        console.error('Error loading patient data:', error);
        throw new Error('Unable to load patient information');
    }
}

/**
 * Display patient information in the UI
 */
function displayPatientInfo(patient) {
    const patientInfoContainer = document.getElementById('patient-info');
    
    // Extract patient details
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

/**
 * Load and display vital signs
 */
async function loadVitalSigns() {
    try {
        const observations = await fhirClient.request(`Observation?patient=${patientData.id}&category=vital-signs&_sort=-date&_count=10`);
        
        if (observations.entry && observations.entry.length > 0) {
            displayVitalSigns(observations.entry);
        } else {
            displayEmptyVitals();
        }
        
    } catch (error) {
        console.error('Error loading vital signs:', error);
        displayEmptyVitals();
    }
}

/**
 * Display vital signs in the UI
 */
function displayVitalSigns(vitalEntries) {
    const vitalsContainer = document.getElementById('vitals');
    
    // Group vitals by type and get the most recent
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

/**
 * Display empty state for vitals
 */
function displayEmptyVitals() {
    document.getElementById('vitals').innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">💓</div>
            <p>No recent vital signs available</p>
        </div>
    `;
}

/**
 * Load and display recent observations
 */
async function loadObservations() {
    try {
        const observations = await fhirClient.request(`Observation?patient=${patientData.id}&_sort=-date&_count=20`);
        
        if (observations.entry && observations.entry.length > 0) {
            displayObservations(observations.entry);
        } else {
            displayEmptyObservations();
        }
        
    } catch (error) {
        console.error('Error loading observations:', error);
        displayEmptyObservations();
    }
}

/**
 * Display observations in the UI
 */
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

/**
 * Display empty state for observations
 */
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
 * Show error message
 */
function showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error-message').textContent = message;
}

/**
 * Logout function
 */
function logout() {
    // Clear any stored tokens and redirect to launch page
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = 'launch.html';
}

// Utility functions

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
 * Get observation name/display
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

/**
 * Get vital type information
 */
function getVitalType(code, display) {
    const vitalTypes = {
        '8310-5': { key: 'temperature', label: 'Temperature' },
        '8867-4': { key: 'heartRate', label: 'Heart Rate' },
        '9279-1': { key: 'respiratoryRate', label: 'Respiratory Rate' },
        '85354-9': { key: 'bloodPressure', label: 'Blood Pressure' },
        '8480-6': { key: 'systolic', label: 'Systolic BP' },
        '8462-4': { key: 'diastolic', label: 'Diastolic BP' },
        '2708-6': { key: 'oxygenSat', label: 'Oxygen Saturation' },
        '29463-7': { key: 'weight', label: 'Weight' },
        '8302-2': { key: 'height', label: 'Height' },
        '39156-5': { key: 'bmi', label: 'BMI' }
    };
    
    return vitalTypes[code] || (display && display.toLowerCase().includes('vital') ? 
        { key: code, label: display } : null);
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

/**
 * Submit a referral to local HAPI FHIR server
 */
async function submitYmcaReferral(programType, priority = 'routine', notes = '') {
    try {
        if (!patientData) {
            throw new Error('Patient data not available');
        }

        // First, ensure patient exists in local HAPI FHIR server
        console.log('Ensuring patient exists in local HAPI FHIR server...');
        const localPatient = await ensurePatientInLocalFhir();
        
        // Create FHIR ServiceRequest for YMCA referral
        const serviceRequest = {
            resourceType: 'ServiceRequest',
            status: 'active',
            intent: 'order',
            priority: priority, // routine, urgent, asap, stat
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
                reference: `Patient/${localPatient.id}`, // Use local patient ID
                display: getPatientName(patientData)
            },
            authoredOn: new Date().toISOString(),
            requester: {
                display: 'Healthcare Provider' // In real implementation, use provider info
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

        console.log('Submitting referral:', serviceRequest);

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
        console.log('Referral created:', createdReferral);

        // Show success message
        showReferralSuccess(createdReferral);
        
        return createdReferral;

    } catch (error) {
        console.error('Error submitting referral:', error);
        showReferralError(error.message);
        throw error;
    }
}

/**
 * Ensure patient exists in local HAPI FHIR server
 * Creates patient if it doesn't exist, returns existing patient if found
 */
async function ensurePatientInLocalFhir() {
    try {
        // First, try to find patient by identifier or name
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
                console.log('Patient found in local HAPI FHIR:', searchBundle.entry[0].resource);
                return searchBundle.entry[0].resource;
            }
        }

        // Patient not found, create new one
        console.log('Patient not found in local HAPI FHIR, creating new patient...');
        
        // Create a simplified patient resource for local HAPI FHIR
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

        // Create patient in local HAPI FHIR
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

        const createdPatient = await createResponse.json();
        console.log('Patient created in local HAPI FHIR:', createdPatient);
        return createdPatient;

    } catch (error) {
        console.error('Error ensuring patient in local HAPI FHIR:', error);
        throw new Error(`Failed to ensure patient exists in local HAPI FHIR: ${error.message}`);
    }
}

/**
 * Show referral success message
 */
function showReferralSuccess(referral) {
    const successDiv = document.createElement('div');
    successDiv.innerHTML = `
        <div style="
            position: fixed; 
            top: 20px; 
            right: 20px; 
            background: #22c55e; 
            color: white; 
            padding: 16px 24px; 
            border-radius: 8px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 400px;
        ">
            <div style="font-weight: bold; margin-bottom: 8px;">✅ Referral Submitted Successfully</div>
            <div style="font-size: 14px;">
                Referral ID: ${referral.id}<br>
                Status: ${referral.status}<br>
                Submitted to HAPI FHIR server
            </div>
        </div>
    `;
    document.body.appendChild(successDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 5000);
}

/**
 * Show referral error message
 */
function showReferralError(errorMessage) {
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
        <div style="
            position: fixed; 
            top: 20px; 
            right: 20px; 
            background: #ef4444; 
            color: white; 
            padding: 16px 24px; 
            border-radius: 8px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 400px;
        ">
            <div style="font-weight: bold; margin-bottom: 8px;">❌ Referral Submission Failed</div>
            <div style="font-size: 14px;">
                Error: ${errorMessage}
            </div>
        </div>
    `;
    document.body.appendChild(errorDiv);
    
    // Auto-remove after 7 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 7000);
}

/**
 * Handle referral form submission
 */
async function handleReferralSubmission() {
    const programSelect = document.getElementById('program-select');
    const prioritySelect = document.getElementById('priority-select');
    const notesTextarea = document.getElementById('referral-notes');
    const submitBtn = document.getElementById('submit-referral-btn');

    // Validate form
    if (!programSelect.value) {
        alert('Please select a YMCA program');
        return;
    }

    // Disable button during submission
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Preparing patient data...';

    try {
        await submitYmcaReferral(
            programSelect.value,
            prioritySelect.value,
            notesTextarea.value
        );

        // Reset form on success
        programSelect.value = '';
        prioritySelect.value = 'routine';
        notesTextarea.value = '';

    } catch (error) {
        console.error('Referral submission failed:', error);
    } finally {
        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 Submit Referral to HAPI FHIR Server';
    }
}

// Expose utility functions for testing if in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getPatientName,
        getPatientIdentifier,
        getPatientAddress,
        getPatientPhone,
        getObservationName,
        getObservationValue,
        getVitalType,
        formatDate
    };
}
