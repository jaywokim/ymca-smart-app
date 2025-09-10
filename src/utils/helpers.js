// This file contains various helper functions used throughout the application.

// function getPatientName(patient) {
//     if (patient.name && patient.name.length > 0) {
//         const name = patient.name[0];
//         const given = name.given ? name.given.join(' ') : '';
//         const family = name.family || '';
//         return `${given} ${family}`.trim() || 'Unknown';
//     }
//     return 'Unknown';
// }

// function getPatientIdentifier(patient, type) {
//     if (patient.identifier) {
//         const identifier = patient.identifier.find(id => 
//             id.type && id.type.coding && 
//             id.type.coding.some(coding => coding.code === type)
//         );
//         return identifier ? identifier.value : null;
//     }
//     return null;
// }

// function getPatientAddress(patient) {
//     if (patient.address && patient.address.length > 0) {
//         const address = patient.address[0];
//         const parts = [];
//         if (address.line) parts.push(...address.line);
//         if (address.city) parts.push(address.city);
//         if (address.state) parts.push(address.state);
//         if (address.postalCode) parts.push(address.postalCode);
//         return parts.join(', ') || 'Not available';
//     }
//     return 'Not available';
// }

// function getPatientPhone(patient) {
//     if (patient.telecom) {
//         const phone = patient.telecom.find(contact => contact.system === 'phone');
//         return phone ? phone.value : 'Not available';
//     }
//     return 'Not available';
// }

// function getObservationName(observation) {
//     if (observation.code) {
//         if (observation.code.text) {
//             return observation.code.text;
//         }
//         if (observation.code.coding && observation.code.coding.length > 0) {
//             return observation.code.coding[0].display || observation.code.coding[0].code;
//         }
//     }
//     return 'Unknown Observation';
// }

// function getObservationValue(observation) {
//     if (observation.valueQuantity) {
//         const value = observation.valueQuantity.value;
//         const unit = observation.valueQuantity.unit || observation.valueQuantity.code || '';
//         return `${value} ${unit}`.trim();
//     }
    
//     if (observation.valueString) {
//         return observation.valueString;
//     }
    
//     if (observation.valueCodeableConcept) {
//         if (observation.valueCodeableConcept.text) {
//             return observation.valueCodeableConcept.text;
//         }
//         if (observation.valueCodeableConcept.coding && observation.valueCodeableConcept.coding.length > 0) {
//             return observation.valueCodeableConcept.coding[0].display || observation.valueCodeableConcept.coding[0].code;
//         }
//     }
    
//     if (observation.component && observation.component.length > 0) {
//         return observation.component.map(comp => {
//             const compValue = getObservationValue(comp);
//             const compName = getObservationName(comp);
//             return `${compName}: ${compValue}`;
//         }).join(', ');
//     }
    
//     return 'No value';
// }

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

export {
    getVitalType
};