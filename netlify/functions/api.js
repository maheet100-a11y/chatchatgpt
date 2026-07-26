// Netlify Serverless Function for GPT India UPI SaaS Platform
const https = require('https');

// Master API Key for DuskYr UPI API
const MASTER_API_KEY = process.env.MASTER_API_KEY || 'upi_live_087a45b4c6aa8f4d7af201a0e6a53090';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
const UPSTREAM_API = 'duskyr.com';

// Persistent In-Memory / Netlify State for Customer Keys
// Key format: GPTIND_XXXXXXXX
global.KEYS_STORE = global.KEYS_STORE || {
  "DEMO_KEY": { credits: 5, created_at: new Date().toISOString(), total_used: 0 }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
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

exports.handler = async (event, context) => {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, { ok: true });
  }

  // Parse path & body
  const path = event.path.replace(/\/\.netlify\/functions\/api\/?/, '').replace(/\/api\/?/, '');
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) {}
  }

  // -------------------------------------------------------------------
  // 1. CUSTOMER: Verify Key
  // -------------------------------------------------------------------
  if (path === 'verify-key' || path === 'verify-key/') {
    const customerKey = (body.key || '').trim();
    if (!customerKey) {
      return jsonResponse(400, { ok: false, message: 'Please enter your Customer License Key.' });
    }

    const keyData = global.KEYS_STORE[customerKey];
    if (!keyData) {
      return jsonResponse(404, { ok: false, message: 'Invalid Customer Key. Purchase a key to continue.' });
    }

    return jsonResponse(200, {
      ok: true,
      key: customerKey,
      credits: keyData.credits,
      total_used: keyData.total_used || 0
    });
  }

  // -------------------------------------------------------------------
  // 2. CUSTOMER: Create UPI QR Link (Deducts 1 Credit on Success)
  // -------------------------------------------------------------------
  if (path === 'create-qr' || path === 'create-qr/') {
    const customerKey = (body.key || '').trim();
    const sessionJson = (body.session_json || '').trim();
    const reference = (body.reference || '').trim();

    if (!customerKey) {
      return jsonResponse(400, { ok: false, message: 'Customer Key is required.' });
    }

    const keyData = global.KEYS_STORE[customerKey];
    if (!keyData) {
      return jsonResponse(403, { ok: false, message: 'Invalid Customer Key. Please purchase a valid key.' });
    }

    if (keyData.credits <= 0) {
      return jsonResponse(402, { ok: false, message: 'Insufficient credits! You have 0 credits remaining. Please buy credits to continue.' });
    }

    if (!sessionJson) {
      return jsonResponse(400, { ok: false, message: 'ChatGPT session token/JSON is required.' });
    }

    // Call Upstream DuskYr API using secure MASTER_API_KEY
    try {
      const payload = { session_json: sessionJson };
      if (reference) payload.reference = reference;

      const upstreamRes = await makeHttpRequest({
        hostname: UPSTREAM_API,
        path: '/api/upi/v1/create',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MASTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }, payload);

      if (upstreamRes.status !== 200 || !upstreamRes.data || !upstreamRes.data.ok) {
        const err = upstreamRes.data ? (upstreamRes.data.message || upstreamRes.data.error) : 'Failed to create QR link with upstream provider.';
        return jsonResponse(upstreamRes.status || 500, { ok: false, message: err });
      }

      // Order created successfully; deduct 1 credit from customer key
      keyData.credits -= 1;
      keyData.total_used = (keyData.total_used || 0) + 1;

      return jsonResponse(200, {
        ok: true,
        order_code: upstreamRes.data.order_code,
        credits_remaining: keyData.credits,
        message: 'Order created successfully. 1 credit deducted.'
      });
    } catch (err) {
      return jsonResponse(500, { ok: false, message: 'Server error creating UPI link: ' + err.message });
    }
  }

  // -------------------------------------------------------------------
  // 3. CUSTOMER: Poll Order Status
  // -------------------------------------------------------------------
  if (path.startsWith('order/')) {
    const orderCode = path.replace('order/', '').trim();
    if (!orderCode) return jsonResponse(400, { ok: false, message: 'Order code missing.' });

    try {
      const upstreamRes = await makeHttpRequest({
        hostname: UPSTREAM_API,
        path: `/api/upi/v1/order/${encodeURIComponent(orderCode)}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${MASTER_API_KEY}`
        }
      });

      return jsonResponse(upstreamRes.status, upstreamRes.data || { ok: false });
    } catch (err) {
      return jsonResponse(500, { ok: false, message: 'Error fetching order status.' });
    }
  }

  // -------------------------------------------------------------------
  // 4. ADMIN PANEL ENDPOINTS (Protected by X-Admin-Secret header)
  // -------------------------------------------------------------------
  const clientAdminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret'] || body.admin_secret;

  if (path.startsWith('admin')) {
    if (clientAdminSecret !== ADMIN_SECRET) {
      return jsonResponse(401, { ok: false, message: 'Unauthorized: Invalid Admin Secret key.' });
    }

    // List all customer keys
    if (path === 'admin/list-keys' || path === 'admin/list-keys/') {
      return jsonResponse(200, {
        ok: true,
        keys: global.KEYS_STORE,
        master_key_set: !!MASTER_API_KEY
      });
    }

    // Generate new key
    if (path === 'admin/generate-key' || path === 'admin/generate-key/') {
      const credits = parseInt(body.credits, 10) || 1;
      const planName = body.plan_name || (credits === 1 ? '₹25 Plan (1 Credit)' : '₹250 Plan (15 Credits)');
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newKey = `GPTIND_${randomStr}`;

      global.KEYS_STORE[newKey] = {
        credits: credits,
        plan_name: planName,
        created_at: new Date().toISOString(),
        total_used: 0
      };

      return jsonResponse(200, {
        ok: true,
        key: newKey,
        credits: credits,
        plan_name: planName,
        message: `Key ${newKey} generated successfully with ${credits} credits!`
      });
    }

    // Add / topup credits to existing key
    if (path === 'admin/add-credits' || path === 'admin/add-credits/') {
      const targetKey = (body.key || '').trim();
      const addAmount = parseInt(body.credits, 10) || 1;

      if (!targetKey || !global.KEYS_STORE[targetKey]) {
        return jsonResponse(404, { ok: false, message: 'Target key not found.' });
      }

      global.KEYS_STORE[targetKey].credits += addAmount;
      return jsonResponse(200, {
        ok: true,
        key: targetKey,
        credits: global.KEYS_STORE[targetKey].credits,
        message: `Added ${addAmount} credits. New balance: ${global.KEYS_STORE[targetKey].credits}`
      });
    }

    // Delete / Revoke Key
    if (path === 'admin/revoke-key' || path === 'admin/revoke-key/') {
      const targetKey = (body.key || '').trim();
      if (global.KEYS_STORE[targetKey]) {
        delete global.KEYS_STORE[targetKey];
        return jsonResponse(200, { ok: true, message: `Key ${targetKey} has been revoked.` });
      }
      return jsonResponse(404, { ok: false, message: 'Key not found.' });
    }
  }

  return jsonResponse(404, { ok: false, message: 'API Endpoint not found.' });
};
