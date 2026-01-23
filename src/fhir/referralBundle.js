import { getFhirClient } from './client.js';

/**
 * Helper: normalize search or single resource response into array of resources
 * @param {Object} resp - FHIR response from client.request
 * @returns {Array<Object>} resources
 */
function resourcesFromResponse(resp) {
    if (!resp) return [];
    if (resp.resourceType === 'Bundle' && Array.isArray(resp.entry)) {
        return resp.entry.map(e => e.resource).filter(Boolean);
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
        if (referralId) {
            const resp = await client.request(`ServiceRequest/${referralId}`);
            serviceRequests = resourcesFromResponse(resp);
        } else {
            // Grab first referral ServiceRequest for patient
            // TODO, this should be changed before Prod I just want to continue for now
            const resp = await client.request(`ServiceRequest?patient=${patientId}&_count=50
                `);
            serviceRequests = resourcesFromResponse(resp);
        }
        serviceRequests.forEach(r => addResource(r));

        // 2) Patient
        const patient = (await client.request(`Patient/${patientId}`));
        addResource(patient);

        const everything = await client.request(`Patient/${patientId}/$everything?_count=2500`);
        console.log("everything bundle received:", everything);

        const { practitioners, practitionerRoles } =
        await resolvePractitionersFromBundle(client, everything);

        console.log(practitioners);

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
        // const conditionResp = await client.request(`Condition?patient=${patientId}&_count=50&code=44054006,46635009`);
        const conditionResp = await client.request(`Condition?patient=${patientId}&_count=50`);
        const conditions = resourcesFromResponse(conditionResp);
        conditions.forEach(c => addResource(c));

        // 4) Coverage (payer info)
        const coverageResp = await client.request(`Coverage?beneficiary=Patient/${patientId}&_count=50`);
        const coverages = resourcesFromResponse(coverageResp);
        coverages.forEach(cov => addResource(cov));

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
            const obs = resourcesFromResponse(obsResp);
            obs.forEach(o => addResource(o));

            // Also include any recent vitals category observations not covered by codes
            const vitCatResp = await client.request(`Observation?patient=${patientId}&category=vital-signs&_count=50`);
            const vitCat = resourcesFromResponse(vitCatResp);
            vitCat.forEach(o => addResource(o));
        }

        // Resolve collected references (practitioners, organizations, etc.)
        // Fetch references in parallel with limited concurrency
        const refPromises = refsToFetch.map(ref => fetchByReference(client, ref).catch(e => { console.warn('Reference fetch failed for', ref, e); return null; }));
        const refResults = await Promise.all(refPromises);
        refResults.forEach(fetched => {
            const arr = resourcesFromResponse(fetched);
            arr.forEach(r => addResource(r));
        });

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
            arr.forEach(r => addResource(r));
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

        orderedTypes.forEach(t => {
            const arr = byType.get(t) || [];
            arr.forEach(res => {
                const fullUrl = `${res.resourceType}/${res.id}`;
                const entry = { fullUrl, resource: res };
                if (bundleType === 'transaction') entry.request = { method: 'PUT', url: `${res.resourceType}/${res.id}` };
                bundle.entry.push(entry);
            });
        });

        // Append any remaining types not listed above
        for (const [type, arr] of byType.entries()) {
            if (orderedTypes.includes(type)) continue;
            arr.forEach(res => {
                const fullUrl = `${res.resourceType}/${res.id}`;
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
