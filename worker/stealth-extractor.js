/**
 * Standalone Stealth Automation Worker Server for ChatGPT UPI Extraction
 * Listens on HTTP port 3000 (or PORT env var) to receive extraction requests.
 */
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

async function extractUpiLinkFromSession(accessToken) {
  console.log('[Worker] Launching Stealth Chromium instance...');

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800'
    ]
  });

  const page = await browser.newPage();
  let extractedStripeUrl = null;

  try {
    // 1. Intercept network response for Stripe UPI URL
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('payments.stripe.com/upi/instructions') || url.includes('stripe.com/pay/')) {
        console.log('[Worker] Intercepted Live Stripe UPI URL:', url);
        extractedStripeUrl = url;
      }
    });

    // 2. Set Headers & Auth Token
    await page.setExtraHTTPHeaders({
      'Authorization': `Bearer ${accessToken}`,
      'Accept-Language': 'en-US,en;q=0.9'
    });

    // 3. Navigate to chatgpt.com
    console.log('[Worker] Navigating to chatgpt.com...');
    await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2', timeout: 45000 });

    // 4. Trigger Upgrade Checkout
    console.log('[Worker] Triggering Plus Upgrade Checkout...');
    await page.evaluate(async (token) => {
      const res = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan_id: "default" })
      });
      const data = await res.json();
      if (data && data.url) {
        window.location.href = data.url;
      }
    }, accessToken);

    // 5. Wait for navigation / Stripe URL
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});

    const currentUrl = page.url();
    if (currentUrl.includes('stripe.com') || currentUrl.includes('checkout')) {
      extractedStripeUrl = extractedStripeUrl || currentUrl;
    }

  } catch (err) {
    console.error('[Worker] Extraction Error:', err.message);
  } finally {
    await browser.close();
  }

  return extractedStripeUrl;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ ok: true, status: 'Stealth Worker Running', port: PORT });
});

// Extraction HTTP endpoint
app.post('/extract', async (req, res) => {
  const { accessToken, session_json } = req.body;
  const token = accessToken || session_json;

  if (!token) {
    return res.status(400).json({ ok: false, error: 'bad_request', message: 'accessToken or session_json required' });
  }

  console.log('[HTTP Worker] Received extraction job...');
  const paymentUrl = await extractUpiLinkFromSession(token);

  if (paymentUrl) {
    return res.json({ ok: true, status: 'completed', payment_url: paymentUrl });
  } else {
    return res.status(422).json({ ok: false, status: 'failed', error: 'extraction_failed', message: 'Could not extract Stripe UPI URL from session.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Stealth Worker Server Running on http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});

module.exports = { extractUpiLinkFromSession };
