import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { APP_NAME, DB_CONFIG, PATHS } from '../../shared/constants';
import type {
  GA4Property,
  TestResult,
  EventDetail,
  ConfigItem,
  ScheduledTask,
  AppConfig,
} from '../../shared/types';

export class StorageService {
  private db: Database | null = null;
  private SQL: any = null;
  private dbPath: string;
  private idCounters: Record<string, number> = {}; // Track IDs per table

  constructor() {
    this.dbPath = path.resolve(DB_CONFIG.PATH);
    this.initializeDatabase();
  }

  /**
   * Initialize database connection and create tables
   */
  private async initializeDatabase(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = PATHS.DATA;
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Initialize SQL.js
      this.SQL = await initSqlJs();

      // Load or create database
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        logger.info(`Database loaded from: ${this.dbPath}`);
        // Run migrations for existing database
        this.runMigrations();
      } else {
        this.db = new this.SQL.Database();
        this.createSchema();
        this.saveDatabase();
        logger.info(`Database created at: ${this.dbPath}`);
      }

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Run database migrations to add new columns/tables
   */
  private runMigrations(): void {
    try {
      const columns = this.select('PRAGMA table_info(properties)');

      // Migration 1: Add website_url column to properties table
      const hasWebsiteUrl = columns.some((col: any) => col.name === 'website_url');

      if (!hasWebsiteUrl) {
        logger.info('Running migration: Adding website_url column to properties table');
        this.run('ALTER TABLE properties ADD COLUMN website_url TEXT');
      }

      // Migration 2: Add cookie_banner_detected column to properties table
      const hasCookieBannerDetected = columns.some((col: any) => col.name === 'cookie_banner_detected');

      if (!hasCookieBannerDetected) {
        logger.info('Running migration: Adding cookie_banner_detected column to properties table');
        this.run('ALTER TABLE properties ADD COLUMN cookie_banner_detected INTEGER DEFAULT 0');
      }

      // Migration 3: Add cookie_banner_last_checked column to properties table
      const hasCookieBannerLastChecked = columns.some((col: any) => col.name === 'cookie_banner_last_checked');

      if (!hasCookieBannerLastChecked) {
        logger.info('Running migration: Adding cookie_banner_last_checked column to properties table');
        this.run('ALTER TABLE properties ADD COLUMN cookie_banner_last_checked DATETIME');
      }

      // Migration 4: Add last_accessed_by_account column to properties table
      const hasLastAccessedByAccount = columns.some((col: any) => col.name === 'last_accessed_by_account');

      if (!hasLastAccessedByAccount) {
        logger.info('Running migration: Adding last_accessed_by_account column to properties table');
        this.run('ALTER TABLE properties ADD COLUMN last_accessed_by_account TEXT');
      }

      this.saveDatabase();
    } catch (error) {
      logger.error('Failed to run migrations:', error);
      // Don't throw, allow app to continue
    }
  }

  /**
   * Save database to disk
   */
  private saveDatabase(): void {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  /**
   * Create database schema from SQL file
   */
  private createSchema(): void {
    try {
      if (!this.db) return;

      // Create tables directly
      this.db.run(`CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        account_name TEXT,
        is_favorite INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      this.db.run(`CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id TEXT NOT NULL,
        test_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        comparison_start_date TEXT NOT NULL,
        comparison_end_date TEXT NOT NULL,
        total_events INTEGER,
        comparison_total_events INTEGER,
        percent_change REAL,
        anomaly_count INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      this.db.run(`CREATE TABLE IF NOT EXISTS event_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_result_id INTEGER NOT NULL,
        event_name TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        comparison_count INTEGER NOT NULL,
        percent_change REAL,
        is_anomaly INTEGER DEFAULT 0,
        anomaly_reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      this.db.run(`CREATE TABLE IF NOT EXISTS configuration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )`);

      this.db.run(`CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        interval_type TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        config_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);

      // Create indexes
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_test_results_property_date ON test_results(property_id, created_at DESC)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status, created_at DESC)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_event_details_test_result ON event_details(test_result_id)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_event_details_anomaly ON event_details(is_anomaly, test_result_id)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active, next_run_at)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_properties_favorite ON properties(is_favorite, created_at DESC)`);

      this.saveDatabase();
      logger.info('Database schema created successfully');
    } catch (error) {
      logger.error('Failed to create database schema:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.saveDatabase();
      this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  /**
   * Helper method to execute SELECT queries
   */
  private select(sql: string, params: any[] = []): any[] {
    if (!this.db) return [];

    const results: any[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }

    stmt.free();
    return results;
  }

  /**
   * Helper method to execute INSERT queries and return the inserted ID
   * Uses SELECT max(id) + 1 approach for sql.js compatibility
   */
  private insert(sql: string, params: any[]): { lastID: number; changes: number } {
    if (!this.db) return { lastID: 0, changes: 0 };

    // Get next ID before insert (sql.js doesn't support last_insert_rowid() properly)
    const tableName = sql.match(/INTO\s+(\w+)/i)?.[1];
    let nextId = 1;

    if (tableName) {
      try {
        const maxResult = this.db.exec(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM ${tableName}`);
        if (maxResult.length > 0 && maxResult[0].values.length > 0) {
          nextId = maxResult[0].values[0][0] as number;
        }
      } catch (e) {
        // If query fails, default to 1
        logger.warn(`Could not get max ID for ${tableName}, using 1`);
      }
    }

    // Modify SQL to include the ID in both columns and VALUES
    let insertWithId = sql.replace(
      /INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      (match, table, columns, values) => {
        // Add id to the beginning of column list
        const newColumns = `id, ${columns}`;
        // Add a placeholder for id at the beginning of VALUES
        const newValues = `?, ${values}`;
        return `INSERT INTO ${table} (${newColumns}) VALUES (${newValues})`;
      }
    );

    // Add ID as first parameter
    const paramsWithId = [nextId, ...params];

    this.db.run(insertWithId, paramsWithId);
    this.saveDatabase();

    return { lastID: nextId, changes: 1 };
  }

  /**
   * Helper method to execute UPDATE/DELETE queries
   */
  private run(sql: string, params: any[] = []): { changes: number } {
    if (!this.db) return { changes: 0 };

    this.db.run(sql, params);
    this.saveDatabase();

    return { changes: 1 };
  }

  // ============================================
  // Properties
  // ============================================

  public getProperties(): GA4Property[] {
    try {
      const rows = this.select('SELECT * FROM properties ORDER BY is_favorite DESC, created_at DESC');
      return rows.map(this.mapProperty);
    } catch (error) {
      logger.error('Failed to get properties:', error);
      throw error;
    }
  }

  public getProperty(propertyId: string): GA4Property | null {
    try {
      const rows = this.select('SELECT * FROM properties WHERE property_id = ?', [propertyId]);
      return rows.length > 0 ? this.mapProperty(rows[0]) : null;
    } catch (error) {
      logger.error(`Failed to get property ${propertyId}:`, error);
      throw error;
    }
  }

  public upsertProperty(property: GA4Property): GA4Property {
    try {
      this.run(`
        INSERT INTO properties (property_id, display_name, account_name, is_favorite, website_url, last_accessed_by_account)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(property_id) DO UPDATE SET
          display_name = excluded.display_name,
          account_name = excluded.account_name,
          is_favorite = excluded.is_favorite,
          website_url = excluded.website_url,
          last_accessed_by_account = excluded.last_accessed_by_account
      `, [
        property.propertyId,
        property.displayName,
        property.accountName || '',
        property.isFavorite ? 1 : 0,
        property.websiteUrl || null,
        property.lastAccessedByAccount || null
      ]);

      logger.info(`Property upserted: ${property.propertyId}`);
      return this.getProperty(property.propertyId)!;
    } catch (error) {
      logger.error('Failed to upsert property:', error);
      throw error;
    }
  }

  public setPropertyFavorite(propertyId: string, isFavorite: boolean): void {
    try {
      this.run('UPDATE properties SET is_favorite = ? WHERE property_id = ?', [isFavorite ? 1 : 0, propertyId]);
      logger.info(`Property ${propertyId} favorite set to ${isFavorite}`);
    } catch (error) {
      logger.error('Failed to set property favorite:', error);
      throw error;
    }
  }

  public updatePropertyWebsiteUrl(propertyId: string, websiteUrl: string): void {
    try {
      this.run('UPDATE properties SET website_url = ? WHERE property_id = ?', [websiteUrl, propertyId]);
      logger.info(`Property ${propertyId} website URL updated: ${websiteUrl}`);
    } catch (error) {
      logger.error('Failed to update property website URL:', error);
      throw error;
    }
  }

  public updatePropertyCookieBanner(propertyId: string, hasBanner: boolean): void {
    try {
      this.run(
        'UPDATE properties SET cookie_banner_detected = ?, cookie_banner_last_checked = CURRENT_TIMESTAMP WHERE property_id = ?',
        [hasBanner ? 1 : 0, propertyId]
      );
      logger.info(`Property ${propertyId} cookie banner status updated: ${hasBanner}`);
    } catch (error) {
      logger.error('Failed to update property cookie banner status:', error);
      throw error;
    }
  }

  public deleteProperty(propertyId: string): void {
    try {
      this.run('DELETE FROM properties WHERE property_id = ?', [propertyId]);
      logger.info(`Property deleted: ${propertyId}`);
    } catch (error) {
      logger.error('Failed to delete property:', error);
      throw error;
    }
  }

  // ============================================
  // Test Results
  // ============================================

  public createTestResult(result: Omit<TestResult, 'id' | 'createdAt'>): TestResult {
    try {
      const { lastID } = this.insert(`
        INSERT INTO test_results (
          property_id, test_type, start_date, end_date,
          comparison_start_date, comparison_end_date,
          total_events, comparison_total_events, percent_change,
          anomaly_count, status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        result.propertyId,
        result.testType,
        result.startDate.toISOString(),
        result.endDate.toISOString(),
        result.comparisonStartDate.toISOString(),
        result.comparisonEndDate.toISOString(),
        result.totalEvents,
        result.comparisonTotalEvents,
        result.percentChange,
        result.anomalyCount,
        result.status,
        result.errorMessage || null,
      ]);

      const inserted = this.getTestResult(lastID);
      logger.info(`Test result created: ${lastID}`);
      return inserted!;
    } catch (error) {
      logger.error('Failed to create test result:', error);
      throw error;
    }
  }

  public getTestResult(id: number): TestResult | null {
    try {
      const rows = this.select('SELECT * FROM test_results WHERE id = ?', [id]);
      return rows.length > 0 ? this.mapTestResult(rows[0]) : null;
    } catch (error) {
      logger.error(`Failed to get test result ${id}:`, error);
      throw error;
    }
  }

  public getTestResults(
    propertyId: string,
    limit: number = 50,
    offset: number = 0
  ): { results: TestResult[]; total: number } {
    try {
      const countRows = this.select('SELECT COUNT(*) as count FROM test_results WHERE property_id = ?', [propertyId]);
      const total = countRows[0]?.count || 0;

      const rows = this.select(`
        SELECT * FROM test_results
        WHERE property_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [propertyId, limit, offset]);
      const results = rows.map(this.mapTestResult);

      return { results, total };
    } catch (error) {
      logger.error('Failed to get test results:', error);
      throw error;
    }
  }

  public getRecentTestResults(limit: number = 20, propertyId?: string): TestResult[] {
    try {
      if (propertyId) {
        const rows = this.select(`
          SELECT * FROM test_results
          WHERE property_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `, [propertyId, limit]);
        return rows.map(this.mapTestResult);
      }
      const rows = this.select(`
        SELECT * FROM test_results
        ORDER BY created_at DESC
        LIMIT ?
      `, [limit]);
      return rows.map(this.mapTestResult);
    } catch (error) {
      logger.error('Failed to get recent test results:', error);
      throw error;
    }
  }

  // ============================================
  // Event Details
  // ============================================

  public createEventDetail(detail: Omit<EventDetail, 'id' | 'createdAt'>): EventDetail {
    try {
      const { lastID } = this.insert(`
        INSERT INTO event_details (
          test_result_id, event_name, event_count, comparison_count,
          percent_change, is_anomaly, anomaly_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        detail.testResultId,
        detail.eventName,
        detail.eventCount,
        detail.comparisonCount,
        detail.percentChange,
        detail.isAnomaly ? 1 : 0,
        detail.anomalyReason || null,
      ]);

      const inserted = this.getEventDetail(lastID);
      return inserted!;
    } catch (error) {
      logger.error('Failed to create event detail:', error);
      throw error;
    }
  }

  public getEventDetail(id: number): EventDetail | null {
    try {
      const rows = this.select('SELECT * FROM event_details WHERE id = ?', [id]);
      return rows.length > 0 ? this.mapEventDetail(rows[0]) : null;
    } catch (error) {
      logger.error(`Failed to get event detail ${id}:`, error);
      throw error;
    }
  }

  public getEventDetailsForTest(testResultId: number): EventDetail[] {
    try {
      const rows = this.select('SELECT * FROM event_details WHERE test_result_id = ?', [testResultId]);
      return rows.map(this.mapEventDetail);
    } catch (error) {
      logger.error('Failed to get event details:', error);
      throw error;
    }
  }

  // ============================================
  // Configuration
  // ============================================

  public getConfig(key: string): string | null {
    try {
      const rows = this.select('SELECT value FROM configuration WHERE key = ?', [key]);
      return rows.length > 0 ? rows[0].value : null;
    } catch (error) {
      logger.error(`Failed to get config ${key}:`, error);
      throw error;
    }
  }

  public setConfig(key: string, value: string, description?: string): void {
    try {
      this.run(`
        INSERT INTO configuration (key, value, description)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          description = excluded.description,
          updated_at = CURRENT_TIMESTAMP
      `, [key, value, description || null]);
      logger.info(`Config set: ${key} = ${value}`);
    } catch (error) {
      logger.error('Failed to set config:', error);
      throw error;
    }
  }

  public getAllConfig(): Record<string, string> {
    try {
      const rows = this.select('SELECT key, value FROM configuration');
      const config: Record<string, string> = {};
      rows.forEach(row => {
        config[row.key] = row.value;
      });
      return config;
    } catch (error) {
      logger.error('Failed to get all config:', error);
      throw error;
    }
  }

  public getAppConfig(): AppConfig {
    try {
      const config = this.getAllConfig();
      return {
        testInterval: (config.testInterval as any) || 'monthly',
        testTime: config.testTime || '09:00',
        anomalyThreshold: parseInt(config.anomalyThreshold || '20'),
        enableNotifications: config.enableNotifications === 'true',
        notificationSound: config.notificationSound === 'true',
        dataRetentionDays: parseInt(config.dataRetentionDays || '90'),
        defaultExportFormat: (config.defaultExportFormat as any) || 'pdf',
        autoExport: config.autoExport === 'true',
        selectedProperty: config.selectedProperty || null,
        quietHours: config.quietHoursEnabled ? {
          enabled: config.quietHoursEnabled === 'true',
          start: config.quietHoursStart || '22:00',
          end: config.quietHoursEnd || '08:00',
        } : undefined,
      };
    } catch (error) {
      logger.error('Failed to get app config:', error);
      throw error;
    }
  }

  public setAppConfig(config: Partial<AppConfig>): void {
    try {
      if (config.testInterval) this.setConfig('testInterval', config.testInterval);
      if (config.testTime) this.setConfig('testTime', config.testTime);
      if (config.anomalyThreshold !== undefined) this.setConfig('anomalyThreshold', config.anomalyThreshold.toString());
      if (config.enableNotifications !== undefined) this.setConfig('enableNotifications', config.enableNotifications.toString());
      if (config.notificationSound !== undefined) this.setConfig('notificationSound', config.notificationSound.toString());
      if (config.dataRetentionDays !== undefined) this.setConfig('dataRetentionDays', config.dataRetentionDays.toString());
      if (config.defaultExportFormat) this.setConfig('defaultExportFormat', config.defaultExportFormat);
      if (config.autoExport !== undefined) this.setConfig('autoExport', config.autoExport.toString());
      if (config.selectedProperty !== undefined) this.setConfig('selectedProperty', config.selectedProperty || '');
      if (config.quietHours) {
        this.setConfig('quietHoursEnabled', config.quietHours.enabled.toString());
        this.setConfig('quietHoursStart', config.quietHours.start);
        this.setConfig('quietHoursEnd', config.quietHours.end);
      }
      logger.info('App configuration updated');
    } catch (error) {
      logger.error('Failed to set app config:', error);
      throw error;
    }
  }

  // ============================================
  // Scheduled Tasks
  // ============================================

  public createScheduledTask(task: Omit<ScheduledTask, 'id' | 'createdAt' | 'updatedAt'>): ScheduledTask {
    try {
      const { lastID } = this.insert(`
        INSERT INTO scheduled_tasks (
          property_id, task_type, interval_type, cron_expression,
          is_active, config_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        task.propertyId,
        task.taskType,
        task.intervalType,
        task.cronExpression,
        task.isActive ? 1 : 0,
        task.config ? JSON.stringify(task.config) : null,
      ]);

      const inserted = this.getScheduledTask(lastID);
      logger.info(`Scheduled task created: ${lastID}`);
      return inserted!;
    } catch (error) {
      logger.error('Failed to create scheduled task:', error);
      throw error;
    }
  }

  public getScheduledTask(id: number): ScheduledTask | null {
    try {
      const rows = this.select('SELECT * FROM scheduled_tasks WHERE id = ?', [id]);
      return rows.length > 0 ? this.mapScheduledTask(rows[0]) : null;
    } catch (error) {
      logger.error(`Failed to get scheduled task ${id}:`, error);
      throw error;
    }
  }

  public getScheduledTasks(): ScheduledTask[] {
    try {
      const rows = this.select('SELECT * FROM scheduled_tasks ORDER BY created_at DESC');
      return rows.map(this.mapScheduledTask);
    } catch (error) {
      logger.error('Failed to get scheduled tasks:', error);
      throw error;
    }
  }

  public getActiveScheduledTasks(): ScheduledTask[] {
    try {
      const rows = this.select('SELECT * FROM scheduled_tasks WHERE is_active = 1');
      return rows.map(this.mapScheduledTask);
    } catch (error) {
      logger.error('Failed to get active scheduled tasks:', error);
      throw error;
    }
  }

  public updateScheduledTask(id: number, updates: Partial<ScheduledTask>): void {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.cronExpression !== undefined) {
        fields.push('cron_expression = ?');
        values.push(updates.cronExpression);
      }
      if (updates.isActive !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.isActive ? 1 : 0);
      }
      if (updates.lastRunAt !== undefined) {
        fields.push('last_run_at = ?');
        values.push(updates.lastRunAt.toISOString());
      }
      if (updates.nextRunAt !== undefined) {
        fields.push('next_run_at = ?');
        values.push(updates.nextRunAt.toISOString());
      }
      if (updates.config !== undefined) {
        fields.push('config_json = ?');
        values.push(JSON.stringify(updates.config));
      }

      if (fields.length === 0) return;

      values.push(id);
      this.run(`
        UPDATE scheduled_tasks
        SET ${fields.join(', ')}
        WHERE id = ?
      `, values);
      logger.info(`Scheduled task updated: ${id}`);
    } catch (error) {
      logger.error('Failed to update scheduled task:', error);
      throw error;
    }
  }

  public deleteScheduledTask(id: number): void {
    try {
      this.run('DELETE FROM scheduled_tasks WHERE id = ?', [id]);
      logger.info(`Scheduled task deleted: ${id}`);
    } catch (error) {
      logger.error('Failed to delete scheduled task:', error);
      throw error;
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private mapProperty(row: any): GA4Property {
    return {
      id: row.property_id,
      propertyId: row.property_id,
      displayName: row.display_name,
      accountName: row.account_name || undefined,
      isFavorite: row.is_favorite === 1,
      websiteUrl: row.website_url || undefined,
      cookieBannerDetected: row.cookie_banner_detected === 1,
      cookieBannerLastChecked: row.cookie_banner_last_checked ? new Date(row.cookie_banner_last_checked) : undefined,
      lastAccessedByAccount: row.last_accessed_by_account || undefined,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
    };
  }

  private mapTestResult(row: any): TestResult {
    return {
      id: row.id,
      propertyId: row.property_id,
      testType: row.test_type,
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      comparisonStartDate: new Date(row.comparison_start_date),
      comparisonEndDate: new Date(row.comparison_end_date),
      totalEvents: row.total_events,
      comparisonTotalEvents: row.comparison_total_events,
      percentChange: row.percent_change,
      anomalyCount: row.anomaly_count,
      status: row.status,
      errorMessage: row.error_message || undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapEventDetail(row: any): EventDetail {
    return {
      id: row.id,
      testResultId: row.test_result_id,
      eventName: row.event_name,
      eventCount: row.event_count,
      comparisonCount: row.comparison_count,
      percentChange: row.percent_change,
      isAnomaly: row.is_anomaly === 1,
      anomalyReason: row.anomaly_reason || undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapScheduledTask(row: any): ScheduledTask {
    return {
      id: row.id,
      propertyId: row.property_id,
      taskType: row.task_type,
      intervalType: row.interval_type,
      cronExpression: row.cron_expression,
      isActive: row.is_active === 1,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at) : undefined,
      config: row.config_json ? JSON.parse(row.config_json) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Export singleton instance
export default new StorageService();
