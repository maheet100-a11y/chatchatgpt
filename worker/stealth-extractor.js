/**
 * Standalone Stealth Automation Worker for ChatGPT UPI Extraction
 * Runs on a dedicated VPS server (Node.js) with real Chromium.
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

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
    // 1. Listen to network responses for Stripe UPI instructions URL
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('payments.stripe.com/upi/instructions') || url.includes('stripe.com/pay/')) {
        console.log('[Worker] Intercepted Live Stripe UPI URL:', url);
        extractedStripeUrl = url;
      }
    });

    // 2. Set ChatGPT Session Cookies / Auth Header
    await page.setExtraHTTPHeaders({
      'Authorization': `Bearer ${accessToken}`,
      'Accept-Language': 'en-US,en;q=0.9'
    });

    // 3. Navigate to ChatGPT
    console.log('[Worker] Navigating to chatgpt.com...');
    await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2', timeout: 45000 });

    // 4. Trigger Subscription Checkout Flow
    console.log('[Worker] Initiating Plus Upgrade Checkout...');
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

    // 5. Wait for Stripe Checkout Redirection
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

    // If redirected to Stripe checkout page, extract URL
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

module.exports = { extractUpiLinkFromSession };
