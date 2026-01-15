import { VITAL_TYPES_URL } from '../config/appConfig.js';

let _vitalTypes = null;
let _vitalTypesPromise = null;

/**
 * Load the vitalTypes map from JSON on first call or when forced
 * @param {boolean} [force=false]
 */
async function loadVitalTypes(force = false) {
  // if we haven’t ever loaded, or the caller wants to force reload…
  if (!_vitalTypes || force) {
    // if no fetch is in flight, or we force a new one, start it now
    if (! _vitalTypesPromise || force) {
      _vitalTypesPromise = (async () => {
        if (typeof window === 'undefined') {
          // Node.js path
          const { readFile } = await import('fs/promises');
          const { resolve } = await import('path');
          const relativeUrl = VITAL_TYPES_URL.replace(/^\/+/, '');
          const filePath = resolve(process.cwd(), relativeUrl);
          const text = await readFile(filePath, 'utf-8');
          return JSON.parse(text);
        } else {
          // browser path
          const resp = await fetch(
            VITAL_TYPES_URL,
            { cache: force ? 'no-cache' : 'default' }
          );
          return await resp.json();
        }
      })();
    }
    // wait for that one promise, assign to cache
    _vitalTypes = await _vitalTypesPromise;
  }
  return _vitalTypes;
}

/**
 * Lookup, auto-loading vitalTypes.json if needed.
 */
async function getVitalType(code, display, force = false) {
  if (!_vitalTypes || force) {
    await loadVitalTypes(force);
  }
  const vt = _vitalTypes || {};
  return vt[code] ||
         (display && display.toLowerCase().includes('vital')
           ? { key: code, label: display }
           : null);
}

function clearVitalTypesCache() {
  _vitalTypes = null;
  _vitalTypesPromise = null;
}

export {
  loadVitalTypes,
  getVitalType,
  clearVitalTypesCache
};