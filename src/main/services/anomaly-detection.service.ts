import logger from '../utils/logger';
import { ANOMALY_THRESHOLDS } from '../../shared/constants';
import type { Anomaly, GA4Event, TestInterval } from '../../shared/types';

export interface AnomalyDetectionConfig {
  thresholdPercent: number; // Default 20%
  useStatisticalDetection: boolean;
  statisticalThreshold: number; // Z-score threshold (default 2)
  detectEventDrift: boolean;
}

export interface EventComparison {
  eventName: string;
  currentCount: number;
  previousCount: number;
  percentChange: number;
}

export class AnomalyDetectionService {
  private config: AnomalyDetectionConfig;

  constructor(config?: Partial<AnomalyDetectionConfig>) {
    this.config = {
      thresholdPercent: config?.thresholdPercent ?? ANOMALY_THRESHOLDS.MEDIUM,
      useStatisticalDetection: config?.useStatisticalDetection ?? true,
      statisticalThreshold: config?.statisticalThreshold ?? 2,
      detectEventDrift: config?.detectEventDrift ?? true,
    };
  }

  /**
   * Detect anomalies in event data
   */
  public detectAnomalies(
    currentEvents: GA4Event[],
    previousEvents: GA4Event[],
    interval?: TestInterval
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    logger.info('Starting anomaly detection...');

    // Create maps for easier lookup
    const currentMap = new Map(currentEvents.map(e => [e.eventName, e.eventCount]));
    const previousMap = new Map(previousEvents.map(e => [e.eventName, e.eventCount]));

    // Get all unique event names
    const allEventNames = new Set([
      ...currentEvents.map(e => e.eventName),
      ...previousEvents.map(e => e.eventName),
    ]);

    // Check each event for anomalies
    for (const eventName of allEventNames) {
      const currentCount = currentMap.get(eventName) || 0;
      const previousCount = previousMap.get(eventName) || 0;

      const comparison = this.compareEventCounts(eventName, currentCount, previousCount);

      // Detect threshold anomalies
      const thresholdAnomaly = this.detectThresholdAnomaly(comparison);
      if (thresholdAnomaly) {
        anomalies.push(thresholdAnomaly);
      }

      // Detect statistical anomalies (if enough historical data)
      // Note: For true statistical analysis, we'd need more than 2 data points
      // This is a simplified version using the comparison data
      if (this.config.useStatisticalDetection && currentCount > 0 && previousCount > 0) {
        const statisticalAnomaly = this.detectStatisticalAnomaly(comparison);
        if (statisticalAnomaly && !thresholdAnomaly) {
          // Only add if not already detected by threshold
          anomalies.push(statisticalAnomaly);
        }
      }
    }

    // Detect event drift (new/missing events)
    if (this.config.detectEventDrift) {
      const driftAnomalies = this.detectEventDrift(currentEvents, previousEvents);
      anomalies.push(...driftAnomalies);
    }

    logger.info(`Detected ${anomalies.length} anomalies`);
    return anomalies;
  }

  /**
   * Compare event counts between current and previous period
   */
  private compareEventCounts(
    eventName: string,
    currentCount: number,
    previousCount: number
  ): EventComparison {
    let percentChange = 0;

    if (previousCount > 0) {
      percentChange = ((currentCount - previousCount) / previousCount) * 100;
    } else if (currentCount > 0) {
      // New event (infinite increase)
      percentChange = 100;
    } else {
      // Event doesn't exist in either period
      percentChange = 0;
    }

    return {
      eventName,
      currentCount,
      previousCount,
      percentChange,
    };
  }

  /**
   * Detect threshold-based anomalies
   */
  private detectThresholdAnomaly(comparison: EventComparison): Anomaly | null {
    const { eventName, currentCount, previousCount, percentChange } = comparison;

    // Skip if event doesn't exist in both periods
    if (currentCount === 0 && previousCount === 0) {
      return null;
    }

    // Check if change exceeds threshold
    if (Math.abs(percentChange) >= this.config.thresholdPercent) {
      const severity = this.calculateSeverity(Math.abs(percentChange));

      let reason: string;
      if (currentCount === 0) {
        reason = `Event completely dropped (previously ${previousCount} events)`;
      } else if (previousCount === 0) {
        reason = `New event detected (${currentCount} events)`;
      } else if (percentChange < 0) {
        reason = `Significant decrease: ${percentChange.toFixed(1)}% (${previousCount} → ${currentCount})`;
      } else {
        reason = `Significant increase: ${percentChange.toFixed(1)}% (${previousCount} → ${currentCount})`;
      }

      return {
        eventName,
        type: 'threshold',
        severity,
        reason,
        currentValue: currentCount,
        previousValue: previousCount,
        percentChange,
      };
    }

    return null;
  }

  /**
   * Detect statistical anomalies using Z-score
   * Note: This is a simplified version using only 2 data points
   * For proper statistical analysis, you need more historical data
   */
  private detectStatisticalAnomaly(comparison: EventComparison): Anomaly | null {
    const { eventName, currentCount, previousCount, percentChange } = comparison;

    // Simplified Z-score calculation using only 2 data points
    // In a real implementation, you'd use more historical data
    if (previousCount === 0) {
      return null; // Can't calculate Z-score if previous is 0
    }

    // Calculate mean and standard deviation from 2 data points
    const mean = (currentCount + previousCount) / 2;
    const variance = (Math.pow(currentCount - mean, 2) + Math.pow(previousCount - mean, 2)) / 2;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return null; // No variation
    }

    const zScore = Math.abs(currentCount - mean) / stdDev;

    if (zScore > this.config.statisticalThreshold) {
      return {
        eventName,
        type: 'statistical',
        severity: zScore > 3 ? 'high' : 'medium',
        reason: `Statistical anomaly detected (Z-score: ${zScore.toFixed(2)})`,
        currentValue: currentCount,
        previousValue: previousCount,
        percentChange,
      };
    }

    return null;
  }

  /**
   * Detect event drift (new or missing events)
   */
  private detectEventDrift(
    currentEvents: GA4Event[],
    previousEvents: GA4Event[]
  ): Anomaly[] {
    const anomalies: Anomaly[] = [];

    const currentSet = new Set(currentEvents.map(e => e.eventName));
    const previousSet = new Set(previousEvents.map(e => e.eventName));

    // Find new events
    const newEvents = [...currentSet].filter(name => !previousSet.has(name));
    for (const eventName of newEvents) {
      const currentCount = currentEvents.find(e => e.eventName === eventName)!.eventCount;

      anomalies.push({
        eventName,
        type: 'drift',
        severity: 'low',
        reason: `New event appeared in current period (${currentCount} events)`,
        currentValue: currentCount,
        previousValue: 0,
        percentChange: 100,
      });
    }

    // Find missing events
    const missingEvents = [...previousSet].filter(name => !currentSet.has(name));
    for (const eventName of missingEvents) {
      const previousCount = previousEvents.find(e => e.eventName === eventName)!.eventCount;

      anomalies.push({
        eventName,
        type: 'drift',
        severity: previousCount > 100 ? 'high' : 'medium',
        reason: `Event missing in current period (previously ${previousCount} events)`,
        currentValue: 0,
        previousValue: previousCount,
        percentChange: -100,
      });
    }

    return anomalies;
  }

  /**
   * Calculate severity based on percent change
   */
  private calculateSeverity(percentChange: number): 'low' | 'medium' | 'high' {
    if (Math.abs(percentChange) >= ANOMALY_THRESHOLDS.HIGH) {
      return 'high';
    } else if (Math.abs(percentChange) >= ANOMALY_THRESHOLDS.MEDIUM) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get summary statistics from anomalies
   */
  public getAnomalySummary(anomalies: Anomaly[]): {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    percentDrop: number;
    percentIncrease: number;
    missingEvents: number;
    newEvents: number;
  } {
    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    const byType: Record<string, number> = {
      threshold: 0,
      statistical: 0,
      drift: 0,
    };

    let percentDrop = 0;
    let percentIncrease = 0;
    let missingEvents = 0;
    let newEvents = 0;

    for (const anomaly of anomalies) {
      bySeverity[anomaly.severity]++;
      byType[anomaly.type]++;

      if (anomaly.type === 'drift') {
        if (anomaly.currentValue === 0) {
          missingEvents++;
        } else if (anomaly.previousValue === 0) {
          newEvents++;
        }
      }

      if (anomaly.percentChange < 0) {
        percentDrop++;
      } else if (anomaly.percentChange > 0) {
        percentIncrease++;
      }
    }

    return {
      total: anomalies.length,
      bySeverity,
      byType,
      percentDrop,
      percentIncrease,
      missingEvents,
      newEvents,
    };
  }

  /**
   * Determine overall test status based on anomalies
   */
  public determineTestStatus(anomalies: Anomaly[]): 'success' | 'warning' | 'error' {
    const summary = this.getAnomalySummary(anomalies);

    // Critical: any high severity anomalies
    if (summary.bySeverity.high > 0) {
      return 'error';
    }

    // Warning: medium severity anomalies OR missing events
    if (summary.bySeverity.medium > 0 || summary.missingEvents > 0) {
      return 'warning';
    }

    // Success: no or only low severity anomalies
    return 'success';
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AnomalyDetectionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Anomaly detection config updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): AnomalyDetectionConfig {
    return { ...this.config };
  }
}

// Export class (not singleton, to allow multiple instances with different configs)
export default AnomalyDetectionService;
