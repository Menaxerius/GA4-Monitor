// Polyfill File for undici
if (!global.File) {
  // @ts-ignore
  global.File = class File {
    name: string;
    constructor(parts: any[], filename: string, options?: any) {
      this.name = filename;
    }
  };
}

// Stub axios to avoid undici issues in Electron
const axiosStub = {
  get: async () => ({ data: {}, status: 200 }),
  post: async () => ({ data: {}, status: 200 }),
};

// @ts-ignore - Monkey patch axios before importing googleapis
global.axios = axiosStub;
global.axiosDefault = axiosStub;

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { net } from 'electron';
import logger from '../utils/logger';
import { OAUTH_CONFIG, GOOGLE_SCOPES } from '../../shared/constants';
import type { OAuthTokens, AuthState } from '../../shared/types';

const TOKENS_FILE = path.join('./data', 'tokens.json');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.scryptSync('ga4-monitor', 'salt', 32) as Buffer;
const ALGORITHM = 'aes-256-cbc';

export class AuthService {
  private oauth2Client: OAuth2Client | null = null;
  private state: string | null = null;
  private authCallbackServer: any = null; // Stores dynamic OAuth2Client for callback
  private callbackServerInstance: any = null; // Stores the HTTP server instance
  private serverTimeout: any = null; // Stores the timeout for auto-closing the server

  constructor() {
    this.initializeOAuthClient();
  }

  /**
   * Initialize OAuth2 client
   */
  private initializeOAuthClient(): void {
    try {
      // Load environment variables from multiple possible locations
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
      }

      const clientId = OAUTH_CONFIG.getClientId();

      if (!clientId) {
        logger.warn('Google OAuth Client ID not configured');
        return;
      }

      this.oauth2Client = new OAuth2Client(
        clientId,
        OAUTH_CONFIG.getClientSecret(), // Use client secret from env
        OAUTH_CONFIG.getRedirectUri()
      );

      // Set custom request function to avoid axios/undici issues in Electron
      (this.oauth2Client as any).request = async (opts: any) => {
        const url = opts.url || opts.uri;
        const method = opts.method || 'GET';

        return new Promise((resolve, reject) => {
          // For POST requests, use options object
          const requestOptions: any = {
            method: method,
            url: url
          };

          const request = net.request(requestOptions);

          // Set headers if provided
          if (opts.headers) {
            for (const [key, value] of Object.entries(opts.headers)) {
              request.setHeader(key, value as string);
            }
          }

          let responseBody = '';

          request.on('response', (response) => {
            response.on('data', (chunk) => {
              responseBody += chunk.toString();
            });

            response.on('end', () => {
              resolve({
                data: JSON.parse(responseBody),
                status: response.statusCode,
                statusText: response.statusMessage,
                headers: response.headers,
              });
            });
          });

          request.on('error', reject);

          if (opts.body) {
            request.write(opts.body);
          }

          request.end();
        });
      };

      logger.info('OAuth2 client initialized');
    } catch (error) {
      logger.error('Failed to initialize OAuth2 client:', error);
    }
  }

  /**
   * Check if user is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    try {
      const accountManagerService = (await import('./account-manager.service')).default;
      const currentAccount = await accountManagerService.getCurrentAccount();
      return currentAccount !== null;
    } catch (error) {
      logger.error('Failed to check authentication status:', error);
      return false;
    }
  }

  /**
   * Get current authentication state
   */
  public async getAuthState(): Promise<AuthState> {
    try {
      const accountManagerService = (await import('./account-manager.service')).default;
      const currentAccount = await accountManagerService.getCurrentAccount();

      if (currentAccount && currentAccount.tokens) {
        return {
          isAuthenticated: true,
          tokens: currentAccount.tokens,
          userEmail: currentAccount.userEmail,
        };
      }

      return {
        isAuthenticated: false,
        tokens: null,
        userEmail: null,
      };
    } catch (error) {
      logger.error('Failed to get auth state:', error);
      return {
        isAuthenticated: false,
        tokens: null,
        userEmail: null,
      };
    }
  }

  /**
   * Get user email from access token (public method for account manager)
   */
  public async getUserEmail(tokens: OAuthTokens, oauthClient?: any): Promise<string | null> {
    try {
      // Try direct HTTP request first (more reliable than googleapis library)
      try {
        const https = require('https');

        return new Promise((resolve, reject) => {
          const options = {
            hostname: 'www.googleapis.com',
            path: '/oauth2/v2/userinfo',
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
            },
          };

          const req = https.request(options, (res: any) => {
            const chunks: Buffer[] = [];

            res.on('data', (chunk: any) => {
              // Collect chunks as Buffer objects
              if (Buffer.isBuffer(chunk)) {
                chunks.push(chunk);
              } else if (typeof chunk === 'string') {
                chunks.push(Buffer.from(chunk, 'utf8'));
              } else {
                chunks.push(Buffer.from(String(chunk), 'utf8'));
              }
            });

            res.on('end', () => {
              try {
                // Concatenate all buffers and convert to string
                const data = Buffer.concat(chunks).toString('utf8');
                const userInfo = JSON.parse(data);
                const email = userInfo.email || null;
                logger.info(`Got user email via direct request: ${email}`);
                if (!email) {
                  logger.warn('No email in response, status:', res.statusCode);
                  logger.warn('Response data:', data);
                }
                resolve(email);
              } catch (parseError) {
                logger.error('Failed to parse user info response:', parseError);
                const data = Buffer.concat(chunks).toString('utf8');
                logger.error('Response data:', data);
                resolve(null);
              }
            });
          });

          req.on('error', (error: any) => {
            logger.error('HTTP request for user info failed:', error);
            resolve(null);
          });

          req.end();
        });
      } catch (httpError) {
        logger.warn('Direct HTTP request failed, trying googleapis library:', httpError);

        // Fallback to googleapis library
        const client = oauthClient || this.oauth2Client;

        if (!client) {
          logger.warn('No OAuth client available for getting user email');
          return null;
        }

        // Set credentials directly on the client
        client.credentials = {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          token_type: tokens.token_type,
          scope: tokens.scope,
        };

        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const userinfo = await oauth2.userinfo.get();

        const email = userinfo.data.email || null;
        logger.info(`Got user email via googleapis: ${email}`);
        return email;
      }
    } catch (error) {
      logger.error('Failed to get user email:', error);
      return null;
    }
  }

  /**
   * Initiate login flow
   * Opens browser for user to authorize
   */
  public async login(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.oauth2Client) {
          reject(new Error('OAuth2 client not initialized'));
          return;
        }

        logger.info('Initiating login flow');

        // Get redirect URI from environment
        const redirectUri = OAUTH_CONFIG.getRedirectUri();
        
        // Extract port from redirect URI
        let port = 3000;
        try {
          const url = new URL(redirectUri);
          port = parseInt(url.port);
        } catch (e) {
          logger.warn(`Failed to parse redirect URI "${redirectUri}", using default port 3000`);
        }

        logger.info(`Using redirect URI: ${redirectUri}, port: ${port}`);

        // Generate state for CSRF protection
        this.state = crypto.randomBytes(16).toString('hex');

        // Create new OAuth2 client with correct redirect URI
        const { OAuth2Client } = require('google-auth-library');
        const dynamicOAuthClient = new OAuth2Client(
          OAUTH_CONFIG.getClientId(),
          OAUTH_CONFIG.getClientSecret(), // Use client secret from env
          redirectUri
        );

        // Start callback server on port from redirect URI
        this.startCallbackServer(port, dynamicOAuthClient)
          .then(() => {
            // Store the dynamic client for later use in callback
            this.authCallbackServer = dynamicOAuthClient;

            // Generate authorization URL with correct redirect URI
            const authUrl = dynamicOAuthClient.generateAuthUrl({
              access_type: 'offline',
              scope: GOOGLE_SCOPES,
              state: this.state,
              prompt: 'consent', // Force consent to get refresh token
            });

            logger.info(`Generated auth URL with redirect URI: ${redirectUri}`);

            // Open browser using platform-specific command
            this.openBrowser(authUrl)
              .then(() => {
                logger.info('Opened browser for authorization');
                resolve(authUrl);
              })
              .catch((err) => {
                logger.warn('Failed to open browser:', err);
                // Even if browser fails to open, return the URL
                resolve(authUrl);
              });
          })
          .catch((err) => {
            logger.error('Failed to start callback server:', err);
            reject(err);
          });
      } catch (error) {
        logger.error('Login failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Open browser with URL (platform-specific)
   */
  private openBrowser(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let command: string;

      switch (process.platform) {
        case 'darwin':
          command = `open "${url}"`;
          break;
        case 'win32':
          command = `start "" "${url}"`;
          break;
        default:
          command = `xdg-open "${url}"`;
          break;
      }

      exec(command, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Start HTTP server to handle OAuth callback
   */
  private startCallbackServer(port: number, oauthClient: any): Promise<void> {
    const http = require('http');

    return new Promise((resolve, reject) => {
      try {
        const server = http.createServer(async (req: any, res: any) => {
          try {
            // Clear the timeout when we receive a callback
            if (this.serverTimeout) {
              clearTimeout(this.serverTimeout);
              this.serverTimeout = null;
            }

            // Handle favicon.ico request
            if (req.url === '/favicon.ico') {
              res.writeHead(204);
              res.end();
              return;
            }

            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');

            // Handle OAuth error response
            if (error) {
              logger.error('OAuth error:', error);
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Authentication Failed</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      height: 100vh;
                      margin: 0;
                      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                      text-align: center;
                      background: white;
                      padding: 40px;
                      border-radius: 10px;
                      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                      max-width: 500px;
                    }
                    h1 { color: #e74c3c; margin-bottom: 10px; }
                    p { color: #666; line-height: 1.6; }
                    .icon { font-size: 64px; margin-bottom: 20px; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="icon">✗</div>
                    <h1>Authentication Failed</h1>
                    <p><strong>Error:</strong> ${error}</p>
                    <p>Please close this window and try logging in again from the application.</p>
                  </div>
                </body>
                </html>
              `);
              setTimeout(() => {
                try { server.close(); } catch(e) {}
              }, 3000);
              return;
            }

            if (code && state) {
              logger.info('Received OAuth callback');

              try {
                // Handle callback
                await this.handleCallback(code, state);

                // Send success response
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Authentication Successful</title>
                    <style>
                      body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      }
                      .container {
                        text-align: center;
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                      }
                      h1 { color: #333; margin-bottom: 10px; }
                      p { color: #666; }
                      .icon { font-size: 64px; margin-bottom: 20px; }
                      .spinner {
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #667eea;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 20px auto;
                      }
                      @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="icon">✓</div>
                      <h1>Authentication Successful!</h1>
                      <div class="spinner"></div>
                      <p>You can close this window and return to the application.</p>
                    </div>
                  </body>
                  </html>
                `);

                // Close server after delay
                setTimeout(() => {
                  try {
                    server.close();
                    logger.info('Callback server closed');
                  } catch (e) {
                    // Server already closed
                  }
                }, 2000);
              } catch (callbackError: any) {
                logger.error('Error in OAuth callback handling:', callbackError);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Authentication Error</title>
                    <style>
                      body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      }
                      .container {
                        text-align: center;
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        max-width: 500px;
                      }
                      h1 { color: #e74c3c; margin-bottom: 10px; }
                      p { color: #666; line-height: 1.6; }
                      .icon { font-size: 64px; margin-bottom: 20px; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="icon">✗</div>
                      <h1>Authentication Error</h1>
                      <p><strong>Error:</strong> ${callbackError.message || 'Unknown error'}</p>
                      <p>Please close this window and try logging in again.</p>
                    </div>
                  </body>
                  </html>
                `);
                setTimeout(() => {
                  try { server.close(); } catch(e) {}
                }, 3000);
              }
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>Bad Request</title></head>
                <body>
                  <h1>Bad Request</h1>
                  <p>Invalid OAuth callback parameters.</p>
                </body>
                </html>
              `);
            }
          } catch (error) {
            logger.error('Error handling request:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        });

        server.listen(port, '127.0.0.1', () => {
          logger.info(`Callback server listening on port ${port}`);

          // Store server instance
          this.callbackServerInstance = server;

          // Set timeout to automatically close server after 2 minutes if no callback
          this.serverTimeout = setTimeout(() => {
            logger.info(`Server timeout reached, closing callback server on port ${port}`);
            try {
              server.close();
              this.callbackServerInstance = null;
              this.serverTimeout = null;
            } catch (e) {
              // Server already closed
            }
          }, 120000); // 2 minutes

          resolve();
        });

        server.on('error', (error: any) => {
          logger.error('Callback server error:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start callback server:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle OAuth callback
   */
  private async handleCallback(code: string, state: string): Promise<void> {
    try {
      // Verify state to prevent CSRF
      if (state !== this.state) {
        throw new Error('Invalid state parameter');
      }

      // Use the dynamic OAuth client if available, otherwise use the default one
      const oauthClient = (this.authCallbackServer as any) || this.oauth2Client;

      if (!oauthClient) {
        throw new Error('OAuth2 client not initialized');
      }

      logger.info('Received OAuth callback');

      // Exchange code for tokens
      const { tokens } = await oauthClient.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Invalid tokens received');
      }

      // Store tokens
      const tokensData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date || Date.now() + 3600000, // Default 1 hour
        token_type: tokens.token_type || 'Bearer',
        scope: tokens.scope || '',
      };

      await this.storeTokens(tokensData);

      // Get user email and add to account manager
      try {
        const userEmail = await this.getUserEmail(tokensData, oauthClient);
        if (userEmail) {
          // Dynamically import account manager to avoid circular dependency
          const accountManager = (await import('./account-manager.service')).default;
          accountManager.addAccount(userEmail, tokensData);
          logger.info(`Account added to manager: ${userEmail}`);
        } else {
          // If we can't get the email, still add account with a placeholder
          // The email will be fetched later when needed
          const accountManager = (await import('./account-manager.service')).default;
          const placeholderEmail = `user_${Date.now()}@google`;
          accountManager.addAccount(placeholderEmail, tokensData);
          logger.info(`Account added to manager with placeholder email: ${placeholderEmail}`);
        }
      } catch (error) {
        logger.warn('Could not add account to manager:', error);
        // Even if account manager fails, try to add with placeholder
        try {
          const accountManager = (await import('./account-manager.service')).default;
          const placeholderEmail = `user_${Date.now()}@google`;
          accountManager.addAccount(placeholderEmail, tokensData);
          logger.info(`Account added to manager with placeholder email (fallback): ${placeholderEmail}`);
        } catch (fallbackError) {
          logger.error('Failed to add account even with placeholder:', fallbackError);
        }
      }

      logger.info('Authentication successful');

      // Reset state and clear dynamic client
      this.state = null;
      this.authCallbackServer = null;
    } catch (error) {
      logger.error('Failed to handle callback:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  public async logout(): Promise<void> {
    try {
      // Import accountManagerService dynamically to avoid circular dependency
      const accountManagerService = (await import('./account-manager.service')).default;

      // Get current account email before clearing
      const currentAccount = await accountManagerService.getCurrentAccount();
      const emailToRemove = currentAccount?.userEmail;

      // Clear current account from account manager
      if (emailToRemove) {
        accountManagerService.removeAccount(emailToRemove);
        logger.info(`Account removed: ${emailToRemove}`);
      }

      // Also clear old tokens.json file if it exists
      if (fs.existsSync(TOKENS_FILE)) {
        fs.unlinkSync(TOKENS_FILE);
        logger.info('Old tokens.json file removed');
      }

      logger.info('User logged out successfully');
    } catch (error) {
      logger.error('Failed to logout:', error);
      throw error;
    }
  }

  /**
   * Get access token (auto-refresh if needed)
   */
  public async getAccessToken(): Promise<string> {
    try {
      // Import accountManagerService dynamically to avoid circular dependency
      const accountManagerService = (await import('./account-manager.service')).default;
      const currentAccount = await accountManagerService.getCurrentAccount();

      if (!currentAccount || !currentAccount.tokens) {
        throw new Error('Not authenticated');
      }

      const tokens = currentAccount.tokens;

      // Check if token needs refresh (subtract 5 minutes for buffer)
      const expiryTime = tokens.expiry_date || 0;
      const now = Date.now();
      const refreshBuffer = 5 * 60 * 1000; // 5 minutes

      // Debug logging
      logger.info('Checking token expiry:', {
        expiryTime,
        expiryDate: new Date(expiryTime).toISOString(),
        now,
        nowDate: new Date(now).toISOString(),
        refreshBuffer,
        expiryTimePlusBuffer: expiryTime + refreshBuffer,
        shouldRefresh: expiryTime < (now + refreshBuffer),
        timeUntilExpiry: expiryTime - now,
      });

      if (expiryTime < (now + refreshBuffer)) {
        logger.info('Access token expired or expiring soon, refreshing...');
        await this.refreshAccessToken(currentAccount.userEmail!, tokens);

        // Get updated tokens after refresh
        const updatedAccount = await accountManagerService.getCurrentAccount();
        if (!updatedAccount || !updatedAccount.tokens) {
          throw new Error('Failed to get refreshed tokens');
        }
        return updatedAccount.tokens.access_token;
      }

      return tokens.access_token;
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      logger.error('Failed to get access token:', errorMessage);
      throw error;
    }
  }

  /**
   * Refresh access token - completely bypasses google-auth-library's fetch
   * Uses direct HTTP request with Electron's net module
   */
  private async refreshAccessToken(userEmail: string, tokens: any): Promise<void> {
    try {
      if (!tokens.refresh_token) {
        throw new Error('No refresh token available');
      }

      const clientId = OAUTH_CONFIG.getClientId();
      const clientSecret = OAUTH_CONFIG.getClientSecret();

      if (!clientId) {
        throw new Error('Client ID not configured');
      }

      // Build form data for token refresh
      const formData = new URLSearchParams({
        refresh_token: tokens.refresh_token,
        client_id: clientId,
        client_secret: clientSecret || '',
        grant_type: 'refresh_token'
      });

      logger.info('Requesting token refresh from Google OAuth...');

      // Use our custom HTTPS request method
      const responseData = await this.makeHttpsRequest(
        'https://oauth2.googleapis.com/token',
        formData.toString()
      );

      if (!responseData.access_token) {
        logger.error('Invalid refresh response:', responseData);
        throw new Error('No access token in refresh response');
      }

      // Calculate new expiry time
      const expiresIn = responseData.expires_in || 3600; // Default 1 hour
      const newExpiryDate = Date.now() + (expiresIn * 1000);

      // Update tokens in account manager
      const updatedTokens = {
        ...tokens,
        access_token: responseData.access_token,
        expiry_date: newExpiryDate,
        // Google may issue a new refresh token
        refresh_token: responseData.refresh_token || tokens.refresh_token,
      };

      // Import and update account manager
      const accountManagerService = (await import('./account-manager.service')).default;
      accountManagerService.updateAccountTokens(userEmail, updatedTokens);

      logger.info('Access token refreshed successfully');
    } catch (error: any) {
      logger.error('Failed to refresh access token:', error.message || String(error));

      // If refresh fails, clear the account to force re-login
      const accountManagerService = (await import('./account-manager.service')).default;
      accountManagerService.removeAccount(userEmail);
      logger.info('Cleared account due to failed refresh - user needs to login again');

      throw new Error('Token refresh failed - please login again');
    }
  }

  /**
   * Refresh access token (public method for account manager)
   * Returns refreshed tokens without updating storage
   */
  public async refreshAccessTokenIfExpired(tokens: OAuthTokens, forceRefresh: boolean = false): Promise<OAuthTokens> {
    try {
      // Check if token needs refresh
      const now = Date.now();
      const refreshBuffer = 300000; // 5 minutes
      const needsRefresh = forceRefresh || !tokens.expiry_date || tokens.expiry_date - now < refreshBuffer;

      if (!needsRefresh) {
        logger.info('Token is still valid, skipping refresh');
        return tokens; // Token is still valid
      }

      logger.info(forceRefresh ? 'Forcing token refresh for placeholder email...' : 'Token expired or expiring soon, refreshing access token...');

      if (!tokens.refresh_token) {
        throw new Error('No refresh token available');
      }

      const clientId = OAUTH_CONFIG.getClientId();
      const clientSecret = OAUTH_CONFIG.getClientSecret();

      if (!clientId) {
        throw new Error('Client ID not configured');
      }

      // Build form data for token refresh
      const formData = new URLSearchParams({
        refresh_token: tokens.refresh_token,
        client_id: clientId,
        client_secret: clientSecret || '',
        grant_type: 'refresh_token'
      });

      // Use native Node.js https module instead of Electron's net module
      const https = require('https');
      const url = require('url');

      const responseData = await new Promise<any>((resolve, reject) => {
        const urlParsed = url.parse('https://oauth2.googleapis.com/token');

        const options = {
          hostname: urlParsed.hostname,
          path: urlParsed.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(formData.toString()).toString(),
          },
        };

        const req = https.request(options, (res: any) => {
          const chunks: Buffer[] = [];

          res.on('data', (chunk: any) => {
            if (Buffer.isBuffer(chunk)) {
              chunks.push(chunk);
            } else {
              chunks.push(Buffer.from(String(chunk), 'utf8'));
            }
          });

          res.on('end', () => {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (res.statusCode !== 200) {
              const error: any = new Error(`HTTP ${res.statusCode}: ${JSON.stringify(data)}`);
              error.response = { data, status: res.statusCode };
              reject(error);
            } else {
              resolve(data);
            }
          });
        });

        req.on('error', (error: any) => {
          logger.error('HTTPS request failed:', error);
          reject(error);
        });

        req.write(formData.toString());
        req.end();
      });

      if (!responseData.access_token) {
        logger.error('Invalid refresh response:', responseData);
        throw new Error('No access token in refresh response');
      }

      // Calculate new expiry time
      const expiresIn = responseData.expires_in || 3600; // Default 1 hour
      const newTokens: OAuthTokens = {
        access_token: responseData.access_token,
        refresh_token: responseData.refresh_token || tokens.refresh_token,
        expiry_date: now + (expiresIn * 1000),
        token_type: responseData.token_type || 'Bearer',
        scope: responseData.scope || tokens.scope,
      };

      logger.info('Access token refreshed successfully (account manager)');
      return newTokens;
    } catch (error: any) {
      logger.error('Failed to refresh access token:', error.message || String(error));
      throw error;
    }
  }

  /**
   * Make HTTPS request using Electron's net module (for OAuth token refresh)
   */
  private makeHttpsRequest(url: string, postData: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Create request with options
      const request = net.request({
        method: 'POST',
        url: url
      });

      // Set headers
      request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
      request.setHeader('Content-Length', Buffer.byteLength(postData).toString());

      let responseBody = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseBody += chunk.toString();
        });

        response.on('end', () => {
          try {
            const data = JSON.parse(responseBody);
            if (response.statusCode !== 200) {
              const error: any = new Error(`HTTP ${response.statusCode}: ${JSON.stringify(data)}`);
              error.response = { data, status: response.statusCode };
              reject(error);
            } else {
              resolve(data);
            }
          } catch (e) {
            const error: any = new Error(`Failed to parse response: ${responseBody}`);
            error.response = { data: responseBody, status: response.statusCode };
            reject(error);
          }
        });
      });

      request.on('error', (error) => {
        logger.error('HTTPS request failed:', error.message || String(error));
        reject(error);
      });

      // Write POST data
      request.write(postData);
      request.end();
    });
  }

  /**
   * Store tokens encrypted in file
   */
  private async storeTokens(tokens: OAuthTokens): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(TOKENS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Encrypt tokens
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

      let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Store with IV
      const data = {
        iv: iv.toString('hex'),
        encrypted,
      };

      fs.writeFileSync(TOKENS_FILE, JSON.stringify(data), 'utf-8');
      logger.info('Tokens stored encrypted');
    } catch (error) {
      logger.error('Failed to store tokens:', error);
      throw error;
    }
  }

  /**
   * Get and decrypt stored tokens
   */
  private async getStoredTokens(): Promise<OAuthTokens | null> {
    try {
      if (!fs.existsSync(TOKENS_FILE)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));

      // Decrypt tokens
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        ENCRYPTION_KEY,
        Buffer.from(data.iv, 'hex')
      );

      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as OAuthTokens;
    } catch (error) {
      logger.error('Failed to get stored tokens:', error);
      return null;
    }
  }

  /**
   * Get authenticated OAuth2 client
   */
  public async getAuthenticatedClient(): Promise<OAuth2Client> {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not initialized');
    }

    // IMPORTANT: Call getAccessToken() FIRST to trigger auto-refresh if needed!
    // This ensures we get a fresh token if the current one is expired
    const accessToken = await this.getAccessToken();

    // Get full tokens from account manager (after potential refresh)
    const accountManagerService = (await import('./account-manager.service')).default;
    const currentAccount = await accountManagerService.getCurrentAccount();

    if (!currentAccount || !currentAccount.tokens) {
      throw new Error('Not authenticated');
    }

    // Debug: Log token status (not the actual tokens for security)
    logger.info('Setting OAuth2 credentials:', {
      hasAccessToken: !!currentAccount.tokens.access_token,
      hasRefreshToken: !!currentAccount.tokens.refresh_token,
      hasExpiryDate: !!currentAccount.tokens.expiry_date,
      tokenLength: currentAccount.tokens.access_token?.length,
      expiryDate: currentAccount.tokens.expiry_date ? new Date(currentAccount.tokens.expiry_date).toISOString() : 'none',
      isExpired: currentAccount.tokens.expiry_date ? currentAccount.tokens.expiry_date < Date.now() : 'unknown',
    });

    // Set all credentials including scopes!
    // googleapis needs scopes to know which APIs to access
    this.oauth2Client.setCredentials({
      access_token: currentAccount.tokens.access_token,
      refresh_token: currentAccount.tokens.refresh_token,
      expiry_date: currentAccount.tokens.expiry_date,
      scope: GOOGLE_SCOPES.join(' '), // Important: add scopes!
    });

    logger.info('OAuth2 credentials set successfully');
    return this.oauth2Client;
  }
}

// Export singleton instance
export default new AuthService();
