import { getFhirClient } from './client.js';

/**
 * Helper: normalize search or single resource response into array of resources
 * @param {Object} resp - FHIR response from client.request
 * @returns {Array<Object>} resources
 */
function resourcesFromResponse(resp) {
    if (!resp) return [];
    if (resp.resourceType === 'Bundle') {
        if (Array.isArray(resp.entry)) {
            return resp.entry.map(e => e.resource).filter(Boolean);
        }
        return [];
    }
    if (resp.resourceType) {
        return [resp];
    }
    return [];
}

/**
 * Helper: fetch a resource by a reference string (e.g. "Practitioner/123")
 * returns null when not found
 */
async function fetchByReference(client, ref) {
    if (!ref) return null;
    // If ref is an object with `.reference`, use that
    const refStr = typeof ref === 'string' ? ref : (ref.reference || null);
    if (!refStr) return null;
    try {
        // If ref string looks like ResourceType/id, request that directly
        return await client.request(refStr);
    } catch (e) {
        // Try a search fallback (e.g. when ref contains a full URL)
        try {
            const parts = refStr.split('/');
            const id = parts.pop();
            const type = parts.pop();
            if (type && id) {
                return await client.request(`${type}/${id}`);
            }
        } catch (e2) {
            console.warn('fetchByReference fallback failed for', refStr, e2);
        }
    }
    return null;
}

/**
 * Build a referral Bundle for a patient including required resources.
 * @param {string} patientId - Patient id
 * @param {Object} options - Options
 * @param {string} [options.bundleType='collection'] - 'transaction' or 'collection'
 * @param {boolean} [options.includeObservations=true]
 * @param {string} [options.referralId] - optional ServiceRequest id to include
 * @returns {Promise<Object>} - FHIR Bundle
 */
async function buildReferralBundle(patientId, options = {}) {
    console.log('Running v2 of buildReferralBundle with custom YMCA fallbacks...');
    const client = getFhirClient();
    const bundleType = options.bundleType || 'collection';
    const includeObservations = options.includeObservations !== false;
    const referralId = options.referralId;

    if (!patientId) throw new Error('patientId is required');

    try {
        const resources = [];
        const seen = new Set();
        // Map to collect resources by type for ordered assembly
        const byType = new Map();
        function addResource(res) {
            if (!res || !res.resourceType || !res.id) return;
            const key = `${res.resourceType}/${res.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            resources.push(res);
            if (!byType.has(res.resourceType)) byType.set(res.resourceType, []);
            byType.get(res.resourceType).push(res);
        }

        // 1) ServiceRequest(s)
        let serviceRequests = [];
        if (options.serviceRequest) {
            // Allows passing a pre-built ServiceRequest directly instead of fetching
            serviceRequests = [options.serviceRequest];
        } else if (referralId) {
            const resp = await client.request(`ServiceRequest/${referralId}`);
            serviceRequests = resourcesFromResponse(resp);
        } else {
            // Grab first referral ServiceRequest for patient
            // TODO, this should be changed before Prod I just want to continue for now
            try {
                const resp = await client.request(`ServiceRequest?patient=${patientId}&_count=50`);
                serviceRequests = resourcesFromResponse(resp);
            } catch (srError) {
                if (srError?.status === 403 || srError?.response?.status === 403) {
                    console.warn('ServiceRequest scope not granted or no referrals accessible (403) — continuing bundle build without ServiceRequests.');
                } else {
                    throw srError;
                }
            }
        }
        serviceRequests.forEach(r => addResource(r));

        // 2) Patient
        const patient = options.patient || (await client.request(`Patient/${patientId}`));
        addResource(patient);

        const everything = await client.request(`Patient/${patientId}/$everything?_count=2500`);
        console.log("everything bundle received:", everything);

        const { practitioners, practitionerRoles } =
        await resolvePractitionersFromBundle(client, everything);

        console.log("Practitioners returned:", practitioners.length);
        
        // Format and add Practitioners to bundle
        practitioners.map(formatPractitionerForReferral).forEach(p => p && addResource(p));

        // Collect references to resolve: practitioners, organizations, supportingInfo
        const refsToFetch = [];
        serviceRequests.forEach(sr => {
            const requesterRef = sr.requester && sr.requester.reference;
            const performerRef = sr.performer && sr.performer.reference;
            if (requesterRef) refsToFetch.push(requesterRef);
            if (performerRef) refsToFetch.push(performerRef);
            if (Array.isArray(sr.supportingInfo)) {
                sr.supportingInfo.forEach(si => { if (si.reference) refsToFetch.push(si.reference); });
            }
        });

        // 3) Conditions (diabetes)
        // Restricting specifically to diabetes SNOMED codes to avoid oversharing patient health info
        const conditionResp = await client.request(`Condition?patient=${patientId}&_count=50&code=44054006,46635009`);
        const conditions = resourcesFromResponse(conditionResp).map(formatConditionForReferral);
        conditions.forEach(c => c && addResource(c));

        // 4) Coverage (payer info)
        const coverageResp = await client.request(`Coverage?beneficiary=Patient/${patientId}&_count=50`);
        const coverages = resourcesFromResponse(coverageResp).map(formatCoverageForReferral);
        
        // Ensure at least one Coverage exists for gapless profile enforcement
        if (coverages.length === 0) {
            console.log('No Coverage found in EHR, generating fallback Self-Pay Coverage.');
            const fallbackCoverageId = crypto.randomUUID ? crypto.randomUUID() : 'fallback-coverage-1';
            coverages.push(formatCoverageForReferral({
                resourceType: 'Coverage',
                id: fallbackCoverageId,
                status: 'active',
                type: {
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                        code: 'PAY',
                        display: 'Payment'
                    }]
                },
                subscriberId: 'self-pay-000',
                beneficiary: { reference: `Patient/${patientId}` },
                payor: [{ reference: `Patient/${patientId}` }]
            }));
        }
        
        coverages.forEach(cov => cov && addResource(cov));

        // 5) Observations (vitals & labs)
        if (includeObservations) {
            // Vital signs
            // Fetch observations with specific LOINC codes for lipid panel and vital signs
            const loincCodes = [
                // Lipid panel
                '2571-8','2085-9','2089-1','2093-3',
                // Vitals
                '85354-9','8480-6','8462-4','8302-2','29463-7','39156-5','72514-3'
            ].join(',');

            const obsResp = await client.request(`Observation?patient=${patientId}&_count=200&code=${loincCodes}`);
            const obs = resourcesFromResponse(obsResp).map(formatObservationForReferral);
            obs.forEach(o => o && addResource(o));

            // Also include any recent vitals category observations not covered by codes
            const vitCatResp = await client.request(`Observation?patient=${patientId}&category=vital-signs&_count=50`);
            const vitCat = resourcesFromResponse(vitCatResp).map(formatObservationForReferral);
            vitCat.forEach(o => o && addResource(o));
        }

        // Filter out our known local references so we don't 404
        const remoteRefsToFetch = refsToFetch.filter(ref => ref !== 'Organization/ymca-diabetes-program');

        // Resolve collected references (practitioners, organizations, etc.)
        // Fetch references in parallel with limited concurrency
        const refPromises = remoteRefsToFetch.map(ref => fetchByReference(client, ref).catch(e => { console.warn('Reference fetch failed for', ref, e); return null; }));
        const refResults = await Promise.all(refPromises);
        refResults.forEach(fetched => {
            const arr = resourcesFromResponse(fetched);
            arr.forEach(r => {
                if (r.resourceType === 'Organization') {
                    addResource(formatOrganizationForReferral(r));
                } else if (r.resourceType === 'Practitioner') {
                    addResource(formatPractitionerForReferral(r));
                } else {
                    addResource(r);
                }
            });
        });

        // Always add the fallback local YMCA Organization explicitly
        addResource(formatOrganizationForReferral({
            resourceType: 'Organization',
            id: 'ymca-diabetes-program',
            active: true,
            name: 'YMCA Health Programs',
            identifier: [{
                system: 'http://hl7.org/fhir/sid/us-npi',
                value: '0000000000'
            }],
            telecom: [{
                system: 'email',
                value: 'health-programs@ymca.org'
            }],
            address: [{
                line: ['123 YMCA Way'],
                city: 'Chicago',
                state: 'IL',
                postalCode: '60601',
                country: 'US'
            }]
        }));

        // Also attempt to resolve Coverage.payor organizations
        // Resolve Coverage.payor organizations in parallel and await them
        const payorRefs = [];
        coverages.forEach(cov => {
            if (cov.payor && Array.isArray(cov.payor)) {
                cov.payor.forEach(p => payorRefs.push(p.reference || p));
            }
        });
        const payorResults = await Promise.all(payorRefs.map(r => fetchByReference(client, r).catch(() => null)));
        payorResults.forEach(fetched => {
            const arr = resourcesFromResponse(fetched);
            arr.forEach(r => {
                if (r.resourceType === 'Organization') {
                    addResource(formatOrganizationForReferral(r));
                } else {
                    addResource(r);
                }
            });
        });

        // Assemble Bundle
        const bundle = {
            resourceType: 'Bundle',
            type: bundleType,
            entry: []
        };

        // Assemble entries in required order per profile
        const orderedTypes = [
            'ServiceRequest',
            'Patient',
            'Practitioner',
            'Organization',
            'Coverage',
            'Condition',
            'Observation'
        ];

        const baseUrl = client && client.state && client.state.serverUrl ? client.state.serverUrl.replace(/\/$/, '') : '';

        orderedTypes.forEach(t => {
            const arr = byType.get(t) || [];
            arr.forEach(res => {
                const fullUrl = baseUrl ? `${baseUrl}/${res.resourceType}/${res.id}` : `${res.resourceType}/${res.id}`;
                const entry = { fullUrl, resource: res };
                if (bundleType === 'transaction') entry.request = { method: 'PUT', url: `${res.resourceType}/${res.id}` };
                bundle.entry.push(entry);
            });
        });

        // Append any remaining types not listed above
        for (const [type, arr] of byType.entries()) {
            if (orderedTypes.includes(type)) continue;
            arr.forEach(res => {
                const fullUrl = baseUrl ? `${baseUrl}/${res.resourceType}/${res.id}` : `${res.resourceType}/${res.id}`;
                const entry = { fullUrl, resource: res };
                if (bundleType === 'transaction') entry.request = { method: 'PUT', url: `${res.resourceType}/${res.id}` };
                bundle.entry.push(entry);
            });
        }

        console.log(`Built referral bundle with ${bundle.entry.length} entries for patient ${patientId}`);
        // Log the full Bundle so it's easy to inspect locally
        try {
            console.log(JSON.stringify(bundle, null, 2));
        } catch (e) {
            console.log('Unable to stringify bundle for logging', e);
            console.log(bundle);
        }
        return bundle;
    } catch (error) {
        console.error('Error building referral bundle:', error);
        throw error;
    }
}

/**
 * Formats an Observation resource for the referral bundle, extracting or standardizing fields.
 * 
 * @param {Object} rawObservation - The raw FHIR Observation resource
 * @returns {Object} - The formatted FHIR Observation resource
 */
function formatObservationForReferral(rawObservation) {
    if (!rawObservation) return null;

    const observation = JSON.parse(JSON.stringify(rawObservation)); // deep copy

    // 1. Enforce status
    if (!observation.status) {
        observation.status = 'final';
    }

    // 2. Enforce category
    if (!observation.category || !Array.isArray(observation.category) || observation.category.length === 0) {
        let isLaboratory = false;

        if (observation.code && observation.code.coding && Array.isArray(observation.code.coding) && observation.code.coding.length > 0) {
            const laboratoryCodes = ['2571-8', '2085-9', '2089-1', '2093-3'];
            isLaboratory = observation.code.coding.some(c => 
                c.system === 'http://loinc.org' && laboratoryCodes.includes(c.code)
            );
        }

        observation.category = [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: isLaboratory ? 'laboratory' : 'vital-signs'
            }]
        }];
    }

    // 3. Enforce performer
    if (!observation.performer || !Array.isArray(observation.performer) || observation.performer.length === 0) {
        if (observation.subject) {
            observation.performer = [observation.subject];
        }
    }

    return observation;
}

/**
 * Formats a Coverage resource for the referral bundle, extracting or standardizing fields.
 * 
 * @param {Object} rawCoverage - The raw FHIR Coverage resource
 * @returns {Object} - The formatted FHIR Coverage resource
 */
function formatCoverageForReferral(rawCoverage) {
    if (!rawCoverage) return null;

    const coverage = JSON.parse(JSON.stringify(rawCoverage)); // deep copy

    // 1. Enforce status
    if (!coverage.status) {
        coverage.status = 'active';
    }

    // 2. Enforce type
    if (!coverage.type || !coverage.type.coding || coverage.type.coding.length === 0) {
        coverage.type = {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                code: 'UNK',
                display: 'Unknown'
            }]
        };
    } else {
        // Find if they already have an ActCode
        const hasActCode = coverage.type.coding.some(c => c.system === 'http://terminology.hl7.org/CodeSystem/v3-ActCode');
        if (!hasActCode) {
            coverage.type.coding.push({
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                code: 'UNK',
                display: 'Unknown'
            });
        }
    }

    // subscriberId, beneficiary, Class and Payor are left as-is allowing for structural EHR passthrough
    return coverage;
}

/**
 * Formats a Practitioner resource for the referral bundle, extracting or standardizing fields.
 * 
 * @param {Object} rawPractitioner - The raw FHIR Practitioner resource
 * @returns {Object} - The formatted FHIR Practitioner resource
 */
function formatPractitionerForReferral(rawPractitioner) {
    if (!rawPractitioner) return null;

    const practitioner = JSON.parse(JSON.stringify(rawPractitioner)); // deep copy

    // 1. Enforce identifier (NPI)
    if (!practitioner.identifier) {
        practitioner.identifier = [];
    }
    const hasNpi = practitioner.identifier.some(id => id.system === 'http://hl7.org/fhir/sid/us-npi');
    if (!hasNpi) {
        practitioner.identifier.push({
            system: 'http://hl7.org/fhir/sid/us-npi',
            value: '0000000000'
        });
    }

    // 2. Enforce name
    if (!practitioner.name || practitioner.name.length === 0) {
        practitioner.name = [{
            family: 'Unknown',
            given: ['Unknown']
        }];
    } else {
        practitioner.name.forEach(n => {
            if (!n.family) n.family = 'Unknown';
            if (!n.given || n.given.length === 0) n.given = ['Unknown'];
        });
    }

    // 3. Enforce qualifications
    if (!practitioner.qualification || practitioner.qualification.length === 0) {
        practitioner.qualification = [{
            code: {
                text: 'Unknown Credential'
            }
        }];
    }

    return practitioner;
}

/**
 * Formats an Organization resource for the referral bundle, extracting or standardizing fields.
 * 
 * @param {Object} rawOrganization - The raw FHIR Organization resource
 * @returns {Object} - The formatted FHIR Organization resource
 */
function formatOrganizationForReferral(rawOrganization) {
    if (!rawOrganization) return null;

    const organization = JSON.parse(JSON.stringify(rawOrganization)); // deep copy

    // 1. Enforce identifier
    if (!organization.identifier || organization.identifier.length === 0) {
        organization.identifier = [{
            value: 'unknown-org'
        }];
    }

    // 2. Enforce active
    if (organization.active === undefined) {
        organization.active = true;
    }

    // 3. Enforce type
    if (!organization.type || organization.type.length === 0) {
        organization.type = [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                code: 'prov',
                display: 'Healthcare Provider'
            }]
        }];
    }

    // 4. Enforce name
    if (!organization.name) {
        organization.name = 'Unknown Organization';
    }

    // 5. Enforce telecom & address arrays to exist if missing
    if (!organization.telecom) {
        organization.telecom = [];
    }
    if (!organization.address) {
        organization.address = [];
    }

    return organization;
}

/**
 * Formats a Condition resource for the referral bundle, extracting or standardizing fields.
 * 
 * @param {Object} rawCondition - The raw FHIR Condition resource
 * @returns {Object} - The formatted FHIR Condition resource
 */
function formatConditionForReferral(rawCondition) {
    if (!rawCondition) return null;

    const condition = JSON.parse(JSON.stringify(rawCondition)); // deep copy

    // 1. Enforce clinicalStatus
    if (!condition.clinicalStatus) {
        condition.clinicalStatus = {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                code: 'active',
                display: 'Active'
            }]
        };
    }

    // 2. Enforce verificationStatus
    if (!condition.verificationStatus) {
        condition.verificationStatus = {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
                code: 'confirmed',
                display: 'Confirmed'
            }]
        };
    }

    // 3. Enforce category
    if (!condition.category || condition.category.length === 0) {
        condition.category = [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'problem-list-item',
                display: 'Problem List Item'
            }]
        }];
    }

    return condition;
}

async function resolvePractitionersFromBundle(client, everythingBundle) {
  const refs = collectRefs(everythingBundle, ["Practitioner", "PractitionerRole"]);

  const practitionerIds = [];
  const practitionerRoleIds = [];

  for (const ref of refs) {
    const [type, id] = ref.split("/");
    if (!id) continue;

    if (type === "Practitioner") practitionerIds.push(id);
    if (type === "PractitionerRole") practitionerRoleIds.push(id);
  }

  const out = {
    practitioners: [],
    practitionerRoles: []
  };

  // Fetch Practitioners
  if (practitionerIds.length) {
    const bundle = await client.request(
      `Practitioner?_id=${practitionerIds.join(",")}&_count=${practitionerIds.length}`
    );
    out.practitioners = (bundle.entry ?? []).map(e => e.resource);
  }

  // Fetch PractitionerRoles (optional)
  if (practitionerRoleIds.length) {
    const bundle = await client.request(
      `PractitionerRole?_id=${practitionerRoleIds.join(",")}&_count=${practitionerRoleIds.length}`
    );
    out.practitionerRoles = (bundle.entry ?? []).map(e => e.resource);
  }

  return out;
}

function collectRefs(bundle, resourceTypes = ["Practitioner", "PractitionerRole"]) {
  const wanted = new Set(resourceTypes);
  const refs = new Set();

  function walk(node) {
    if (!node || typeof node !== "object") return;

    // FHIR reference objects look like: { reference: "Type/id", display: "..." }
    if (typeof node.reference === "string") {
      const ref = node.reference; // e.g. "Practitioner/123"
      const [type] = ref.split("/");
      if (wanted.has(type)) refs.add(ref);
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
    } else {
      Object.values(node).forEach(walk);
    }
  }

  (bundle.entry ?? []).forEach(e => walk(e.resource));
  return Array.from(refs);
}

export { buildReferralBundle };
