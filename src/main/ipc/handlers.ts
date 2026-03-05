import { ipcMain } from 'electron';
import logger from '../utils/logger';
import { IPC_CHANNELS } from '../../shared/constants';
import authService from '../services/auth.service';
import ga4Service from '../services/ga4.service';
import storageService from '../services/storage.service';
import schedulerService from '../services/scheduler.service';
import reportService from '../services/report.service';
import accountManagerService from '../services/account-manager.service';
import GAMonitorTask from '../tasks/ga-monitor-task';
import cookieBannerService from '../services/cookie-banner.service';

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  logger.info('Registering IPC handlers...');

  // ============================================
  // Authentication Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATE, async () => {
    try {
      // Check if we have multiple accounts
      const accounts = accountManagerService.getAllAccounts();
      const currentAccount = await accountManagerService.getCurrentAccount();

      return {
        success: true,
        data: {
          isAuthenticated: !!currentAccount,
          tokens: currentAccount?.tokens || null,
          userEmail: currentAccount?.userEmail || null,
          accounts: accounts,
          currentAccountEmail: accountManagerService.getCurrentAccountEmail(),
        },
      };
    } catch (error: any) {
      logger.error('Failed to get auth state:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
    try {
      const authUrl = await authService.login();
      return { success: true, data: { authUrl } };
    } catch (error: any) {
      logger.error('Login failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    try {
      await authService.logout();
      return { success: true };
    } catch (error: any) {
      logger.error('Logout failed:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Account Management Handlers (NEW!)
  // ============================================

  ipcMain.handle('accounts:list', async () => {
    try {
      const accounts = accountManagerService.getAllAccounts();
      return { success: true, data: accounts };
    } catch (error: any) {
      logger.error('Failed to list accounts:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounts:switch', async (_event, email: string) => {
    try {
      const success = accountManagerService.switchAccount(email);
      return { success };
    } catch (error: any) {
      logger.error('Failed to switch account:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('accounts:remove', async (_event, email: string) => {
    try {
      const success = accountManagerService.removeAccount(email);
      return { success };
    } catch (error: any) {
      logger.error('Failed to remove account:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Properties Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.PROPERTIES_LIST, async () => {
    try {
      // Check authentication first
      const currentAccount = await accountManagerService.getCurrentAccount();
      if (!currentAccount) {
        return {
          success: false,
          error: 'Not authenticated. Please login first.',
          requiresAuth: true
        };
      }

      // Fetch from GA4 API
      const properties = await ga4Service.listProperties();

      // Update local database
      for (const property of properties) {
        storageService.upsertProperty(property);
      }

      // Get all properties from database
      const allProperties = storageService.getProperties();

      return { success: true, data: allProperties };
    } catch (error: any) {
      logger.error('Failed to list properties:', error);

      // Check if it's an authentication error
      if (error.message && error.message.includes('not authenticated')) {
        return {
          success: false,
          error: 'Not authenticated. Please login first.',
          requiresAuth: true
        };
      }

      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROPERTIES_GET, async (_event, propertyId: string) => {
    try {
      const property = storageService.getProperty(propertyId);
      return { success: true, data: property };
    } catch (error: any) {
      logger.error('Failed to get property:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROPERTIES_SET_FAVORITE, async (_event, propertyId: string, isFavorite: boolean) => {
    try {
      storageService.setPropertyFavorite(propertyId, isFavorite);
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set property favorite:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROPERTIES_UPDATE_WEBSITE_URL, async (_event, propertyId: string, websiteUrl: string) => {
    try {
      storageService.updatePropertyWebsiteUrl(propertyId, websiteUrl);
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to update property website URL:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROPERTIES_CHECK_COOKIE_BANNER, async (_event, propertyId: string, websiteUrl: string) => {
    try {
      logger.info(`Checking cookie banner for property ${propertyId} at ${websiteUrl}`);
      const result = await cookieBannerService.checkCookieBanner(websiteUrl);

      // Update property with cookie banner status
      storageService.updatePropertyCookieBanner(propertyId, result.hasCookieBanner);

      return { success: true, data: result };
    } catch (error: any) {
      logger.error('Failed to check cookie banner:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Tests Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.TESTS_RUN, async (_event, config: { propertyId: string; interval: string; customDate?: Date }) => {
    try {
      const monitorTask = new GAMonitorTask();
      const result = await monitorTask.execute(config as any);
      return { success: true, data: result };
    } catch (error: any) {
      logger.error('Failed to run test:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TESTS_GET_RESULTS, async (_event, propertyId: string, limit?: number, offset?: number) => {
    try {
      const results = storageService.getTestResults(propertyId, limit, offset);
      return { success: true, data: results };
    } catch (error: any) {
      logger.error('Failed to get test results:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TESTS_GET_RESULT, async (_event, resultId: number) => {
    try {
      const result = storageService.getTestResult(resultId);
      return { success: true, data: result };
    } catch (error: any) {
      logger.error('Failed to get test result:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TESTS_GET_HISTORY, async (_event, limit?: number, propertyId?: string) => {
    try {
      const results = storageService.getRecentTestResults(limit, propertyId);
      return { success: true, data: results };
    } catch (error: any) {
      logger.error('Failed to get test history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TESTS_GET_EVENT_DETAILS, async (_event, testResultId: number) => {
    try {
      logger.info(`Fetching event details for test result ${testResultId}`);
      const eventDetails = storageService.getEventDetailsForTest(testResultId);
      logger.info(`Found ${eventDetails.length} event details for test result ${testResultId}`);
      return { success: true, data: eventDetails };
    } catch (error: any) {
      logger.error('Failed to get event details for test:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:get-detailed', async (_event, propertyId: string, startDate: string, endDate: string, previousStartDate: string, previousEndDate: string) => {
    try {
      const report = await ga4Service.getDetailedEventReport(
        propertyId,
        new Date(startDate),
        new Date(endDate),
        new Date(previousStartDate),
        new Date(previousEndDate)
      );
      return { success: true, data: report };
    } catch (error: any) {
      logger.error('Failed to get detailed events:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('events:get-conversion-events', async (_event, propertyId: string) => {
    try {
      logger.info(`Fetching conversion events for property ${propertyId}`);
      const conversionEvents = await ga4Service.getConversionEvents(propertyId);
      logger.info(`Successfully fetched ${conversionEvents.length} conversion events`);
      return { success: true, data: conversionEvents };
    } catch (error: any) {
      logger.error('Failed to get conversion events:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Scheduler Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_LIST, async () => {
    try {
      const tasks = schedulerService.getAllTasks();
      return { success: true, data: tasks };
    } catch (error: any) {
      logger.error('Failed to list scheduled tasks:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_CREATE, async (_event, config: any) => {
    try {
      const task = await schedulerService.createScheduledTask(config);
      return { success: true, data: task };
    } catch (error: any) {
      logger.error('Failed to create scheduled task:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_UPDATE, async (_event, taskId: number, updates: any) => {
    try {
      const task = await schedulerService.updateScheduledTask(taskId, updates);
      return { success: true, data: task };
    } catch (error: any) {
      logger.error('Failed to update scheduled task:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_DELETE, async (_event, taskId: number) => {
    try {
      await schedulerService.deleteScheduledTask(taskId);
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete scheduled task:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_TOGGLE, async (_event, taskId: number) => {
    try {
      const task = await schedulerService.toggleTask(taskId);
      return { success: true, data: task };
    } catch (error: any) {
      logger.error('Failed to toggle scheduled task:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Reports Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.REPORTS_GENERATE, async (_event, testResultId: number) => {
    try {
      const reportData = await reportService.generateReportData(testResultId);
      return { success: true, data: reportData };
    } catch (error: any) {
      logger.error('Failed to generate report:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_EXPORT, async (_event, testResultId: number, format: 'pdf' | 'excel' | 'json') => {
    try {
      const reportData = await reportService.generateReportData(testResultId);

      let filePath: string;
      switch (format) {
        case 'pdf':
          filePath = await reportService.exportToPDF(reportData);
          break;
        case 'excel':
          filePath = await reportService.exportToExcel(reportData);
          break;
        case 'json':
          filePath = await reportService.exportToJSON(reportData);
          break;
        default:
          throw new Error(`Invalid format: ${format}`);
      }

      return { success: true, data: { filePath, format } };
    } catch (error: any) {
      logger.error('Failed to export report:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Configuration Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    try {
      const config = storageService.getAppConfig();
      return { success: true, data: config };
    } catch (error: any) {
      logger.error('Failed to get config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, config: any) => {
    try {
      storageService.setAppConfig(config);
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to set config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_RESET, async () => {
    try {
      // Reset to defaults
      storageService.setAppConfig({
        testInterval: 'monthly',
        testTime: '09:00',
        anomalyThreshold: 20,
        enableNotifications: true,
        notificationSound: false,
        dataRetentionDays: 90,
        defaultExportFormat: 'pdf',
        autoExport: false,
        selectedProperty: null,
      });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to reset config:', error);
      return { success: false, error: error.message };
    }
  });

  logger.info('IPC handlers registered');
}
