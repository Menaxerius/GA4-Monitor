# Complete Setup Guide - GA4 Monitor

This guide covers everything from installation to setting up your Google Cloud project.

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Installing the Application](#2-installing-the-application)
3. [Creating a Google Cloud Project](#3-creating-a-google-cloud-project)
4. [Enabling APIs](#4-enabling-apis)
5. [Configuring OAuth Consent](#5-configuring-oauth-consent)
6. [Creating OAuth Credentials](#6-creating-oauth-credentials)
7. [Configuring the Application](#7-configuring-the-application)
8. [Building and Running](#8-building-and-running)
9. [First Login](#9-first-login)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. System Requirements

### Required Software

| Software | Minimum Version | How to Check | Download Link |
|----------|----------------|--------------|---------------|
| Node.js | v18.0.0 | node --version | nodejs.org |
| npm | v9.0.0 | npm --version | Included with Node.js |
| Git | (optional) | git --version | git-scm.com |

### Operating System Support

- Windows 10/11
- macOS 10.15 (Catalina) or later
- Linux (Ubuntu 20.04+, Debian 11+, Fedora 35+)

### Hardware Requirements

- RAM: 4 GB minimum, 8 GB recommended
- Disk Space: 500 MB for application + 1 GB for node_modules
- Internet: Required for Google API access

---

## 2. Installing the Application

### Option A: Download from GitHub

1. Go to github.com/YOUR_USERNAME/ga4-monitor
2. Click the green "Code" button
3. Select "Download ZIP"
4. Extract to a folder (e.g., C:\GA4-Monitor)

### Option B: Clone with Git

```bash
git clone https://github.com/YOUR_USERNAME/ga4-monitor.git
cd ga4-monitor
```

### Install Dependencies

Open a terminal/command prompt in the application folder and run:

```bash
npm install
```

Expected output:
```
added 857 packages, and audited 858 packages in 45s
```

---

## 3. Creating a Google Cloud Project

### Step 3.1: Access Google Cloud Console

1. Go to console.cloud.google.com
2. Sign in with your Google account

### Step 3.2: Create a New Project

1. At the top, click the project selector dropdown
2. Click "NEW PROJECT"
3. Fill in the project details:
   - Project name: GA4 Monitor
   - Location: (No organization) or select your organization
4. Click "CREATE"

### Step 3.3: Select Your Project

1. Wait for the project to be created (~30 seconds)
2. Click the project selector dropdown
3. Select your new "GA4 Monitor" project

---

## 4. Enabling APIs

### Enable Google Analytics Data API

1. In the left sidebar, navigate to APIs & Services -> Library
2. In the search bar, type: Google Analytics Data API
3. Click on "Google Analytics Data API" from the results
4. Click the blue "ENABLE" button

Verification: You should see a green checkmark and "API enabled"

---

## 5. Configuring OAuth Consent

### Step 5.1: Create OAuth Consent Screen

1. In the left sidebar, go to APIs & Services -> OAuth consent screen
2. Under "User Type", select "External" (for public use)
3. Click "CREATE"

### Step 5.2: Fill in App Information

Complete the following fields:

- App name: GA4 Monitor Desktop
- User support email: Your email address
- Application home page: https://github.com/YOUR_USERNAME/ga4-monitor
- Developer contact: Your email address

4. Click "SAVE AND CONTINUE"

### Step 5.3: Scopes (Optional)

1. Click "SAVE AND CONTINUE" (no scopes needed to add manually)

### Step 5.4: Test Users

1. Under "Test users", click "+ ADD USERS"
2. Add your email address
3. Click "SAVE AND CONTINUE"

Note: You can add up to 100 test users. Your app will only be accessible to test users until it is verified by Google.

---

## 6. Creating OAuth Credentials

### Step 6.1: Create OAuth Client ID

1. In the left sidebar, go to APIs & Services -> Credentials
2. Click the blue "+ CREATE CREDENTIALS" button
3. Select "OAuth client ID"

### Step 6.2: Configure OAuth Client

1. Application type: Select "Desktop app"
2. Name: Enter GA4 Monitor Desktop
3. Click "CREATE"

### Step 6.3: Save Your Credentials

A dialog will appear with your credentials:

```
Client ID: 123456789-abcdefghijklmnop.apps.googleusercontent.com
Client Secret: GOCSPX-xxxxxxxxxxxxxxxxxxxx
```

IMPORTANT:
- Copy Client ID and save it securely
- Copy Client Secret and save it securely
- You cannot retrieve the Client Secret later!

---

## 7. Configuring the Application

### Step 7.1: Create Environment File

Copy the example environment file:

Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

Windows (Command Prompt):
```cmd
copy .env.example .env
```

Mac/Linux:
```bash
cp .env.example .env
```

### Step 7.2: Edit .env File

Open .env in any text editor (Notepad, VS Code, etc.):

```env
# Google OAuth Configuration
GOOGLE_OAUTH_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret-here
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback

# Application Configuration
DATABASE_PATH=./data/ga4-monitor.db
LOG_LEVEL=info
NODE_ENV=development
```

### Step 7.3: Replace with Your Credentials

Replace the placeholder values with your actual Client ID and Client Secret.

Example:
```env
GOOGLE_OAUTH_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
```

---

## 8. Building and Running

### Step 8.1: Build the Application

Run the build command:

```bash
npm run build
```

Expected output:
```
✓ 11824 modules transformed.
✓ built in 7.34s
```

### Step 8.2: Start the Application

```bash
npm run start
```

The GA4 Monitor window will open automatically.

---

## 9. First Login

### Step 9.1: Initial Authentication

1. On first launch, you'll see the login screen
2. Click "Login with Google"
3. A browser window will open

### Step 9.2: Grant Permissions

You'll see Google's permission screen:

```
GA4 Monitor Desktop is requesting permission to:
☑ View and manage your Google Analytics data
```

1. Click "Continue"
2. Select your Google account with GA4 access
3. Review and click "Allow"

### Step 9.3: Verify Success

The application will show:
- Your GA4 properties in the dropdown
- Dashboard with metrics

---

## 10. Troubleshooting

### Problem: "Cannot find module" Error

Solution:
```bash
npm install
```

---

### Problem: "Port 3000 is already in use"

Solution:
```bash
npx kill-port 3000
# or
npm run stop
```

---

### Problem: OAuth Error - "redirect_uri_mismatch"

Solution:
1. Go to Google Cloud Console
2. APIs & Services -> Credentials
3. Edit your OAuth 2.0 Client ID
4. Verify "Authorized redirect URIs" includes:
   ```
   http://localhost:3000/auth/callback
   ```

---

### Problem: "API hasn't been used in project"

Solution:
1. Go to APIs & Services -> Library
2. Search for "Google Analytics Data API"
3. Click "ENABLE"

---

### Problem: No GA4 properties appearing

Possible causes:
- Account only has Universal Analytics (GA3) properties
- Insufficient permissions
- Not added as a test user

Solution:
1. Verify you have GA4 properties at analytics.google.com
2. Ensure your email is added as a test user in OAuth consent screen
3. Try re-authenticating

---

## Quick Reference

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| GOOGLE_OAUTH_CLIENT_ID | Your OAuth Client ID | 123456...apps.googleusercontent.com |
| GOOGLE_OAUTH_CLIENT_SECRET | Your OAuth Client Secret | GOCSPX-xxxxx |
| GOOGLE_OAUTH_REDIRECT_URI | OAuth callback URL | http://localhost:3000/auth/callback |

### Common Commands

| Command | Description |
|---------|-------------|
| npm install | Install dependencies |
| npm run build | Build for production |
| npm run start | Start development server |
| npm run stop | Stop the application |

---

## Google Cloud Console Links

- Create Project: console.cloud.google.com/projectcreate
- API Library: console.cloud.google.com/apis/library
- OAuth Consent: console.cloud.google.com/apis/credentials/consent
- Credentials: console.cloud.google.com/apis/credentials

---

Version: 1.0.0
Last Updated: March 2026
