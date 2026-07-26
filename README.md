# GPT India UPI QR SaaS Platform — Setup Guide

A ready-to-host web application that turns a ChatGPT session into a UPI payment QR through your own self-hosted Reseller API (`/api/upi`). 

- **Single-File Client**: Pure Vanilla HTML/JS/CSS with embedded vector QR generator.
- **Self-Hosted API Backend**: Netlify Serverless Function (`netlify/functions/api.js`) for key verification & QR creation.
- **Admin Dashboard**: Generate reseller API keys (`upi_live_...`), top up credits, & manage customers.
- **Idempotency & Auto-Refund**: Unsuccessful transactions or invalid sessions are automatically refunded.

---

## Quick Setup

### 1. Configure Your Server Base URL

Open [`upi-creator-client.html`](file:///d:/gpt/upi-creator-client.html). Near line 712, the configuration is automatically set to your self-hosted backend:

```javascript
var API_BASE = window.location.origin + "/api/upi"; // Self-hosted API base URL
var DEFAULT_KEY = "upi_live_demo1234567890abcdef12345678"; // Preloaded demo key
```

---

## 2. Deployment Instructions (Netlify)

1. Upload/Push code to GitHub repository `maheet100-a11y/chatchatgpt`.
2. Connect to [Netlify.com](https://www.netlify.com).
3. Netlify automatically detects `netlify.toml` and deploys your static pages + serverless API functions.

---

## 3. Web Pages Included

| Page | URL | Description |
|---|---|---|
| 🌐 **Landing Page** | `index.html` | Customer portal for key activation & plan purchase |
| 👑 **Admin Portal** | `admin.html` | Key generator for `upi_live_...` reseller keys |
| 🛠️ **Client Tool** | `upi-creator-client.html` | Standalone UPI QR generator web app |
| 📚 **API Docs** | `docs.html` | Interactive API Documentation & Live Tester |

---

## 4. API Endpoints

- **Base URL**: `/api/upi`
- **Create Order**: `POST /api/upi/v1/create`
- **Poll Order**: `GET /api/upi/v1/order/{order_code}`
- **Check Balance**: `GET /api/upi/v1/balance`
