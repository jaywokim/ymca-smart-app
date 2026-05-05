# YMCA SMART App — Vendor Onboarding Guide

This guide explains how to onboard a new EHR vendor (e.g. Epic, Cerner, athenahealth) to the YMCA SMART on FHIR application. A single deployed instance of the app serves all vendors simultaneously — no code changes are required per vendor, only a manifest update and container rebuild.

---

## How Multi-Vendor Works

When an EHR launches the app it passes an `iss` (issuer) URL as a query parameter, identifying itself. The app extracts the hostname from that URL and looks it up in the `client_ids` map in `smart-app-manifest.json` to find the correct OAuth2 `client_id` for that vendor.

```
EHR launches app
  → passes ?iss=https://fhir.epic.com/...&launch=...
  → app extracts hostname: fhir.epic.com
  → looks up client_ids["fhir.epic.com"] in manifest
  → uses that client_id for OAuth2 authorization
```

If the ISS hostname is not found in the map, the `default` entry is used (covers SMART Health IT sandbox and any generic FHIR R4 server).

---

## Step-by-Step: Onboarding a New Vendor

### 1. Register the App with the Vendor

Each EHR vendor has its own developer/app registration portal. Provide the following details:

| Field | Value |
|---|---|
| App Name | `YMCA Health Dashboard` |
| Application Type | `Public` (no client secret) |
| Launch URL | `https://your-deployed-domain/launch.html` |
| Redirect URI | `https://your-deployed-domain/index.html` |
| Scopes | `launch patient/*.read openid fhirUser` |
| FHIR Version | R4 (4.0.1) |
| Token Auth Method | `none` (public client) |

**Vendor registration portals:**

| Vendor | Portal |
|---|---|
| Epic | [fhir.epic.com/developer](https://fhir.epic.com/developer) |
| Oracle Health (Cerner) | [code.cerner.com](https://code.cerner.com) |
| athenahealth | [developer.athenahealth.com](https://developer.athenahealth.com) |
| Meditech | Contact Meditech vendor representative |
| Generic FHIR R4 | See vendor-specific documentation |

After registration the vendor will issue a **`client_id`** (sometimes called App ID or Client Key).

---

### 2. Identify the Vendor's FHIR Base URL (ISS)

This is the URL the EHR passes as the `iss` parameter at launch time. Get it from the vendor or their developer documentation.

Examples:

| Vendor | Example ISS URL |
|---|---|
| Epic (sandbox) | `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4` |
| Epic (production) | `https://<hospital-subdomain>.epic.com/interconnect-fhir-oauth/api/FHIR/R4` |
| Oracle Health | `https://fhir-myrecord.cerner.com/r4/<tenant-id>` |
| SMART Health IT | `https://launch.smarthealthit.org/v/r4/fhir` |

> Note: Sandbox and production ISS URLs typically have different hostnames. Register and add both separately if needed.

---

### 3. Update `smart-app-manifest.json`

Add an entry to the `client_ids` map using the **hostname only** from the ISS URL as the key:

```json
{
  "client_ids": {
    "fhir.epic.com": "your-epic-sandbox-client-id",
    "hospital.epic.com": "your-epic-production-client-id",
    "fhir-myrecord.cerner.com": "your-cerner-client-id",
    "default": "51b6933a-7191-4521-ba51-71e779f01cc5"
  }
}
```

**Rules:**
- Key = hostname only (e.g. `fhir.epic.com`, not the full URL path)
- `default` is the fallback for any unrecognized ISS — keep it as the SMART Health IT / generic client ID
- Never remove the `default` entry

---

### 4. Update the Manifest — No Rebuild Required

The manifest file is mounted from the host filesystem into the container. Edit `smart-app-manifest.json` directly and the running container picks up the change immediately — no rebuild or restart needed.

Simply save the file and test. The browser fetches `smart-app-manifest.json` fresh on each launch, so changes are live instantly.

**First-time container startup** (one-time setup, already done in this repo):
```bash
docker run -d -p 3000:80 --name ymca-smart-app \
  -v "$(pwd)/smart-app-manifest.json:/usr/share/nginx/html/smart-app-manifest.json:ro" \
  ymca-smart-app
```

On Windows (PowerShell):
```powershell
docker run -d -p 3000:80 --name ymca-smart-app `
  -v "C:\code\ymca-smart-app\smart-app-manifest.json:/usr/share/nginx/html/smart-app-manifest.json:ro" `
  ymca-smart-app
```

> A **rebuild is only needed** if you change HTML, JavaScript, or CSS files — not for manifest-only vendor changes.

---

### 5. Test the Integration

Use the vendor's sandbox environment to verify the full SMART launch flow:

1. Launch the app from the vendor's test environment or sandbox launcher
2. Confirm the OAuth2 redirect goes to the correct vendor authorization server
3. Log in with a test patient account (vendor will provide test credentials)
4. Verify patient demographics and observations load correctly in the app
5. Check the browser DevTools console for any CORS, token, or scope errors

**Test checklist:**

- [ ] `launch.html` receives `iss` and `launch` query parameters
- [ ] OAuth2 redirects to the correct vendor authorization server
- [ ] Access token is returned and accepted
- [ ] `Patient` resource loads — name, DOB, demographics visible
- [ ] `Observation` resources load — vital signs / lab results listed
- [ ] No CORS errors in the browser console
- [ ] Mobile layout works at 375px viewport width

---

## Scope Requirements by Vendor

Some vendors require explicit scope approval during app registration. If data is missing after a successful login, verify these scopes are approved:

| Scope | Purpose |
|---|---|
| `launch` | SMART EHR launch context |
| `patient/Patient.read` | Read patient demographics |
| `patient/Observation.read` | Read vital signs and lab results |
| `openid` | OpenID Connect identity token |
| `fhirUser` | Identify the logged-in user |

> Some vendors accept `patient/*.read` (wildcard); others require resource-specific scopes like `patient/Patient.read`. Check vendor docs if you see authorization or missing-data errors.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| `invalid_client` error | Wrong `client_id` for this vendor | Verify ISS hostname matches key in `client_ids` map |
| `redirect_uri_mismatch` | Redirect URI not registered with vendor | Add exact URI to vendor app registration portal |
| No patient data after login | Scopes not approved | Check app registration scopes match what's requested |
| CORS error on token endpoint | Vendor requires confidential client | Contact vendor — may need backend token proxy |
| Data loads but observations missing | Resource-specific scope not approved | Add `patient/Observation.read` to registration |
| `iss` not recognized | Vendor ISS hostname not in `client_ids` map | Add entry to `client_ids` and save — unknown vendors are blocked by design |

---

## Environment Management

For managing multiple deploy environments (local, staging, production):

- Use separate manifest files: `smart-app-manifest.local.json`, `smart-app-manifest.prod.json`
- Pass the target manifest into Docker at build time using a build arg or by copying the correct file:
  ```dockerfile
  COPY smart-app-manifest.prod.json /usr/share/nginx/html/smart-app-manifest.json
  ```
- **Never commit production `client_id` values to source control** — store them in a secrets manager (Azure Key Vault, AWS Secrets Manager, etc.) and inject at deploy time

---

## Vendor Onboarding Checklist Summary

- [ ] App registered with vendor portal
- [ ] `client_id` obtained from vendor
- [ ] ISS URL / hostname confirmed with vendor
- [ ] `client_ids` map updated in `smart-app-manifest.json`
- [ ] Redirect URI registered with vendor matches manifest `redirect_uris`
- [ ] Manifest saved — container picks up changes automatically (no rebuild needed)
- [ ] Full SMART launch flow tested with vendor sandbox
- [ ] Test checklist above completed and signed off

---

## Contacts

| Role | Responsibility |
|---|---|
| YMCA App Owner | App registration, manifest updates, sign-off |
| Vendor Integration Lead | Provides ISS URL, `client_id`, test patient credentials |
| IT / DevOps | Rebuilds and redeploys Docker container |
