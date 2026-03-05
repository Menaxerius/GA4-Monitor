import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../utils/logger';
import authService from './auth.service';
import type { AuthState } from '../../shared/types';

interface AccountInfo {
  email: string;
  clientId: string;
  tokens: any;
  createdAt: string;
  lastUsed: string;
}

export class AccountManagerService {
  private accounts: Map<string, AccountInfo> = new Map();
  private currentAccount: string | null = null;
  private accountsFile: string;

  constructor() {
    this.accountsFile = path.join('./data', 'accounts.json');
    this.loadAccounts();
    // Update placeholder emails after a delay (to allow token refresh)
    setTimeout(() => {
      this.updatePlaceholderEmails();
    }, 5000); // 5 seconds delay
  }

  /**
   * Get current account state
   */
  public async getCurrentAccount(): Promise<AuthState | null> {
    if (!this.currentAccount) {
      return null;
    }

    const account = this.accounts.get(this.currentAccount);
    if (!account) {
      return null;
    }

    return {
      isAuthenticated: true,
      tokens: account.tokens,
      userEmail: account.email,
    };
  }

  /**
   * Get all stored accounts
   */
  public getAllAccounts(): AccountInfo[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Add a new account after successful login
   */
  public addAccount(email: string, tokens: any): void {
    const account: AccountInfo = {
      email,
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      tokens,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };

    this.accounts.set(email, account);
    this.currentAccount = email;
    this.saveAccounts();

    logger.info(`Account added: ${email}`);
  }

  /**
   * Switch to a different account
   */
  public switchAccount(email: string): boolean {
    if (!this.accounts.has(email)) {
      logger.warn(`Account not found: ${email}`);
      return false;
    }

    this.currentAccount = email;
    const account = this.accounts.get(email)!;
    account.lastUsed = new Date().toISOString();
    this.saveAccounts();

    logger.info(`Switched to account: ${email}`);
    return true;
  }

  /**
   * Remove an account
   */
  public removeAccount(email: string): boolean {
    if (!this.accounts.has(email)) {
      return false;
    }

    this.accounts.delete(email);

    // If we removed the current account, switch to another
    if (this.currentAccount === email) {
      const remaining = Array.from(this.accounts.keys());
      this.currentAccount = remaining.length > 0 ? remaining[0] : null;
    }

    this.saveAccounts();
    logger.info(`Account removed: ${email}`);
    return true;
  }

  /**
   * Get account by email
   */
  public getAccount(email: string): AccountInfo | undefined {
    return this.accounts.get(email);
  }

  /**
   * Load accounts from file
   */
  private loadAccounts(): void {
    try {
      if (!fs.existsSync(this.accountsFile)) {
        logger.info('No accounts file found, starting fresh');
        return;
      }

      const data = fs.readFileSync(this.accountsFile, 'utf-8');
      const accountsData = JSON.parse(data);

      for (const [email, account] of Object.entries(accountsData)) {
        this.accounts.set(email, account as AccountInfo);
      }

      // Set current account to most recently used
      const sorted = Array.from(this.accounts.values())
        .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());

      if (sorted.length > 0) {
        this.currentAccount = sorted[0].email;
      }

      logger.info(`Loaded ${this.accounts.size} accounts`);
    } catch (error) {
      logger.error('Failed to load accounts:', error);
    }
  }

  /**
   * Save accounts to file
   */
  private saveAccounts(): void {
    try {
      const data: Record<string, AccountInfo> = {};
      for (const [email, account] of this.accounts.entries()) {
        data[email] = account;
      }

      fs.writeFileSync(
        this.accountsFile,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error('Failed to save accounts:', error);
    }
  }

  /**
   * Get account count
   */
  public getAccountCount(): number {
    return this.accounts.size;
  }

  /**
   * Check if account exists
   */
  public hasAccount(email: string): boolean {
    return this.accounts.has(email);
  }

  /**
   * Get current account email
   */
  public getCurrentAccountEmail(): string | null {
    return this.currentAccount;
  }

  /**
   * Update account tokens
   */
  public updateAccountTokens(email: string, tokens: any): void {
    const account = this.accounts.get(email);
    if (account) {
      account.tokens = tokens;
      account.lastUsed = new Date().toISOString();
      this.saveAccounts();
    }
  }

  /**
   * Update placeholder emails with real emails from Google
   */
  private async updatePlaceholderEmails(): Promise<void> {
    try {
      const authService = (await import('./auth.service')).default;

      for (const [placeholderEmail, account] of this.accounts.entries()) {
        // Check if this is a placeholder email
        if (placeholderEmail.startsWith('user_') && placeholderEmail.endsWith('@google')) {
          logger.info(`Updating placeholder email: ${placeholderEmail}`);

          try {
            // ALWAYS force refresh token for placeholder emails (expiry date might be wrong)
            const refreshedTokens = await authService.refreshAccessTokenIfExpired(account.tokens, true);

            // Get user email using authService's getUserEmail method with refreshed tokens
            const userEmail = await authService.getUserEmail(refreshedTokens, null);

            if (userEmail && userEmail !== placeholderEmail) {
              // Update the account with the real email and refreshed tokens
              account.tokens = refreshedTokens;
              this.accounts.set(userEmail, account);
              this.accounts.delete(placeholderEmail);

              if (this.currentAccount === placeholderEmail) {
                this.currentAccount = userEmail;
              }

              logger.info(`Updated placeholder email: ${placeholderEmail} -> ${userEmail}`);
            } else {
              logger.warn(`Could not get real email for ${placeholderEmail}`);
            }
          } catch (error: any) {
            logger.warn(`Failed to update email for ${placeholderEmail}:`, error.message);
          }
        }
      }

      // Save accounts if any were updated
      this.saveAccounts();
    } catch (error) {
      logger.error('Failed to update placeholder emails:', error);
    }
  }
}

// Export singleton instance
export default new AccountManagerService();
