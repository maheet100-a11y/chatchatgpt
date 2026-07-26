# UPI QR Creator — Setup Guide

A ready-to-host single-file web application that turns a ChatGPT session into a UPI payment QR through the GPT UPI QR API (`https://duskyr.com/api/upi`). 

- **Single File**: Zero build step, zero dependencies, pure Vanilla HTML/JS/CSS.
- **Embedded QR Engine**: Built-in vector canvas QR generator (no external scripts or CDNs needed).
- **Idempotency Support**: Pass custom order references to prevent double charging on retries.
- **Auto Refund Safety**: Unsuccessful transactions or invalid sessions are automatically refunded.

---

## Quick Setup

### 1. Configure Your API Key (Optional Default)

Open [`index.html`](file:///d:/GPT%20INDIA/index.html) in any text editor. Near line 235 (top of the `<script>` section), you will find:

```javascript
var API_BASE = "https://duskyr.com/api/upi"; // API base URL
var DEFAULT_KEY = ""; // Paste your upi_live_ key here, OR leave blank
```

You have two choices:
* **Option A (Pre-filled for everyone)**: Paste your key between the quotes:
  ```javascript
  var DEFAULT_KEY = "upi_live_xxxxxxxx";
  ```
* **Option B (User prompt)**: Leave `DEFAULT_KEY = ""` blank. Users will type their key on the page, and it will be saved in their browser's `localStorage` automatically.

> **Get API Keys & Top Up Credits**: Obtain your key and manage balance inside the mini-app: **GPT UPI QR Creator → UPI QR API**.
> * Cost: **$0.10** per successful link.
> * Failed link creations are refunded automatically.

---

## 2. Deployment Instructions (Requires HTTPS)

> **Important**: Modern web browsers block cross-origin API calls (`fetch`) when opened directly from a local file path (`file://`). You **must host the file over HTTPS** for the API connection to work.

### Deployment Options:
1. **Netlify Drop (Fastest - 10 Seconds)**
   - Go to [app.netlify.com/drop](https://app.netlify.com/drop).
   - Drag and drop `index.html` (or the folder).
   - Get an instant live `https://...netlify.app` URL.

2. **Cloudflare Pages / Vercel**
   - Upload `upi-creator-client.html` via GitHub repo or drag-and-drop.

3. **Self-Hosted Web Server**
   - Host `upi-creator-client.html` on nginx, Apache, Caddy, or Node.js behind SSL/TLS (`https://`).

---

## 3. How to Use

1. Open your deployed HTTPS page.
2. Verify your API balance is displayed (e.g., `$1.00 · 10 links`).
3. Paste a **ChatGPT Session JSON** (obtained from `chatgpt.com/api/auth/session` while logged in) or a raw `accessToken`.
4. *(Optional)* Add a **Reference ID** (e.g., `order-1001`) to ensure idempotent retries without duplicate charges.
5. Click **Create UPI link · $0.10**.
6. A scannable QR Code + UPI payment link will be generated.
7. The payer scans the QR using any Indian UPI app (**Google Pay, PhonePe, Paytm**) and completes payment within 5 minutes.

---

## Important Notes & Security

> * **ChatGPT Plus Activation**: The payment activates ChatGPT Plus directly on the pasted account. It does **NOT** transfer funds to your personal bank VPA.
> * **Keep Your Key Private**: Your API key acts as a payment credential. If exposed, rotate it immediately in the mini-app. Balance and order history will automatically transfer to your new key.

---

## API Documentation

- **Base URL**: `https://duskyr.com/api/upi`
- **Interactive Docs**: [duskyr.com/api/upi/docs](https://duskyr.com/api/upi/docs)
