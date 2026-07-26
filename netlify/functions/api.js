// Netlify Serverless Function for GPT India UPI SaaS Platform
const https = require('https');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

// Persistent State Stores across lambda warm invocations
global.KEYS_STORE = global.KEYS_STORE || {
  "upi_live_demo1234567890abcdef12345678": { credits: 100, created_at: new Date().toISOString(), total_used: 0, plan_name: "Demo Plan" },
  "DEMO_KEY": { credits: 100, created_at: new Date().toISOString(), total_used: 0, plan_name: "Demo Plan" }
};

global.ORDERS_STORE = global.ORDERS_STORE || {};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Admin-Secret',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function extractBearerKey(event) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7).trim();
  return (event.headers['x-api-key'] || event.headers['X-API-Key'] || '').trim();
}

function makeHttpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', (e) => reject(e));
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

// -------------------------------------------------------------------
// DIRECT OPENAI EXTRACTION ENGINE
// -------------------------------------------------------------------
async function extractDirectPaymentUrl(sessionInput) {
  let token = sessionInput.trim();
  try {
    const parsed = JSON.parse(sessionInput);
    token = parsed.accessToken || parsed.accessTokenString || parsed.token || token;
  } catch (e) {}

  if (!token) return { ok: false, error: 'bad_session', message: 'Token string could not be extracted from session payload.' };

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Oai-Language': 'en-US'
  };

  const payloads = [
    { plan_id: "default" },
    { plan_id: "plus" },
    { intent: "upgrade" }
  ];

  const endpoints = [
    '/backend-api/payments/checkout',
    '/backend-api/subscriptions/checkout',
    '/backend-api/accounts/checkouts'
  ];

  let lastErrorMsg = 'Creation failed. Refresh your ChatGPT session at chatgpt.com/api/auth/session and try again.';

  for (const endpoint of endpoints) {
    for (const payload of payloads) {
      try {
        const res = await makeHttpRequest({
          hostname: 'chatgpt.com',
          path: endpoint,
          method: 'POST',
          headers
        }, payload);

        if (res.data && (res.data.url || res.data.checkout_url)) {
          return { ok: true, payment_url: res.data.url || res.data.checkout_url };
        }

        if (res.status === 401) {
          lastErrorMsg = 'ChatGPT session token has expired. Log in to chatgpt.com and copy a fresh session.';
        } else if (res.status === 403) {
          lastErrorMsg = 'OpenAI Cloudflare verification challenge detected. Please log out & log in to chatgpt.com to refresh your session cookies.';
        } else if (res.data && res.data.detail) {
          lastErrorMsg = typeof res.data.detail === 'string' ? res.data.detail : JSON.stringify(res.data.detail);
        }
      } catch (e) {
        lastErrorMsg = 'Network error connecting to ChatGPT checkout endpoint: ' + e.message;
      }
    }
  }

  return { ok: false, error: 'creation_failed', message: lastErrorMsg };
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, { ok: true });

  let path = event.path.replace(/\/\.netlify\/functions\/api\/?/, '').replace(/\/api\/?/, '').replace(/^upi\//, '');
  let body = {};
  if (event.body) { try { body = JSON.parse(event.body); } catch (e) {} }

  // 0. DOCUMENTATION REDIRECT
  if (path === 'docs' || path === 'docs/' || path === 'upi/docs') {
    return { statusCode: 302, headers: { 'Location': '/docs.html' }, body: '' };
  }

  // 1. GET /v1/balance
  if (path === 'v1/balance' || path === 'v1/balance/') {
    const key = extractBearerKey(event) || (body.key || '').trim();
    if (!key) return jsonResponse(401, { ok: false, error: 'unauthorized', message: 'API key missing. Provide Authorization Bearer header.' });

    const keyData = global.KEYS_STORE[key] || global.KEYS_STORE[key.toUpperCase()];
    if (!keyData) return jsonResponse(401, { ok: false, error: 'unauthorized', message: 'Key invalid or deactivated.' });

    return jsonResponse(200, {
      ok: true,
      credits_usd: parseFloat((keyData.credits * 0.10).toFixed(2)),
      price_per_creation: 0.10,
      creations_remaining: keyData.credits,
      creations_done: keyData.total_used || 0,
      min_topup_usd: 1.0,
      active: true
    });
  }

  // 2. POST /v1/create (or /create-qr)
  if (path === 'v1/create' || path === 'v1/create/' || path === 'create-qr' || path === 'create-qr/') {
    const key = extractBearerKey(event) || (body.key || '').trim();
    const sessionJson = (body.session_json || '').trim();
    const reference = (body.reference || '').trim();

    if (!key) return jsonResponse(401, { ok: false, error: 'unauthorized', message: 'API key missing. Provide Authorization Bearer header.' });

    if (!global.KEYS_STORE[key] && body.key_state) {
      try {
        const state = typeof body.key_state === 'string' ? JSON.parse(body.key_state) : body.key_state;
        if (state && typeof state.credits === 'number') global.KEYS_STORE[key] = state;
      } catch (e) {}
    }

    const keyData = global.KEYS_STORE[key] || global.KEYS_STORE[key.toUpperCase()];
    if (!keyData) return jsonResponse(401, { ok: false, error: 'unauthorized', message: 'Key invalid or deactivated.' });
    if (keyData.credits <= 0) return jsonResponse(402, { ok: false, error: 'insufficient_credits', message: 'Balance below $0.10. Top up your credit balance.' });
    if (!sessionJson) return jsonResponse(400, { ok: false, error: 'bad_session', message: 'Missing or malformed session_json.' });

    const orderCode = 'UPI-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    // Direct Extraction via OpenAI API
    const extractionResult = await extractDirectPaymentUrl(sessionJson);

    if (!extractionResult || !extractionResult.ok || !extractionResult.payment_url) {
      return jsonResponse(422, {
        ok: false,
        status: 'failed',
        error: extractionResult?.error || 'creation_failed',
        message: extractionResult?.message || 'Creation failed. Refresh the ChatGPT session and try again. You were not charged.',
        refunded: true,
        credits_remaining: keyData.credits
      });
    }

    // Deduct 1 credit ($0.10) on successful extraction
    keyData.credits -= 1;
    keyData.total_used = (keyData.total_used || 0) + 1;

    const orderData = {
      ok: true,
      status: 'completed',
      order_code: orderCode,
      reference: reference || null,
      payment_url: extractionResult.payment_url,
      price_usd: 0.10,
      credits_remaining: keyData.credits,
      created_at: new Date().toISOString()
    };

    global.ORDERS_STORE[orderData.order_code] = orderData;

    return jsonResponse(200, {
      ok: true,
      status: orderData.status,
      order_code: orderData.order_code,
      reference: orderData.reference,
      payment_url: orderData.payment_url,
      price_usd: 0.10,
      credits_remaining: keyData.credits,
      poll_after_sec: 15
    });
  }

  // 3. GET /v1/order/{order_code}
  if (path.startsWith('v1/order/') || path.startsWith('order/')) {
    const orderCode = path.replace(/^v1\/order\//, '').replace(/^order\//, '').trim();
    if (!orderCode) return jsonResponse(400, { ok: false, error: 'bad_request', message: 'Order code missing.' });

    if (global.ORDERS_STORE[orderCode]) {
      return jsonResponse(200, global.ORDERS_STORE[orderCode]);
    }

    return jsonResponse(404, { ok: false, error: 'not_found', message: 'Order code not found.' });
  }

  // 4. CUSTOMER: Verify Key
  if (path === 'verify-key' || path === 'verify-key/') {
    const customerKey = (body.key || extractBearerKey(event) || '').trim();
    if (!customerKey) return jsonResponse(400, { ok: false, message: 'Please enter your Customer API Key.' });

    if (!global.KEYS_STORE[customerKey] && body.key_state) {
      try {
        const state = typeof body.key_state === 'string' ? JSON.parse(body.key_state) : body.key_state;
        if (state && typeof state.credits === 'number') global.KEYS_STORE[customerKey] = state;
      } catch (e) {}
    }

    const keyData = global.KEYS_STORE[customerKey] || global.KEYS_STORE[customerKey.toUpperCase()];
    if (!keyData) return jsonResponse(404, { ok: false, message: 'Invalid Customer API Key.' });

    return jsonResponse(200, {
      ok: true,
      key: customerKey,
      credits: keyData.credits,
      total_used: keyData.total_used || 0,
      key_state: keyData
    });
  }

  // 5. ADMIN PANEL ENDPOINTS
  const clientAdminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret'] || body.admin_secret;

  if (path.startsWith('admin')) {
    if (clientAdminSecret !== ADMIN_SECRET) {
      return jsonResponse(401, { ok: false, message: 'Unauthorized: Invalid Admin Secret key.' });
    }

    if (path === 'admin/sync-keys' || path === 'admin/sync-keys/') {
      if (body.keys && typeof body.keys === 'object') Object.assign(global.KEYS_STORE, body.keys);
      return jsonResponse(200, { ok: true, keys: global.KEYS_STORE });
    }

    if (path === 'admin/list-keys' || path === 'admin/list-keys/') {
      if (body.keys && typeof body.keys === 'object') Object.assign(global.KEYS_STORE, body.keys);
      return jsonResponse(200, { ok: true, keys: global.KEYS_STORE, standalone_mode: true });
    }

    if (path === 'admin/generate-key' || path === 'admin/generate-key/') {
      const credits = parseInt(body.credits, 10) || 10;
      const planName = body.plan_name || `$${credits / 10} Plan (${credits} Creations)`;
      const randomHex = Array.from({length: 28}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const newKey = `upi_live_${randomHex}`;

      global.KEYS_STORE[newKey] = { credits, plan_name: planName, created_at: new Date().toISOString(), total_used: 0 };
      return jsonResponse(200, { ok: true, key: newKey, credits, plan_name: planName, key_state: global.KEYS_STORE[newKey], all_keys: global.KEYS_STORE });
    }

    if (path === 'admin/add-credits' || path === 'admin/add-credits/') {
      const targetKey = (body.key || '').trim();
      const addAmount = parseInt(body.credits, 10) || 10;
      if (!targetKey) return jsonResponse(400, { ok: false, message: 'Key required.' });

      if (!global.KEYS_STORE[targetKey]) global.KEYS_STORE[targetKey] = { credits: 0, created_at: new Date().toISOString(), total_used: 0 };
      global.KEYS_STORE[targetKey].credits += addAmount;
      return jsonResponse(200, { ok: true, key: targetKey, credits: global.KEYS_STORE[targetKey].credits, key_state: global.KEYS_STORE[targetKey], all_keys: global.KEYS_STORE });
    }

    if (path === 'admin/revoke-key' || path === 'admin/revoke-key/') {
      const targetKey = (body.key || '').trim();
      if (global.KEYS_STORE[targetKey]) delete global.KEYS_STORE[targetKey];
      return jsonResponse(200, { ok: true, message: `Key ${targetKey} revoked.`, all_keys: global.KEYS_STORE });
    }
  }

  return jsonResponse(404, { ok: false, error: 'not_found', message: 'API Endpoint not found.' });
};
