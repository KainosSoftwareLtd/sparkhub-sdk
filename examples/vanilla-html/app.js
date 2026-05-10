// Demo wiring for the SparkHub partner-app SDK (vanilla browser, no bundler).
//
// Adjust CONFIG to point at YOUR registered partner app, then serve the
// SDK package root statically and visit the page in a browser.
//
// IMPORTANT — serve from the SDK package root, NOT this folder, so the
// relative import below resolves to /dist/index.js at the served origin:
//
//   cd packages/sparkhub-sdk        # NOT cd .../vanilla-html
//   npm run build                   # produces ./dist/index.js
//   npx serve . -p 3001
//
// Then open http://localhost:3001/examples/vanilla-html/ in the browser.
//
// Why: ES module imports resolve relative to the importing file's URL.
// `../../dist/index.js` from `/examples/vanilla-html/app.js` resolves to
// `/dist/index.js` — which only exists if the served root is the SDK
// package root. Serving from `vanilla-html/` directly produces a 404.

import { createSparkhubClient } from '../../dist/index.js';

const CONFIG = {
  // From your platform admin's partner-app registration:
  clientId: 'papp_n6wJaU6rQVj6bDmsQTvgCaGzhIaePNgS59RNpeEhEqk',
  scopes: ['partner-app:read'],
  // Where SparkHub redirects after consent. With `allowLocalhostInDev=true`
  // on the registry entry, http://localhost:* is accepted (NOT subdomained
  // variants like beatles.localhost — those don't match the registry's
  // localhost regex).
  //
  // IMPORTANT: open this demo at http://localhost:3001/examples/vanilla-html/
  // so window.location.origin === 'http://localhost:3001'. Opening at
  // beatles.localhost:3001 produces a redirect_uri the partner-app rejects.
  redirectUri: window.location.origin + window.location.pathname,
  sparkhubBase: 'http://beatles.localhost:3000',
  // Org context. Required for localhost-style redirects (no org subdomain
  // in the URI to extract from). Production deployments at
  // {org}.{ns}.sparkhub.run can omit this — server reads org from the URI.
  org: 'beatles',
};

// Fail loudly if the demo wasn't configured yet — otherwise the OAuth
// redirect looks like it works, then 400s at consent time with an
// unhelpful "client not found" error.
if (CONFIG.clientId === 'papp_REPLACE_WITH_YOUR_CLIENT_ID') {
  const banner = document.getElementById('status');
  banner.className = 'status error';
  banner.textContent =
    'Demo not configured — edit app.js and replace the clientId placeholder ' +
    'with your real papp_... value from /security-admin/partner-apps. ' +
    'Also point sparkhubBase at your local dev server if testing locally.';
  document.getElementById('actions').style.display = 'none';
  throw new Error('partner-app demo: clientId not configured');
}

const client = createSparkhubClient(CONFIG);

const statusEl = document.getElementById('status');
const meEl = document.getElementById('me-output');
const sessionEl = document.getElementById('session-output');
const actionsEl = document.getElementById('actions');

function setStatus(text, kind = 'info') {
  statusEl.className = `status ${kind}`;
  statusEl.textContent = text;
}

function renderSession() {
  // Read directly from sessionStorage for display purposes (mirror SDK's key)
  const raw = sessionStorage.getItem('sparkhub_partner_app_session');
  sessionEl.textContent = raw
    ? JSON.stringify(JSON.parse(raw), null, 2)
    : '(empty)';
}

async function loadMe() {
  if (!client.isAuthenticated()) {
    meEl.textContent = '(not authenticated)';
    return;
  }
  try {
    const me = await client.me();
    meEl.textContent = JSON.stringify(me, null, 2);
    setStatus(`Authenticated as user ${me.userId} in org ${me.organizationCode}`, 'ok');
  } catch (err) {
    meEl.textContent = `Error: ${err.message}`;
    setStatus(`Failed to load /me: ${err.message}`, 'error');
  }
}

async function init() {
  // If we just landed back from /oauth/authorize, finish the flow:
  const params = new URLSearchParams(window.location.search);
  if (params.has('code') || params.has('error')) {
    try {
      await client.handleCallback();
      setStatus('Sign-in complete.', 'ok');
    } catch (err) {
      setStatus(`Sign-in failed: ${err.message}`, 'error');
    }
  }

  actionsEl.style.display = 'block';
  renderSession();
  await loadMe();
}

document.getElementById('login').addEventListener('click', async () => {
  setStatus('Redirecting to SparkHub for sign-in...', 'info');
  await client.authorize();
});

document.getElementById('logout').addEventListener('click', async () => {
  await client.logout();
  setStatus('Signed out.', 'info');
  renderSession();
  meEl.textContent = '(not authenticated)';
});

document.getElementById('refresh-me').addEventListener('click', async () => {
  setStatus('Re-fetching /me...', 'info');
  await loadMe();
  renderSession();
});

init();
