/**
 * SMART Token Debug Panel
 * Non-invasive - reads fhirclient session storage directly.
 * No existing app code is modified.
 * Enable:  set "debug": true  in smart-app-manifest.json
 * Disable: set "debug": false in smart-app-manifest.json (or remove the entry)
 * Remove:  delete the <script> tag in index.html to strip permanently
 */
(async function () {
    let debugEnabled = false;
    try {
        const resp = await fetch('/smart-app-manifest.json');
        if (resp.ok) {
            const manifest = await resp.json();
            debugEnabled = manifest.debug === true;
        }
    } catch (_) {}

    if (!debugEnabled) return;

    function readFhirClientState() {
        let best = null;
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            try {
                const val = JSON.parse(sessionStorage.getItem(key));
                // Must have a completed token exchange (access_token present)
                if (val && val.tokenResponse && val.tokenResponse.access_token) {
                    best = val;
                }
            } catch (_) {}
        }
        return best;
    }

    function renderPanel(state) {
        const token = state.tokenResponse ?? {};
        const scopeReturnedByServer = typeof token.scope === 'string' && token.scope.trim().length > 0;
        const grantedRaw = scopeReturnedByServer ? token.scope : null;
        const requestedRaw = state.scope ?? '(unknown)';
        const granted = grantedRaw ? new Set(grantedRaw.split(/\s+/).filter(Boolean)) : null;
        const requested = new Set(requestedRaw.split(/\s+/).filter(Boolean));
        // Only flag missing if server actually returned scope — otherwise we can't tell
        const missing = granted ? [...requested].filter(s => !granted.has(s)) : [];
        const extra = granted ? [...granted].filter(s => !requested.has(s)) : [];
        // Epic stores patient id in tokenResponse or state.clientId context — check multiple locations
        const patientId = token.patient ?? state.patient ?? state.tokenResponse?.patient ?? '—';

        const existing = document.getElementById('smart-debug-panel');
        if (existing) existing.remove();

        const panel = document.createElement('details');
        panel.id = 'smart-debug-panel';
        panel.style.cssText = [
            'position:fixed', 'bottom:0', 'left:0', 'right:0',
            'background:#0d0d1a', 'color:#e0e0e0', 'font-family:monospace',
            'font-size:12px', 'padding:6px 12px', 'z-index:99999',
            'border-top:2px solid #00aaff', 'max-height:50vh', 'overflow-y:auto'
        ].join(';');

        panel.innerHTML = `
            <summary style="cursor:pointer;color:#00aaff;font-weight:bold;user-select:none">
                🔍 SMART Debug &nbsp;
                <span style="color:${missing.length ? '#ff4444' : '#44ff88'}">
                    ${missing.length ? `⚠ ${missing.length} scope(s) not granted` : granted ? '✓ All scopes granted' : '✓ Scopes granted (not echoed by server — normal for some vendors)'}
                </span>
            </summary>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px;padding-bottom:8px">
                <div>
                    <div style="color:#888;margin-bottom:4px">Token Info</div>
                    <table style="border-collapse:collapse">
                        <tr><td style="color:#888;padding:1px 8px 1px 0">Server</td><td>${state.serverUrl ?? '—'}</td></tr>
                        <tr><td style="color:#888;padding:1px 8px 1px 0">Patient ID</td><td>${patientId}</td></tr>
                        <tr><td style="color:#888;padding:1px 8px 1px 0">fhirUser</td><td>${token.fhirUser ?? '—'}</td></tr>
                        <tr><td style="color:#888;padding:1px 8px 1px 0">Token type</td><td>${token.token_type ?? '—'}</td></tr>
                        <tr><td style="color:#888;padding:1px 8px 1px 0">Expires in</td><td>${token.expires_in ?? '—'}s</td></tr>
                    </table>
                </div>
                <div>
                    <div style="color:#888;margin-bottom:4px">Scopes Requested ${granted ? '(✓ granted / ✗ missing)' : '(server did not return granted scopes)'}</div>
                    <table style="border-collapse:collapse">
                        ${[...requested].map(s => {
                            const ok = !granted || granted.has(s);
                            return `<tr>
                                <td style="padding:1px 6px 1px 0;color:${ok ? '#44ff88' : '#ff4444'}">${ok ? '✓' : '✗'}</td>
                                <td style="color:${ok ? '#e0e0e0' : '#ff4444'}">${s}</td>
                            </tr>`;
                        }).join('')}
                    </table>
                </div>
                <div>
                    <div style="color:#888;margin-bottom:4px">Extra Scopes Granted</div>
                    <table style="border-collapse:collapse">
                        ${!granted
                            ? '<tr><td style="color:#555">(not returned by server)</td></tr>'
                            : extra.length
                                ? extra.map(s => `<tr><td style="color:#aaa;padding:1px 0">${s}</td></tr>`).join('')
                                : '<tr><td style="color:#555">(none)</td></tr>'}
                    </table>
                </div>
            </div>`;

        document.body.appendChild(panel);
        panel.open = missing.length > 0; // auto-expand if scopes are missing
    }

    // fhirclient writes session storage after FHIR.oauth2.ready() resolves — poll for it
    function waitForState(retries = 20, interval = 300) {
        return new Promise(resolve => {
            let attempts = 0;
            const check = () => {
                const state = readFhirClientState();
                if (state || ++attempts >= retries) resolve(state);
                else setTimeout(check, interval);
            };
            check();
        });
    }

    const state = await waitForState();
    if (state) renderPanel(state);
    else console.warn('[SMART Debug] Could not find fhirclient session state in sessionStorage.');
})();
