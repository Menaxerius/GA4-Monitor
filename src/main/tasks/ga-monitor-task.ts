import logger from '../utils/logger';
import ga4Service from '../services/ga4.service';
import storageService from '../services/storage.service';
import AnomalyDetectionService from '../services/anomaly-detection.service';
import type { TestInterval, TestResult, EventDetail, Anomaly } from '../../shared/types';

export interface MonitoringTaskConfig {
  propertyId: string;
  interval: TestInterval;
  customDate?: Date;
  anomalyThreshold?: number;
}

export interface MonitoringTaskResult {
  success: boolean;
  testResult?: TestResult;
  eventDetails?: EventDetail[];
  anomalies?: Anomaly[];
  error?: string;
}

export class GAMonitorTask {
  private anomalyDetectionService: AnomalyDetectionService;

  constructor() {
    this.anomalyDetectionService = new AnomalyDetectionService();
  }

  /**
   * Execute monitoring task
   */
  public async execute(config: MonitoringTaskConfig): Promise<MonitoringTaskResult> {
    const { propertyId, interval, customDate, anomalyThreshold } = config;

    logger.info(`Starting GA monitoring task for property ${propertyId} (${interval})`);

    try {
      // Validate property
      const property = storageService.getProperty(propertyId);
      if (!property) {
        throw new Error(`Property ${propertyId} not found in database`);
      }

      // Get date ranges
      const dateRanges = ga4Service.getDateRangesForInterval(interval, customDate);

      logger.info(`Current period: ${dateRanges.current.start.toISOString()} to ${dateRanges.current.end.toISOString()}`);
      logger.info(`Previous period: ${dateRanges.previous.start.toISOString()} to ${dateRanges.previous.end.toISOString()}`);

      // Fetch data for both periods
      logger.info('Fetching GA4 data...');
      const { current, previous } = await ga4Service.comparePeriods(
        propertyId,
        dateRanges.current.start,
        dateRanges.current.end,
        dateRanges.previous.start,
        dateRanges.previous.end
      );

      logger.info(`Current period: ${current.totalEvents} events, ${current.events.length} unique events`);
      logger.info(`Previous period: ${previous.totalEvents} events, ${previous.events.length} unique events`);

      // Calculate overall percent change
      const totalPercentChange = previous.totalEvents > 0
        ? ((current.totalEvents - previous.totalEvents) / previous.totalEvents) * 100
        : 0;

      // Detect anomalies
      logger.info('Detecting anomalies...');
      if (anomalyThreshold) {
        this.anomalyDetectionService.updateConfig({ thresholdPercent: anomalyThreshold });
      }

      const anomalies = this.anomalyDetectionService.detectAnomalies(
        current.events,
        previous.events,
        interval
      );

      logger.info(`Detected ${anomalies.length} anomalies`);

      // Determine test status
      const status = this.anomalyDetectionService.determineTestStatus(anomalies);
      logger.info(`Test status: ${status}`);

      // Create test result in database
      logger.info('Saving test result...');
      const testResult = storageService.createTestResult({
        propertyId,
        testType: interval,
        startDate: dateRanges.current.start,
        endDate: dateRanges.current.end,
        comparisonStartDate: dateRanges.previous.start,
        comparisonEndDate: dateRanges.previous.end,
        totalEvents: current.totalEvents,
        comparisonTotalEvents: previous.totalEvents,
        percentChange: totalPercentChange,
        anomalyCount: anomalies.length,
        status,
      });

      // Save event details
      logger.info('Saving event details...');
      const eventDetails: EventDetail[] = [];

      for (const currentEvent of current.events) {
        const previousEvent = previous.events.find(e => e.eventName === currentEvent.eventName);
        const comparisonCount = previousEvent?.eventCount || 0;
        const percentChange = comparisonCount > 0
          ? ((currentEvent.eventCount - comparisonCount) / comparisonCount) * 100
          : comparisonCount === 0 && currentEvent.eventCount > 0 ? 100 : 0;

        // Check if this event is an anomaly
        const anomaly = anomalies.find(a => a.eventName === currentEvent.eventName);
        const isAnomaly = !!anomaly;
        const anomalyReason = anomaly?.reason;

        const eventDetail = storageService.createEventDetail({
          testResultId: testResult.id,
          eventName: currentEvent.eventName,
          eventCount: currentEvent.eventCount,
          comparisonCount,
          percentChange,
          isAnomaly,
          anomalyReason,
        });

        eventDetails.push(eventDetail);
      }

      // Also save events that only exist in previous period (missing events)
      for (const previousEvent of previous.events) {
        const exists = current.events.find(e => e.eventName === previousEvent.eventName);
        if (!exists) {
          const anomaly = anomalies.find(a => a.eventName === previousEvent.eventName);

          const eventDetail = storageService.createEventDetail({
            testResultId: testResult.id,
            eventName: previousEvent.eventName,
            eventCount: 0,
            comparisonCount: previousEvent.eventCount,
            percentChange: -100,
            isAnomaly: !!anomaly,
            anomalyReason: anomaly?.reason,
          });

          eventDetails.push(eventDetail);
        }
      }

      logger.info(`Monitoring task completed successfully for property ${propertyId}`);

      return {
        success: true,
        testResult,
        eventDetails,
        anomalies,
      };
    } catch (error: any) {
      logger.error(`Monitoring task failed for property ${propertyId}:`, error);

      // Try to save error result
      try {
        const dateRanges = ga4Service.getDateRangesForInterval(interval, customDate);

        storageService.createTestResult({
          propertyId,
          testType: interval,
          startDate: dateRanges.current.start,
          endDate: dateRanges.current.end,
          comparisonStartDate: dateRanges.previous.start,
          comparisonEndDate: dateRanges.previous.end,
          totalEvents: 0,
          comparisonTotalEvents: 0,
          percentChange: 0,
          anomalyCount: 0,
          status: 'error',
          errorMessage: error.message || 'Unknown error',
        });
      } catch (saveError) {
        logger.error('Failed to save error result:', saveError);
      }

      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Execute monitoring task for multiple properties
   */
  public async executeMultiple(
    configs: MonitoringTaskConfig[]
  ): Promise<MonitoringTaskResult[]> {
    const results: MonitoringTaskResult[] = [];

    logger.info(`Executing ${configs.length} monitoring tasks`);

    for (const config of configs) {
      const result = await this.execute(config);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    logger.info(`Completed ${configs.length} tasks: ${successCount} success, ${failureCount} failed`);

    return results;
  }

  /**
   * Get test summary for display
   */
  public getTestSummary(result: MonitoringTaskResult): {
    totalEvents: number;
    comparisonEvents: number;
    percentChange: number;
    anomaliesCount: number;
    status: string;
    hasDataDrop: boolean;
  } | null {
    if (!result.success || !result.testResult) {
      return null;
    }

    const { testResult, anomalies } = result;

    // Check for significant data drop
    const hasDataDrop = testResult.percentChange < -20;

    return {
      totalEvents: testResult.totalEvents,
      comparisonEvents: testResult.comparisonTotalEvents,
      percentChange: testResult.percentChange,
      anomaliesCount: anomalies?.length || 0,
      status: testResult.status,
      hasDataDrop,
    };
  }

  /**
   * Format test result for notification
   */
  public formatForNotification(result: MonitoringTaskResult): {
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error';
  } | null {
    if (!result.success || !result.testResult) {
      return {
        title: 'GA4 Monitoring Failed',
        message: result.error || 'Unknown error occurred',
        type: 'error',
      };
    }

    const { testResult, anomalies } = result;
    const property = storageService.getProperty(testResult.propertyId);

    let title = `GA4 Monitoring: ${property?.displayName || testResult.propertyId}`;
    let message = '';
    let type: 'info' | 'warning' | 'error' = 'info';

    const changeStr = `${testResult.percentChange >= 0 ? '+' : ''}${testResult.percentChange.toFixed(1)}%`;
    message += `Events: ${testResult.totalEvents} (${changeStr})\n`;
    message += `Period: ${testResult.testType}\n`;

    if (anomalies && anomalies.length > 0) {
      const highSeverity = anomalies.filter(a => a.severity === 'high').length;
      const mediumSeverity = anomalies.filter(a => a.severity === 'medium').length;

      message += `\nAnomalies: ${anomalies.length}`;
      if (highSeverity > 0) {
        message += ` (${highSeverity} critical)`;
        type = 'error';
      } else if (mediumSeverity > 0) {
        message += ` (${mediumSeverity} warnings)`;
        type = 'warning';
      }
    }

    if (testResult.status === 'error') {
      type = 'error';
      title = `⚠️ ${title}`;
    } else if (testResult.status === 'warning') {
      type = 'warning';
    }

    return { title, message, type };
  }

  /**
   * Update anomaly detection configuration
   */
  public updateAnomalyConfig(config: {
    thresholdPercent?: number;
    useStatisticalDetection?: boolean;
    statisticalThreshold?: number;
    detectEventDrift?: boolean;
  }): void {
    this.anomalyDetectionService.updateConfig(config);
    logger.info('Anomaly detection config updated', config);
  }

  /**
   * Get anomaly summary
   */
  public getAnomalySummary(anomalies: Anomaly[]) {
    return this.anomalyDetectionService.getAnomalySummary(anomalies);
  }
}

// Export class (not singleton, to allow multiple instances)
export default GAMonitorTask;
