# Deploying the YMCA SMART App to Azure Static Web Apps

This guide describes how to deploy the YMCA SMART on FHIR application to
**Azure Static Web Apps (SWA)** using an **Azure DevOps (ADO)** pipeline.

The app is a **no-build static site**: vanilla JavaScript ES modules are served
directly from the repository, and the `fhirclient` library is loaded from a CDN.
There is no bundler or compile step, so deployment simply publishes the files
as-is. `node_modules` (used only for local tests) is never uploaded.

---

## 1. Overview

| Item | Value |
|------|-------|
| Hosting | Azure Static Web Apps |
| CI/CD | Azure DevOps pipeline ([azure-pipelines.yml](azure-pipelines.yml)) |
| Build step | None (`skip_app_build: true`) |
| App content root | Repository root (`/`) |
| Runtime config | [staticwebapp.config.json](staticwebapp.config.json) |

### Files added for Azure deployment

- **[staticwebapp.config.json](staticwebapp.config.json)** — SWA runtime
  configuration (MIME types, security headers, fallback routing). Replaces the
  behavior previously handled by [nginx.conf](nginx.conf).
- **[azure-pipelines.yml](azure-pipelines.yml)** — ADO pipeline that runs tests
  and deploys to SWA.

> The existing [Dockerfile](Dockerfile), [nginx.conf](nginx.conf), and
> [docker-compose.yml](docker-compose.yml) remain for local/container use and
> are **not** used by Azure Static Web Apps.

---

## 2. Prerequisites

- An Azure subscription with permission to create resources.
- An Azure DevOps project containing this repository (or a repo mirrored/imported
  into Azure Repos, or a service connection to GitHub).
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed
  (optional, for provisioning from the command line).

---

## 3. Provision the Static Web App

You can create the SWA resource from the Azure Portal or the CLI. When using an
Azure DevOps pipeline for deployment, create the resource with **no** GitHub
integration — you will deploy using a deployment token instead.

### Option A — Azure Portal

1. In the portal, create a new **Static Web App**.
2. Choose a resource group, name, and region.
3. Select the **Free** or **Standard** plan.
4. For **Deployment details**, choose **Other** (this creates the resource
   without wiring up a GitHub Action; you'll deploy from ADO).
5. Create the resource.
6. After creation, open the resource → **Overview** → note the default URL
   (`https://<name>.azurestaticapps.net`).
7. Open **Manage deployment token** (under Overview or Settings) and copy the
   token — you'll store it in the ADO pipeline.

### Option B — Azure CLI

```bash
az group create \
  --name rg-ymca-smart \
  --location eastus2

az staticwebapp create \
  --name ymca-smart-app \
  --resource-group rg-ymca-smart \
  --location eastus2 \
  --sku Free

# Retrieve the deployment token for the ADO pipeline
az staticwebapp secrets list \
  --name ymca-smart-app \
  --resource-group rg-ymca-smart \
  --query "properties.apiKey" -o tsv
```

Copy the token value returned by the last command.

---

## 4. Configure the Azure DevOps pipeline

1. In Azure DevOps, go to **Pipelines → New pipeline** and point it at this
   repository. Select the existing [azure-pipelines.yml](azure-pipelines.yml).
2. Add the deployment token as a **secret** pipeline variable:
   - Edit the pipeline → **Variables** → **New variable**.
   - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Value: the token copied in step 3.
   - Check **Keep this value secret** → Save.
   - (Alternatively store it in a **Variable group** / Azure Key Vault and link
     the group in the pipeline.)
3. Save and run the pipeline. On pushes to `main` it will:
   - Run the Jest test suite (`npm ci` + `npm test`).
   - Deploy the static files to SWA (`skip_app_build: true`).

### Why `skip_app_build: true`?

There is nothing to compile or bundle — the browser loads the ES modules
directly. Skipping the build keeps deployment fast, avoids uploading
`node_modules`, and accurately reflects the app's architecture.

---

## 5. Static Web App runtime configuration

[staticwebapp.config.json](staticwebapp.config.json) reproduces the important
parts of the old nginx setup:

- **`mimeTypes`** — ensures `.js`/`.mjs` are served as `application/javascript`
  (required for ES modules) and `.json` (including
  [smart-app-manifest.json](smart-app-manifest.json)) as `application/json`.
- **`navigationFallback.exclude`** — prevents static assets under `/src/*` and
  top-level `*.js`/`*.json`/`*.css` files from being rewritten to `index.html`.
- **`globalHeaders`** — sets `X-Content-Type-Options: nosniff`.

### Note on `X-Frame-Options`

The old [nginx.conf](nginx.conf) sent `X-Frame-Options: SAMEORIGIN`. This is
intentionally **omitted** here: some EHRs launch SMART apps inside an iframe, and
`SAMEORIGIN` would block that. If your EHR integrations always launch in a new
tab/window and you want the extra hardening, add this to
[staticwebapp.config.json](staticwebapp.config.json):

```json
"globalHeaders": {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN"
}
```

For EHR-embedded (iframe) launches, prefer a scoped `Content-Security-Policy`
`frame-ancestors` directive listing the allowed EHR origins instead.

---

## 6. Post-deployment configuration (required)

### 6.1 Update the SMART app manifest

Edit [smart-app-manifest.json](smart-app-manifest.json) and replace the
`http://localhost:3000` placeholders with your SWA URL
(`https://<name>.azurestaticapps.net`, or your custom domain):

```json
{
  "client_uri": "https://<name>.azurestaticapps.net",
  "logo_uri": "https://<name>.azurestaticapps.net/logo.png",
  "tos_uri": "https://<name>.azurestaticapps.net/terms",
  "policy_uri": "https://<name>.azurestaticapps.net/privacy",
  "redirect_uris": [
    "https://<name>.azurestaticapps.net/index.html"
  ],
  "launch_uris": [
    "https://<name>.azurestaticapps.net/launch.html"
  ]
}
```

Commit and let the pipeline redeploy.

### 6.2 Configure the referral FHIR server

The referral and task features POST to the FHIR server defined by
`REFERRAL_FHIR_SERVER` in [src/config/appConfig.js](src/config/appConfig.js).
This was previously `http://localhost:8080/fhir`, which is **not reachable** from
a browser loading the app over HTTPS from Azure.

Update it to a directly reachable **HTTPS** HAPI FHIR endpoint:

```javascript
export const REFERRAL_FHIR_SERVER = 'https://your-hapi-fhir-host.example.com/fhir';
```

Requirements for this endpoint:

- **HTTPS** — an `http://` URL will be blocked as mixed content.
- **CORS** — it must allow browser requests from your SWA origin.

If you do not yet have a hosted HAPI server, the referral/task cards will show
errors, but the rest of the dashboard (patient, vitals, observations) will work.

### 6.3 Register launch/redirect URLs with the EHR

Update your registrations so the new HTTPS URLs are authorized:

- **SMART Health IT sandbox** (<https://launch.smarthealthit.org>): use
  `https://<name>.azurestaticapps.net/launch.html` as the Launch URL.
- **Epic** (App Orchard / vendor services): register the production redirect URI
  `.../index.html` and launch URI `.../launch.html`, and confirm the client ID
  entries in `client_ids` in [smart-app-manifest.json](smart-app-manifest.json).

---

## 7. Custom domain (optional)

1. In the SWA resource → **Custom domains**, add your domain and validate it via
   the provided DNS records.
2. Once active, update the manifest URLs (section 6.1) to the custom domain.
3. Re-register the launch/redirect URLs with the EHR (section 6.3).

---

## 8. Verify the deployment

After a successful pipeline run:

1. `https://<name>.azurestaticapps.net/` loads the dashboard.
2. `https://<name>.azurestaticapps.net/smart-app-manifest.json` returns
   `Content-Type: application/json`.
3. ES modules under `/src/` load without MIME-type errors (check the browser
   console / Network tab).
4. A SMART launch against `https://<name>.azurestaticapps.net/launch.html`
   completes the OAuth2 flow and displays patient data.

---

## 9. Local preview (optional)

To preview the SWA configuration locally before deploying, install the SWA CLI
and run it from the repo root:

```bash
npm install -g @azure/static-web-apps-cli
swa start .
```

This serves the app and applies [staticwebapp.config.json](staticwebapp.config.json),
approximating the Azure runtime behavior.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| ES modules fail with a MIME-type error | Confirm `.js`/`.mjs` mappings in [staticwebapp.config.json](staticwebapp.config.json). |
| Deep links / refresh return 404 | Check `navigationFallback` / `responseOverrides` in the config. |
| Referral submission fails | `REFERRAL_FHIR_SERVER` must be a reachable HTTPS endpoint with CORS enabled (section 6.2). |
| "Mixed content" blocked in console | The FHIR/backend URL is `http://`; it must be `https://`. |
| OAuth2 redirect mismatch | `redirect_uris`/`launch_uris` in the manifest must exactly match the registered EHR URLs. |
| Pipeline auth error to SWA | Verify the `AZURE_STATIC_WEB_APPS_API_TOKEN` secret variable is set correctly. |
