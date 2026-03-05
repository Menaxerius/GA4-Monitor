import logger from '../utils/logger';
import { API_LIMITS } from '../../shared/constants';
import type { GA4Property, GA4EventReport, GA4Event, DetailedEvent, EventDetailReport } from '../../shared/types';
import authService from './auth.service';
import { https } from 'follow-redirects';
import { URL } from 'url';

export class GA4Service {
  private analyticsData: any = null;
  private analyticsAdmin: any = null;
  private clientsInitialized = false;

  constructor() {
    // Don't initialize clients in constructor - wait until needed
  }

  /**
   * Make an authenticated HTTPS request to GA4 API
   */
  private async makeGa4Request<T = any>(
    url: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<T> {
    const accessToken = await authService.getAccessToken();
    logger.info(`Making GA4 API request: ${method} ${url}`);

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };

      const req = https.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200 || res.statusCode === 201) {
              resolve(JSON.parse(data));
            } else {
              const errorData = JSON.parse(data);
              logger.error(`GA4 API request failed: ${res.statusCode}`, errorData);
              reject(errorData);
            }
          } catch (e) {
            logger.error('Failed to parse GA4 API response', e);
            reject(e);
          }
        });
      });

      req.on('error', (error: any) => {
        logger.error('GA4 API request error', error);
        reject(error);
      });

      if (body && method === 'POST') {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Initialize Google Analytics clients
   */
  private async initializeClients(forceRefresh: boolean = false): Promise<void> {
    // Skip if already initialized (unless force refresh)
    if (!forceRefresh && this.clientsInitialized && this.analyticsData && this.analyticsAdmin) {
      return;
    }

    try {
      // Check if user is authenticated first
      const isAuthenticated = await authService.isAuthenticated();
      if (!isAuthenticated) {
        throw new Error('User not authenticated. Please login first.');
      }

      const auth = await authService.getAuthenticatedClient();

      // Debug: Log the auth client state
      logger.info('Auth client for googleapis:', {
        hasCredentials: !!(auth as any).credentials,
        hasAccessToken: !!(auth as any).credentials?.access_token,
        tokenLength: (auth as any).credentials?.access_token?.length || 0,
      });

      // Create Google API services with proper error handling
      // Note: We need to access the correct path in googleapis
      const { google } = require('googleapis');

      if (!google.analyticsdata || !google.analyticsadmin) {
        throw new Error('Google Analytics services not available. Please check googleapis installation.');
      }

      // Create clients with auth
      this.analyticsData = google.analyticsdata({
        version: 'v1beta',
        auth: auth
      });

      this.analyticsAdmin = google.analyticsadmin({
        version: 'v1beta',
        auth: auth
      });

      if (!this.analyticsData || !this.analyticsAdmin) {
        throw new Error('Failed to create Google Analytics clients');
      }

      this.clientsInitialized = true;
      logger.info('GA4 clients initialized');
    } catch (error: any) {
      logger.error('Failed to initialize GA4 clients:', error);
      // Reset initialization flags to allow retry
      this.clientsInitialized = false;
      this.analyticsData = null;
      this.analyticsAdmin = null;
      throw error;
    }
  }

  /**
   * List all GA4 properties accessible to the user
   */
  public async listProperties(): Promise<GA4Property[]> {
    try {
      logger.info('Fetching GA4 properties using manual HTTPS request...');

      // Get current account email
      const accountManagerService = (await import('./account-manager.service')).default;
      const currentAccountEmail = accountManagerService.getCurrentAccountEmail();

      const properties: GA4Property[] = [];
      let nextPageToken: string | undefined = undefined;

      do {
        try {
          const url = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
          if (nextPageToken) {
            url.searchParams.set('pageToken', nextPageToken);
          }
          url.searchParams.set('pageSize', API_LIMITS.MAX_PROPERTIES_PER_REQUEST.toString());

          const response = await this.makeGa4Request<any>(url.toString(), 'GET');

          if (response.accountSummaries) {
            logger.info(`Got ${response.accountSummaries.length} account summaries in this batch`);

            for (const summary of response.accountSummaries) {
              const accountName = summary.displayName || summary.name;

              // Each account summary contains property summaries
              if (summary.propertySummaries && summary.propertySummaries.length > 0) {
                logger.info(`Account ${accountName}: ${summary.propertySummaries.length} properties`);

                for (const propSummary of summary.propertySummaries) {
                  let propertyId = null;
                  let displayName = null;

                  // Extract property ID from the "property" string (e.g., "properties/123456")
                  if (propSummary.property && typeof propSummary.property === 'string') {
                    const parts = propSummary.property.split('/');
                    propertyId = parts[parts.length - 1];
                    displayName = propSummary.displayName || `Property ${propertyId}`;
                  }

                  if (propertyId) {
                    logger.info(`Adding property: ${displayName} (${propertyId}) from ${accountName}`);

                    properties.push({
                      id: propertyId,
                      propertyId: propertyId,
                      displayName: displayName,
                      accountName: accountName,
                      isFavorite: false,
                      lastAccessedByAccount: currentAccountEmail || undefined,
                    });
                  } else {
                    logger.warn(`Could not extract property ID from summary: ${JSON.stringify(Object.keys(propSummary))}`);
                  }
                }
              } else {
                logger.debug(`Account ${accountName}: No properties found`);
              }
            }
          }

          nextPageToken = response.nextPageToken;

          if (nextPageToken) {
            logger.info(`Fetching next page with token: ${nextPageToken}`);
          }
        } catch (batchError: any) {
          logger.error('Error fetching batch:', batchError.message);
          break; // Stop pagination on error
        }
      } while (nextPageToken);

      logger.info(`Found ${properties.length} GA4 properties total`);

      if (properties.length === 0) {
        logger.warn('No GA4 properties found. This could mean:');
        logger.warn('1. Your accounts only have Universal Analytics (GA3) properties, not GA4');
        logger.warn('2. You do not have permission to access GA4 properties');
        logger.warn('3. No GA4 properties have been created in your accounts');
      }

      return properties;
    } catch (error: any) {
      logger.error('Failed to list properties:', error);
      if (error.code === 401) {
        throw new Error('Authentication failed. Please login again.');
      }
      throw error;
    }
  }

  /**
   * Get event report for a property and date range
   */
  public async getEventReport(
    propertyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<GA4EventReport> {
    try {
      const formattedStartDate = this.formatDateForGA4(startDate);
      const formattedEndDate = this.formatDateForGA4(endDate);

      logger.info(`Fetching event report for property ${propertyId} from ${formattedStartDate} to ${formattedEndDate}`);

      const events: GA4Event[] = [];
      let totalEvents = 0;
      let offset = 0;
      let hasMoreData = true;

      // Fetch data in pages
      while (hasMoreData) {
        const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
        const requestBody = {
          dateRanges: [
            {
              startDate: formattedStartDate,
              endDate: formattedEndDate,
            },
          ],
          dimensions: [
            {
              name: 'eventName',
            },
          ],
          metrics: [
            {
              name: 'eventCount',
            },
          ],
          offset: offset,
          limit: API_LIMITS.MAX_ROWS_PER_REQUEST,
          orderBys: [
            {
              metric: {
                metricName: 'eventCount',
              },
              desc: true,
            },
          ],
        };

        const response = await this.makeGa4Request<any>(url, 'POST', requestBody);

        // Debug: Log the complete API response structure
        logger.info('GA4 API Response structure:', {
          hasData: !!response,
          hasRows: !!response?.rows,
          rowCount: response?.rows?.length || 0,
          totalRowCount: response?.rowCount,
          responseKeys: Object.keys(response || {}),
          rowsPreview: response?.rows?.slice(0, 2),
        });

        // Log error if present
        if (response?.error) {
          logger.error('GA4 API Error:', {
            code: response.error.code,
            message: response.error.message,
            status: response.error.status,
            details: response.error.details,
          });
          throw new Error(response.error.message);
        }

        // Process rows
        if (response.rows) {
          for (const row of response.rows) {
            const eventName = row.dimensionValues?.[0]?.value || '(not set)';
            const eventCount = parseInt(row.metricValues?.[0]?.value || '0');

            events.push({
              eventName,
              eventCount,
            });

            totalEvents += eventCount;
          }
        }

        // Check if there's more data
        const rowCount = response.rowCount || 0;
        hasMoreData = offset + API_LIMITS.MAX_ROWS_PER_REQUEST < rowCount;
        offset += API_LIMITS.MAX_ROWS_PER_REQUEST;

        logger.debug(`Fetched ${events.length} events so far...`);
      }

      logger.info(`Event report complete: ${totalEvents} total events, ${events.length} unique events`);

      return {
        propertyId,
        dateRange: {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
        },
        totalEvents,
        events,
        rowCount: events.length,
      };
    } catch (error: any) {
      logger.error('Failed to get event report:', error);
      if (error.code === 403) {
        throw new Error('Access denied. You do not have permission to access this property.');
      } else if (error.code === 404) {
        throw new Error('Property not found.');
      }
      throw error;
    }
  }

  /**
   * Get metadata for a property
   */
  public async getPropertyMetadata(propertyId: string): Promise<any> {
    try {
      logger.info(`Fetching metadata for property ${propertyId}`);

      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`;
      const response = await this.makeGa4Request<any>(url, 'GET');

      logger.info('Metadata fetched successfully');
      return response;
    } catch (error) {
      logger.error('Failed to get property metadata:', error);
      throw error;
    }
  }

  /**
   * Get available dimensions and metrics for a property
   */
  public async getAvailableDimensionsAndMetrics(propertyId: string): Promise<{
    dimensions: string[];
    metrics: string[];
  }> {
    try {
      const metadata = await this.getPropertyMetadata(propertyId);

      const dimensions = metadata.dimensions?.map(d => d.apiName) || [];
      const metrics = metadata.metrics?.map(m => m.apiName) || [];

      logger.info(`Found ${dimensions.length} dimensions and ${metrics.length} metrics`);

      return { dimensions, metrics };
    } catch (error) {
      logger.error('Failed to get dimensions and metrics:', error);
      throw error;
    }
  }

  /**
   * Get custom report with specific dimensions and metrics
   */
  public async getCustomReport(
    propertyId: string,
    startDate: Date,
    endDate: Date,
    dimensions: string[],
    metrics: string[],
    limit: number = 10000
  ): Promise<any> {
    try {
      const formattedStartDate = this.formatDateForGA4(startDate);
      const formattedEndDate = this.formatDateForGA4(endDate);

      logger.info(`Fetching custom report for property ${propertyId}`);

      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
      const requestBody = {
        dateRanges: [
          {
            startDate: formattedStartDate,
            endDate: formattedEndDate,
          },
        ],
        dimensions: dimensions.map(name => ({ name })),
        metrics: metrics.map(name => ({ name })),
        limit,
      };

      const response = await this.makeGa4Request<any>(url, 'POST', requestBody);

      logger.info('Custom report fetched successfully');
      return response;
    } catch (error) {
      logger.error('Failed to get custom report:', error);
      throw error;
    }
  }

  /**
   * Compare event counts between two periods
   */
  public async comparePeriods(
    propertyId: string,
    currentStart: Date,
    currentEnd: Date,
    previousStart: Date,
    previousEnd: Date
  ): Promise<{
    current: GA4EventReport;
    previous: GA4EventReport;
  }> {
    try {
      logger.info(`Comparing periods for property ${propertyId}`);

      // Fetch both periods in parallel
      const [current, previous] = await Promise.all([
        this.getEventReport(propertyId, currentStart, currentEnd),
        this.getEventReport(propertyId, previousStart, previousEnd),
      ]);

      logger.info('Period comparison complete');
      return { current, previous };
    } catch (error) {
      logger.error('Failed to compare periods:', error);
      throw error;
    }
  }

  /**
   * Format date for GA4 API (YYYY-MM-DD)
   */
  private formatDateForGA4(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get date ranges for comparison based on interval type
   */
  public getDateRangesForInterval(
    interval: 'daily' | 'weekly' | 'monthly' | 'quarterly',
    customDate?: Date
  ): {
    current: { start: Date; end: Date };
    previous: { start: Date; end: Date };
  } {
    const now = customDate || new Date();
    
    // Use yesterday as the reference point (not today)
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    let daysBack: number;

    switch (interval) {
      case 'daily':
        daysBack = 1;
        break;
      case 'weekly':
        daysBack = 7;
        break;
      case 'monthly':
        daysBack = 30;
        break;
      case 'quarterly':
        daysBack = 90;
        break;
      default:
        throw new Error(`Invalid interval: ${interval}`);
    }

    const currentStart = new Date(yesterday);
    currentStart.setDate(yesterday.getDate() - daysBack + 1);
    const currentEnd = new Date(yesterday);

    const previousEnd = new Date(currentStart);
    previousEnd.setDate(currentStart.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - daysBack + 1);

    return {
      current: { start: currentStart, end: currentEnd },
      previous: { start: previousStart, end: previousEnd },
    };
  }

  /**
   * Get detailed event information including last event date
   */
  public async getDetailedEventReport(
    propertyId: string,
    startDate: Date,
    endDate: Date,
    previousStartDate: Date,
    previousEndDate: Date
  ): Promise<EventDetailReport> {
    try {
      const formattedStartDate = this.formatDateForGA4(startDate);
      const formattedEndDate = this.formatDateForGA4(endDate);
      const formattedPreviousStart = this.formatDateForGA4(previousStartDate);
      const formattedPreviousEnd = this.formatDateForGA4(previousEndDate);

      logger.info(`Fetching detailed event report for property ${propertyId}`);

      const events: DetailedEvent[] = [];
      let totalEvents = 0;
      let offset = 0;
      let hasMoreData = true;

      while (hasMoreData) {
        const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
        const requestBody = {
          dateRanges: [
            {
              startDate: formattedStartDate,
              endDate: formattedEndDate,
            },
          ],
          dimensions: [
            {
              name: 'eventName',
            },
            {
              name: 'date',
            },
          ],
          metrics: [
            {
              name: 'eventCount',
            },
          ],
          offset: offset,
          limit: API_LIMITS.MAX_ROWS_PER_REQUEST,
          orderBys: [
            {
              dimension: {
                dimensionName: 'eventName',
              },
              desc: false,
            },
            {
              dimension: {
                dimensionName: 'date',
              },
              desc: true,
            },
          ],
        };

        const response = await this.makeGa4Request<any>(url, 'POST', requestBody);

        if (response.rows) {
          const eventMap = new Map<string, { count: number; lastDate: string; lastDateTime: Date }>();

          for (const row of response.rows) {
            const eventName = row.dimensionValues?.[0]?.value || '(not set)';
            const eventDate = row.dimensionValues?.[1]?.value || '';
            const eventCount = parseInt(row.metricValues?.[0]?.value || '0');

            if (!eventMap.has(eventName)) {
              eventMap.set(eventName, { count: 0, lastDate: '', lastDateTime: new Date(0) });
            }

            const eventData = eventMap.get(eventName)!;
            eventData.count += eventCount;
            totalEvents += eventCount;

            if (eventDate) {
              let eventDateTime: Date;

              // GA4 returns dates in YYYYMMDD format (e.g., "20260115")
              if (eventDate.length === 8 && !eventDate.includes('-')) {
                const year = parseInt(eventDate.substring(0, 4));
                const month = parseInt(eventDate.substring(4, 6));
                const day = parseInt(eventDate.substring(6, 8));
                eventDateTime = new Date(year, month - 1, day);
              } else {
                // Fallback for YYYY-MM-DD format
                const [year, month, day] = eventDate.split('-').map(Number);
                eventDateTime = new Date(year, month - 1, day);
              }

              if (eventDateTime > eventData.lastDateTime) {
                eventData.lastDate = eventDate;
                eventData.lastDateTime = eventDateTime;
              }
            }
          }

          for (const [eventName, data] of eventMap) {
            // Only calculate days ago if we have a valid date (not the epoch 1970)
            const hasValidDate = data.lastDateTime.getTime() > 0;
            const daysAgo = hasValidDate
              ? Math.floor((new Date().getTime() - data.lastDateTime.getTime()) / (1000 * 60 * 60 * 24))
              : 0;

            events.push({
              eventName,
              eventCount: data.count,
              lastEventDate: data.lastDate,
              lastEventDateTime: data.lastDateTime,
              lastEventDaysAgo: daysAgo,
              isInactive: false,
              trend: 'stable',
              percentChange: 0,
              previousCount: 0,
              status: 'active',
            });
          }
        }

        const rowCount = response.rowCount || 0;
        hasMoreData = offset + API_LIMITS.MAX_ROWS_PER_REQUEST < rowCount;
        offset += API_LIMITS.MAX_ROWS_PER_REQUEST;

        logger.debug(`Fetched ${events.length} events so far...`);
      }

      logger.info(`Fetching previous period data for comparison`);

      const previousEventMap = new Map<string, number>();
      let previousOffset = 0;
      let hasPreviousData = true;

      while (hasPreviousData) {
        const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
        const requestBody = {
          dateRanges: [
            {
              startDate: formattedPreviousStart,
              endDate: formattedPreviousEnd,
            },
          ],
          dimensions: [
            {
              name: 'eventName',
            },
          ],
          metrics: [
            {
              name: 'eventCount',
            },
          ],
          offset: previousOffset,
          limit: API_LIMITS.MAX_ROWS_PER_REQUEST,
        };

        const response = await this.makeGa4Request<any>(url, 'POST', requestBody);

        if (response.rows) {
          for (const row of response.rows) {
            const eventName = row.dimensionValues?.[0]?.value || '(not set)';
            const eventCount = parseInt(row.metricValues?.[0]?.value || '0');
            previousEventMap.set(eventName, (previousEventMap.get(eventName) || 0) + eventCount);
          }
        }

        const rowCount = response.rowCount || 0;
        hasPreviousData = previousOffset + API_LIMITS.MAX_ROWS_PER_REQUEST < rowCount;
        previousOffset += API_LIMITS.MAX_ROWS_PER_REQUEST;
      }

      for (const event of events) {
        const previousCount = previousEventMap.get(event.eventName) || 0;
        event.previousCount = previousCount;

        if (previousCount > 0) {
          event.percentChange = ((event.eventCount - previousCount) / previousCount) * 100;
        }

        if (event.percentChange > 10) {
          event.trend = 'up';
        } else if (event.percentChange < -10) {
          event.trend = 'down';
        }

        if (event.lastEventDaysAgo > 30) {
          event.isInactive = true;
          event.status = 'inactive';
        } else if (event.lastEventDaysAgo > 14) {
          event.status = 'warning';
        }
      }

      logger.info(`Detailed event report complete: ${totalEvents} total events, ${events.length} unique events`);

      return {
        propertyId,
        dateRange: {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
        },
        events,
        totalEvents,
      };
    } catch (error: any) {
      logger.error('Failed to get detailed event report:', error);
      throw error;
    }
  }

  /**
   * Validate property ID format
   */
  public isValidPropertyId(propertyId: string): boolean {
    // GA4 property IDs are numeric strings
    return /^\d+$/.test(propertyId);
  }

  /**
   * Test connection to GA4 API
   */
  public async testConnection(propertyId?: string): Promise<boolean> {
    try {
      await this.initializeClients();

      if (propertyId) {
        // Try to fetch metadata for specific property
        await this.getPropertyMetadata(propertyId);
      } else {
        // Try to list properties
        await this.listProperties();
      }

      logger.info('Connection test successful');
      return true;
    } catch (error) {
      logger.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get conversion events from GA4
   */
  async getConversionEvents(propertyId: string): Promise<string[]> {
    try {
      // Use Admin API instead of Data API for conversion events
      const url = `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/conversionEvents`;

      const response = await this.makeGa4Request<{
        conversionEvents?: Array<{
          name: string;
          eventName: string;
          createTime: string;
          deletable: boolean;
          custom: boolean;
          countingMethod: string;
        }>;
      }>(url, 'GET');

      if (response.conversionEvents) {
        const eventNames = response.conversionEvents.map(ce => ce.eventName);
        logger.info(`Found ${eventNames.length} conversion events for property ${propertyId}`);
        return eventNames;
      }

      return [];
    } catch (error: any) {
      logger.error('Failed to fetch conversion events:', error.message);
      return [];
    }
  }
}

// Export singleton instance
export default new GA4Service();
