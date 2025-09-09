import {
    getPatientName,
    getPatientIdentifier,
    getPatientAddress,
    getPatientPhone
} from '../src/fhir/patient.js';

describe('Patient Utility Functions', () => {
    describe('getPatientName', () => {
        it('returns full name when given and family are present', () => {
            const patient = { name: [{ given: ['Jane', 'A.'], family: 'Doe' }] };
            expect(getPatientName(patient)).toBe('Jane A. Doe');
        });
        it('returns family name only if given is missing', () => {
            const patient = { name: [{ family: 'Doe' }] };
            expect(getPatientName(patient)).toBe('Doe');
        });
        it('returns given name only if family is missing', () => {
            const patient = { name: [{ given: ['Jane'] }] };
            expect(getPatientName(patient)).toBe('Jane');
        });
        it('returns Unknown if name array is empty', () => {
            const patient = { name: [] };
            expect(getPatientName(patient)).toBe('Unknown');
        });
        it('returns Unknown if name is missing', () => {
            expect(getPatientName({})).toBe('Unknown');
        });
    });

    describe('getPatientIdentifier', () => {
        it('returns identifier value for matching type', () => {
            const patient = {
                identifier: [
                    { type: { coding: [{ code: 'MR' }] }, value: '12345' },
                    { type: { coding: [{ code: 'SS' }] }, value: '999-99-9999' }
                ]
            };
            expect(getPatientIdentifier(patient, 'MR')).toBe('12345');
            expect(getPatientIdentifier(patient, 'SS')).toBe('999-99-9999');
        });
        it('returns null if no identifier matches type', () => {
            const patient = {
                identifier: [
                    { type: { coding: [{ code: 'MR' }] }, value: '12345' }
                ]
            };
            expect(getPatientIdentifier(patient, 'SS')).toBeNull();
        });
        it('returns null if identifier is missing', () => {
            expect(getPatientIdentifier({}, 'MR')).toBeNull();
        });
    });

    describe('getPatientAddress', () => {
        it('returns formatted address with all fields', () => {
            const patient = {
                address: [{
                    line: ['123 Main St', 'Apt 4'],
                    city: 'Springfield',
                    state: 'IL',
                    postalCode: '62704'
                }]
            };
            expect(getPatientAddress(patient)).toBe('123 Main St, Apt 4, Springfield, IL, 62704');
        });
        it('returns formatted address with partial fields', () => {
            const patient = {
                address: [{
                    line: ['456 Oak Ave'],
                    city: 'Metropolis'
                }]
            };
            expect(getPatientAddress(patient)).toBe('456 Oak Ave, Metropolis');
        });
        it('returns Not available if address is empty', () => {
            const patient = { address: [] };
            expect(getPatientAddress(patient)).toBe('Not available');
        });
        it('returns Not available if address is missing', () => {
            expect(getPatientAddress({})).toBe('Not available');
        });
    });

    describe('getPatientPhone', () => {
        it('returns phone value if present', () => {
            const patient = {
                telecom: [
                    { system: 'email', value: 'test@example.com' },
                    { system: 'phone', value: '555-1234' }
                ]
            };
            expect(getPatientPhone(patient)).toBe('555-1234');
        });
        it('returns Not available if no phone entry', () => {
            const patient = {
                telecom: [
                    { system: 'email', value: 'test@example.com' }
                ]
            };
            expect(getPatientPhone(patient)).toBe('Not available');
        });
        it('returns Not available if telecom is missing', () => {
            expect(getPatientPhone({})).toBe('Not available');
        });
    });
});