// Application Constants

export const APP_NAME = 'GA4 Monitor';
export const APP_VERSION = '1.0.0';

// Google API Scopes
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.manage.users.readonly',
  'https://www.googleapis.com/auth/analytics',
  'https://www.googleapis.com/auth/userinfo.email', // Required to fetch user email
];

// OAuth Configuration
export const OAUTH_CONFIG = {
  // These should be loaded from environment variables
  getClientId: () => process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  getClientSecret: () => process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  getRedirectUri: () => process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/auth/callback',
};

// Default Configuration
export const DEFAULT_CONFIG = {
  testInterval: 'monthly' as const,
  testTime: '09:00',
  anomalyThreshold: 20, // 20%
  enableNotifications: true,
  notificationSound: false,
  dataRetentionDays: 90,
  defaultExportFormat: 'pdf' as const,
  autoExport: false,
  selectedProperty: null as string | null,
};

// Cron Patterns for different intervals
export const CRON_PATTERNS = {
  daily: '0 9 * * *', // 9 AM every day
  weekly: '0 9 * * 1', // 9 AM every Monday
  monthly: '0 9 1 * *', // 9 AM on 1st of month
  quarterly: '0 9 1 1,4,7,10 *', // 9 AM on 1st of Jan, Apr, Jul, Oct
};

// Date Formats
export const DATE_FORMATS = {
  DISPLAY: 'dd.MM.yyyy HH:mm',
  DATE_ONLY: 'dd.MM.yyyy',
  TIME_ONLY: 'HH:mm',
  ISO: "yyyy-MM-dd'T'HH:mm:ss",
  GA4: 'yyyy-MM-dd',
};

// Anomaly Thresholds
export const ANOMALY_THRESHOLDS = {
  LOW: 10, // 10% change
  MEDIUM: 20, // 20% change
  HIGH: 50, // 50% change
};

// API Limits
export const API_LIMITS = {
  MAX_ROWS_PER_REQUEST: 100000,
  MAX_PROPERTIES_PER_REQUEST: 100,
  RATE_LIMIT_RETRY_DELAY: 1000, // ms
  MAX_RETRIES: 3,
};

// Database Configuration
export const DB_CONFIG = {
  PATH: process.env.DATABASE_PATH || './data/ga4-monitor.db',
  MAX_CONNECTIONS: 1, // SQLite is single-threaded
};

// Logging Configuration
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// IPC Channels
export const IPC_CHANNELS = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_STATE: 'auth:get-state',
  AUTH_CALLBACK: 'auth:callback',

  // Properties
  PROPERTIES_LIST: 'properties:list',
  PROPERTIES_GET: 'properties:get',
  PROPERTIES_SET_FAVORITE: 'properties:set-favorite',
  PROPERTIES_UPDATE_WEBSITE_URL: 'properties:update-website-url',
  PROPERTIES_CHECK_COOKIE_BANNER: 'properties:check-cookie-banner',

  // Tests
  TESTS_RUN: 'tests:run',
  TESTS_GET_RESULTS: 'tests:get-results',
  TESTS_GET_RESULT: 'tests:get-result',
  TESTS_GET_HISTORY: 'tests:get-history',
  TESTS_GET_EVENT_DETAILS: 'tests:get-event-details',

  // Scheduler
  SCHEDULER_LIST: 'scheduler:list',
  SCHEDULER_CREATE: 'scheduler:create',
  SCHEDULER_UPDATE: 'scheduler:update',
  SCHEDULER_DELETE: 'scheduler:delete',
  SCHEDULER_TOGGLE: 'scheduler:toggle',

  // Reports
  REPORTS_GENERATE: 'reports:generate',
  REPORTS_EXPORT: 'reports:export',

  // Configuration
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_RESET: 'config:reset',
} as const;

// File Paths
export const PATHS = {
  DATA: './data',
  REPORTS: './data/reports',
  LOGS: './data/logs',
  CACHE: './data/cache',
};

// Report Templates
export const REPORT_TEMPLATES = {
  SUMMARY: 'summary',
  DETAILED: 'detailed',
  ANOMALIES_ONLY: 'anomalies-only',
};

// Notification Types
export const NOTIFICATION_TYPES = {
  TEST_COMPLETE: 'test-complete',
  ANOMALY_DETECTED: 'anomaly-detected',
  TEST_FAILED: 'test-failed',
  SCHEDULER_UPDATE: 'scheduler-update',
} as const;
