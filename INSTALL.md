# Installation Guide - GA4 Monitor

This guide will walk you through setting up the GA4 Monitor Desktop Application.

## Prerequisites

Before you begin, ensure you have:

- [ ] Node.js v18+ installed ([Download](https://nodejs.org/))
- [ ] npm v9+ installed (comes with Node.js)
- [ ] A Google Cloud Project
- [ ] Access to at least one GA4 property

---

## Step 1: Download & Extract

1. Download the latest release from GitHub
2. Extract the ZIP file to a location of your choice
3. Open a terminal/command prompt in that folder

---

## Step 2: Install Dependencies

Run the following command:

```bash
npm install
```

This may take a few minutes. You should see output similar to:
```
added 857 packages, and audited 858 packages in 45s
```

---

## Step 3: Setup Google OAuth Credentials

### 3.1 Create/Select a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"NEW PROJECT"** or select an existing project

### 3.2 Enable Google Analytics Data API

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for **"Google Analytics Data API"**
3. Click on it and press **"ENABLE"**

### 3.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **"External"** and click **Create**
3. Fill in:
   - App name: `GA4 Monitor`
   - User support email: your email
   - Developer contact: your email
4. Click **SAVE AND CONTINUE** (skip the optional sections)
5. Add your email as a **Test user** and click **SAVE AND CONTINUE**

### 3.4 Create OAuth Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `GA4 Monitor Desktop`
5. Click **Create**
6. **Copy the Client ID** and **Client Secret**

---

## Step 4: Configure Environment Variables

1. Copy the example environment file:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Windows (CMD):**
```cmd
copy .env.example .env
```

**Mac/Linux:**
```bash
cp .env.example .env
```

2. Open `.env` in a text editor

3. Replace the placeholder values with your credentials:

```env
GOOGLE_OAUTH_CLIENT_ID=123456789-abcde.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
```

4. Save and close the file

---

## Step 5: Build the Application

```bash
npm run build
```

You should see:
```
✓ built in X seconds
```

---

## Step 6: Start the Application

```bash
npm run start
```

The application window will open automatically.

---

## Step 7: First Login

1. Click **"Login with Google"**
2. Select your Google account
3. Grant permissions to access Google Analytics
4. You'll be redirected back to the application

---

## Step 8: Run Your First Test

1. Select a GA4 property from the dropdown
2. Choose an interval (e.g., "Monthly")
3. Click **"Start Test"**
4. Wait for the test to complete
5. View results in the "Test Results" section

---

## Troubleshooting

### "Cannot find module" error

```bash
npm install
```

### "Port 3000 is already in use"

```bash
# Kill the process on port 3000
npx kill-port 3000

# Or restart the application
npm run stop
npm run start
```

### OAuth Error: "redirect_uri_mismatch"

- Ensure `GOOGLE_OAUTH_REDIRECT_URI` in `.env` matches exactly what's in Google Cloud Console
- It should be: `http://localhost:3000/auth/callback`

### "No GA4 properties found"

- Ensure you have access to GA4 properties (not Universal Analytics)
- Check your account permissions in Google Analytics
- Try re-authenticating

### Build fails with TypeScript errors

```bash
npm install --save-dev typescript @types/node
npm run build
```

---

## Quick Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Build the application |
| `npm run start` | Start in development mode |
| `npm run start:prod` | Start in production mode |
| `npm run stop` | Stop the application |
| `npm run restart` | Restart the application |

---

## Next Steps

- Configure scheduled tests (Settings → Schedule)
- Check cookie banner compliance
- Set up email notifications (optional)

---

## Support

If you encounter issues not covered here:

1. Check the main [README.md](README.md)
2. Open an issue on GitHub
3. Check existing GitHub issues for solutions
