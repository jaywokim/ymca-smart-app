const DIABETES_CONDITION_CODES = ['44054006', '46635009'];

function normalizeFhirResponse(response) {
    if (!response) return [];
    if (response.resourceType === 'Bundle' && Array.isArray(response.entry)) {
        return response.entry.map(entry => entry.resource).filter(Boolean);
    }
    if (response.resourceType) {
        return [response];
    }
    return [];
}

function isDiabetesCondition(condition) {
    if (!condition?.code?.coding) return false;
    return condition.code.coding.some(coding => DIABETES_CONDITION_CODES.includes(String(coding.code)));
}

export async function fetchDiabetesConditions(fhirClient, patientId) {
    if (!fhirClient || !patientId) return [];
    const codeQuery = DIABETES_CONDITION_CODES.map(encodeURIComponent).join(',');
    try {
        const response = await fhirClient.request(`Condition?patient=${patientId}&_count=50&code=${codeQuery}`);
        const resources = normalizeFhirResponse(response);
        return resources.filter(isDiabetesCondition);
    } catch (error) {
        console.error('Unable to fetch diabetes conditions:', error);
        return [];
    }
}

export function buildConditionReasonReferences(conditions = []) {
    return conditions
        .map(condition => {
            if (!condition?.id) return null;
            const display = condition?.code?.text || condition?.code?.coding?.[0]?.display;
            const identifier = Array.isArray(condition.identifier) ? condition.identifier[0] : undefined;
            return {
                reference: `Condition/${condition.id}`,
                display,
                identifier
            };
        })
        .filter(reference => !!reference?.reference);
}
