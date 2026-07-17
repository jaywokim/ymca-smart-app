export const VITAL_TYPES_URL = "/src/config/vitalTypes.json";

/**
 * Base URL for the HAPI FHIR server used for referral submissions and task lookups.
 *
 * This must be a directly reachable FHIR endpoint (the browser calls it via fetch()).
 * When the app is hosted on Azure Static Web Apps (or any HTTPS host), this MUST be an
 * HTTPS URL, otherwise the browser will block it as mixed content.
 *
 * Examples:
 *   Local dev:  'http://localhost:8080/fhir'
 *   Hosted:     'https://your-hapi-fhir-host.example.com/fhir'
 */
export const REFERRAL_FHIR_SERVER = 'https://your-hapi-fhir-host.example.com/fhir';