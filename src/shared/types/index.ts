// Shared TypeScript types for GA4 Monitor Application

// ============================================
// Authentication Types
// ============================================

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  tokens: OAuthTokens | null;
  userEmail: string | null;
}

// ============================================
// GA4 Types
// ============================================

export interface GA4Property {
  id: string; // property_id in database
  propertyId: string; // GA4 property ID (e.g., '123456789')
  displayName: string;
  accountName?: string;
  isFavorite?: boolean;
  websiteUrl?: string;
  cookieBannerDetected?: boolean;
  cookieBannerLastChecked?: Date;
  createdAt?: Date;
  lastAccessedByAccount?: string; // Email of account that last accessed this property
}

export interface GA4Event {
  eventName: string;
  eventCount: number;
  eventParameterCount?: number;
  lastEventDate?: string;
  lastEventTime?: string;
  isInactive?: boolean;
  trend?: 'up' | 'down' | 'stable';
}

export interface GA4EventReport {
  propertyId: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  totalEvents: number;
  events: GA4Event[];
  rowCount: number;
}

export interface EventDetailReport {
  propertyId: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  events: DetailedEvent[];
  totalEvents: number;
  propertyInfo?: GA4Property;
}

export interface DetailedEvent {
  eventName: string;
  eventCount: number;
  lastEventDate: string;
  lastEventDateTime: Date;
  lastEventDaysAgo: number;
  isInactive: boolean;
  trend: 'up' | 'down' | 'stable';
  percentChange: number;
  previousCount: number;
  parameters?: EventParameter[];
  status: 'active' | 'inactive' | 'warning';
}

export interface EventParameter {
  name: string;
  valueCount: number;
}

export interface GA4Metric {
  name: string;
  value: string;
}

export interface GA4Dimension {
  name: string;
  value: string;
}

// ============================================
// Test Types
// ============================================

export type TestInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export type TestStatus = 'success' | 'warning' | 'error';

export interface TestResult {
  id: number;
  propertyId: string;
  testType: TestInterval;
  startDate: Date;
  endDate: Date;
  comparisonStartDate: Date;
  comparisonEndDate: Date;
  totalEvents: number;
  comparisonTotalEvents: number;
  percentChange: number;
  anomalyCount: number;
  status: TestStatus;
  errorMessage?: string;
  createdAt: Date;
}

export interface EventDetail {
  id: number;
  testResultId: number;
  eventName: string;
  eventCount: number;
  comparisonCount: number;
  percentChange: number;
  isAnomaly: boolean;
  anomalyReason?: string;
  createdAt: Date;
}

export interface Anomaly {
  eventName: string;
  type: 'threshold' | 'statistical' | 'drift';
  severity: 'low' | 'medium' | 'high';
  reason: string;
  currentValue: number;
  previousValue: number;
  percentChange: number;
}

// ============================================
// Scheduler Types
// ============================================

export interface ScheduledTask {
  id: number;
  propertyId: string;
  taskType: string;
  intervalType: TestInterval;
  cronExpression: string;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  config?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleConfig {
  interval: TestInterval;
  time: string; // HH:mm format
  timezone?: string;
}

// ============================================
// Configuration Types
// ============================================

export interface AppConfig {
  testInterval: TestInterval;
  testTime: string;
  anomalyThreshold: number; // percentage
  enableNotifications: boolean;
  notificationSound: boolean;
  dataRetentionDays: number;
  defaultExportFormat: 'pdf' | 'excel';
  autoExport: boolean;
  selectedProperty: string | null;
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm
    end: string; // HH:mm
  };
}

export interface ConfigItem {
  key: string;
  value: string;
  description?: string;
  updatedAt: Date;
}

// ============================================
// Report Types
// ============================================

export type ReportFormat = 'pdf' | 'excel' | 'json';

export interface ReportConfig {
  format: ReportFormat;
  includeCharts: boolean;
  includeAnomalies: boolean;
  includeEventDetails: boolean;
  summaryOnly: boolean;
}

export interface ReportData {
  testResult: TestResult;
  eventDetails: EventDetail[];
  anomalies: Anomaly[];
  property: GA4Property;
  generatedAt: Date;
}

export interface ReportExport {
  filePath: string;
  format: ReportFormat;
  size: number;
  generatedAt: Date;
}

// ============================================
// API/IPC Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// Error Types
// ============================================

export interface AppError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export enum ErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  INVALID_PROPERTY = 'INVALID_PROPERTY',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SCHEDULER_ERROR = 'SCHEDULER_ERROR',
  REPORT_GENERATION_ERROR = 'REPORT_GENERATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================
// Utility Types
// ============================================

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

export type PeriodComparison = {
  current: DateRange;
  previous: DateRange;
};

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
