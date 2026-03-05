import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import storageService from './storage.service';
import { PATHS } from '../../shared/constants';
import type { ReportFormat, ReportData, TestResult, EventDetail, Anomaly, GA4Property } from '../../shared/types';

export class ReportService {
  constructor() {
    this.ensureReportsDirectory();
  }

  /**
   * Ensure reports directory exists
   */
  private ensureReportsDirectory(): void {
    const reportsDir = PATHS.REPORTS;
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
      logger.info(`Created reports directory: ${reportsDir}`);
    }
  }

  /**
   * Generate report data for a test result
   */
  public async generateReportData(testResultId: number): Promise<ReportData> {
    try {
      logger.info(`Generating report data for test result ${testResultId}`);

      // Get test result
      const testResult = storageService.getTestResult(testResultId);
      if (!testResult) {
        throw new Error(`Test result ${testResultId} not found`);
      }

      // Get property
      const property = storageService.getProperty(testResult.propertyId);
      if (!property) {
        throw new Error(`Property ${testResult.propertyId} not found`);
      }

      // Get event details
      const eventDetails = storageService.getEventDetailsForTest(testResultId);

      // Generate anomalies from event details
      const anomalies: Anomaly[] = [];
      for (const detail of eventDetails) {
        if (detail.isAnomaly) {
          anomalies.push({
            eventName: detail.eventName,
            type: detail.percentChange === -100 || detail.percentChange === 100 ? 'drift' : 'threshold',
            severity: Math.abs(detail.percentChange) >= 50 ? 'high' : Math.abs(detail.percentChange) >= 20 ? 'medium' : 'low',
            reason: detail.anomalyReason || `${detail.percentChange >= 0 ? 'Increase' : 'Decrease'} of ${Math.abs(detail.percentChange).toFixed(1)}%`,
            currentValue: detail.eventCount,
            previousValue: detail.comparisonCount,
            percentChange: detail.percentChange,
          });
        }
      }

      const reportData: ReportData = {
        testResult,
        eventDetails,
        anomalies,
        property,
        generatedAt: new Date(),
      };

      logger.info(`Report data generated for test result ${testResultId}`);
      return reportData;
    } catch (error) {
      logger.error('Failed to generate report data:', error);
      throw error;
    }
  }

  /**
   * Export report as PDF
   */
  public async exportToPDF(reportData: ReportData, outputPath?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const filename = outputPath || this.generateFilename('pdf', reportData);
        const filePath = path.join(PATHS.REPORTS, filename);

        logger.info(`Generating PDF report: ${filePath}`);

        // Create PDF document
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        // Pipe to file
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Add content
        this.addPDFContent(doc, reportData);

        // Finalize
        doc.end();

        stream.on('finish', () => {
          logger.info(`PDF report generated: ${filePath}`);
          resolve(filePath);
        });

        stream.on('error', (error) => {
          logger.error('Failed to write PDF:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to generate PDF report:', error);
        reject(error);
      }
    });
  }

  /**
   * Add content to PDF document
   */
  private addPDFContent(doc: PDFKit.PDFDocument, reportData: ReportData): void {
    const { testResult, property, anomalies, eventDetails } = reportData;

    // Title
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text('GA4 Monitoring Report', { align: 'center' });

    doc.moveDown();

    // Property info
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text(`Property: ${property.displayName}`);

    doc.fontSize(10)
       .font('Helvetica')
       .text(`Property ID: ${property.propertyId}`)
       .text(`Test Type: ${testResult.testType}`)
       .text(`Period: ${this.formatDate(testResult.startDate)} - ${this.formatDate(testResult.endDate)}`)
       .text(`Comparison: ${this.formatDate(testResult.comparisonStartDate)} - ${this.formatDate(testResult.comparisonEndDate)}`)
       .text(`Generated: ${this.formatDateTime(reportData.generatedAt)}`);

    doc.moveDown();

    // Summary statistics
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Summary');

    doc.fontSize(10)
       .font('Helvetica')
       .text(`Total Events: ${testResult.totalEvents.toLocaleString()}`)
       .text(`Previous Events: ${testResult.comparisonTotalEvents.toLocaleString()}`)
       .text(`Change: ${testResult.percentChange >= 0 ? '+' : ''}${testResult.percentChange.toFixed(2)}%`)
       .text(`Anomalies: ${anomalies.length}`)
       .text(`Status: ${testResult.status.toUpperCase()}`);

    doc.moveDown();

    // Anomalies section
    if (anomalies.length > 0) {
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Anomalies Detected');

      doc.fontSize(10)
         .font('Helvetica');

      for (const anomaly of anomalies.slice(0, 20)) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold')
           .text(anomaly.eventName);
        doc.font('Helvetica')
           .text(`  ${anomaly.reason}`)
           .text(`  ${anomaly.previousValue.toLocaleString()} → ${anomaly.currentValue.toLocaleString()} (${anomaly.percentChange >= 0 ? '+' : ''}${anomaly.percentChange.toFixed(1)}%)`)
           .text(`  Severity: ${anomaly.severity.toUpperCase()}`);
      }

      if (anomalies.length > 20) {
        doc.text(`... and ${anomalies.length - 20} more anomalies`);
      }

      doc.moveDown();
    }

    // Top events table
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Top Events');

    doc.fontSize(8);

    const tableTop = doc.y;
    const rowHeight = 20;
    const colWidths = { event: 150, current: 80, previous: 80, change: 80 };

    // Header
    doc.font('Helvetica-Bold');
    doc.text('Event Name', 50, tableTop, { width: colWidths.event });
    doc.text('Current', 50 + colWidths.event, tableTop, { width: colWidths.current });
    doc.text('Previous', 50 + colWidths.event + colWidths.current, tableTop, { width: colWidths.previous });
    doc.text('Change %', 50 + colWidths.event + colWidths.current + colWidths.previous, tableTop, { width: colWidths.change });

    // Rows
    doc.font('Helvetica');
    let y = tableTop + rowHeight;

    for (const detail of eventDetails.slice(0, 30)) {
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = 50;
      }

      doc.text(detail.eventName, 50, y, { width: colWidths.event, ellipsis: true });
      doc.text(detail.eventCount.toLocaleString(), 50 + colWidths.event, y, { width: colWidths.current });
      doc.text(detail.comparisonCount.toLocaleString(), 50 + colWidths.event + colWidths.current, y, { width: colWidths.previous });

      const changeText = `${detail.percentChange >= 0 ? '+' : ''}${detail.percentChange.toFixed(1)}%`;
      doc.text(changeText, 50 + colWidths.event + colWidths.current + colWidths.previous, y, { width: colWidths.change });

      if (detail.isAnomaly) {
        doc.rect(45, y - 2, doc.page.width - 100, rowHeight - 4)
           .fillOpacity(0.1)
           .fill('red');
      }

      y += rowHeight;
    }
  }

  /**
   * Export report as Excel
   */
  public async exportToExcel(reportData: ReportData, outputPath?: string): Promise<string> {
    try {
      const filename = outputPath || this.generateFilename('xlsx', reportData);
      const filePath = path.join(PATHS.REPORTS, filename);

      logger.info(`Generating Excel report: ${filePath}`);

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'GA4 Monitor';
      workbook.created = new Date();

      // Add Summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      this.addSummarySheet(summarySheet, reportData);

      // Add Events sheet
      const eventsSheet = workbook.addWorksheet('Events');
      this.addEventsSheet(eventsSheet, reportData);

      // Add Anomalies sheet
      const anomaliesSheet = workbook.addWorksheet('Anomalies');
      this.addAnomaliesSheet(anomaliesSheet, reportData);

      // Write file
      await workbook.xlsx.writeFile(filePath);

      logger.info(`Excel report generated: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Failed to generate Excel report:', error);
      throw error;
    }
  }

  /**
   * Add summary sheet to Excel workbook
   */
  private addSummarySheet(sheet: ExcelJS.Worksheet, reportData: ReportData): void {
    const { testResult, property, anomalies } = reportData;

    // Title
    sheet.mergeCells('A1:B1');
    sheet.getCell('A1').value = 'GA4 Monitoring Report';
    sheet.getCell('A1').font = { size: 16, bold: true };

    // Property info
    let row = 3;
    sheet.getCell(`A${row}`).value = 'Property';
    sheet.getCell(`B${row}`).value = property.displayName;
    row++;

    sheet.getCell(`A${row}`).value = 'Property ID';
    sheet.getCell(`B${row}`).value = property.propertyId;
    row++;

    sheet.getCell(`A${row}`).value = 'Test Type';
    sheet.getCell(`B${row}`).value = testResult.testType;
    row++;

    sheet.getCell(`A${row}`).value = 'Period';
    sheet.getCell(`B${row}`).value = `${this.formatDate(testResult.startDate)} - ${this.formatDate(testResult.endDate)}`;
    row++;

    sheet.getCell(`A${row}`).value = 'Comparison Period';
    sheet.getCell(`B${row}`).value = `${this.formatDate(testResult.comparisonStartDate)} - ${this.formatDate(testResult.comparisonEndDate)}`;
    row++;

    sheet.getCell(`A${row}`).value = 'Generated';
    sheet.getCell(`B${row}`).value = this.formatDateTime(reportData.generatedAt);
    row++;

    // Statistics
    row++;
    sheet.getCell(`A${row}`).value = 'Total Events';
    sheet.getCell(`B${row}`).value = testResult.totalEvents;
    sheet.getCell(`B${row}`).numFmt = '#,##0';
    row++;

    sheet.getCell(`A${row}`).value = 'Previous Events';
    sheet.getCell(`B${row}`).value = testResult.comparisonTotalEvents;
    sheet.getCell(`B${row}`).numFmt = '#,##0';
    row++;

    sheet.getCell(`A${row}`).value = 'Change %';
    sheet.getCell(`B${row}`).value = testResult.percentChange / 100;
    sheet.getCell(`B${row}`).numFmt = '0.00%';
    row++;

    sheet.getCell(`A${row}`).value = 'Anomalies';
    sheet.getCell(`B${row}`).value = anomalies.length;
    row++;

    sheet.getCell(`A${row}`).value = 'Status';
    sheet.getCell(`B${row}`).value = testResult.status.toUpperCase();

    // Column widths
    sheet.getColumn('A').width = 25;
    sheet.getColumn('B').width = 40;
  }

  /**
   * Add events sheet to Excel workbook
   */
  private addEventsSheet(sheet: ExcelJS.Worksheet, reportData: ReportData): void {
    const { eventDetails } = reportData;

    // Headers
    sheet.columns = [
      { header: 'Event Name', key: 'eventName', width: 40 },
      { header: 'Current Count', key: 'currentCount', width: 15 },
      { header: 'Previous Count', key: 'previousCount', width: 15 },
      { header: 'Change %', key: 'change', width: 12 },
      { header: 'Anomaly', key: 'isAnomaly', width: 10 },
    ];

    // Header style
    sheet.getRow(1).font = { bold: true };

    // Data
    eventDetails.forEach(detail => {
      sheet.addRow({
        eventName: detail.eventName,
        currentCount: detail.eventCount,
        previousCount: detail.comparisonCount,
        change: detail.percentChange / 100,
        isAnomaly: detail.isAnomaly ? 'Yes' : 'No',
      });
    });

    // Format columns
    sheet.getColumn('C').numFmt = '#,##0';
    sheet.getColumn('D').numFmt = '#,##0';
    sheet.getColumn('E').numFmt = '0.00%';
  }

  /**
   * Add anomalies sheet to Excel workbook
   */
  private addAnomaliesSheet(sheet: ExcelJS.Worksheet, reportData: ReportData): void {
    const { anomalies } = reportData;

    if (anomalies.length === 0) {
      sheet.getCell('A1').value = 'No anomalies detected';
      return;
    }

    // Headers
    sheet.columns = [
      { header: 'Event Name', key: 'eventName', width: 40 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Current', key: 'currentValue', width: 15 },
      { header: 'Previous', key: 'previousValue', width: 15 },
      { header: 'Change %', key: 'percentChange', width: 12 },
      { header: 'Reason', key: 'reason', width: 50 },
    ];

    // Header style
    sheet.getRow(1).font = { bold: true };

    // Data
    anomalies.forEach(anomaly => {
      sheet.addRow({
        eventName: anomaly.eventName,
        type: anomaly.type,
        severity: anomaly.severity,
        currentValue: anomaly.currentValue,
        previousValue: anomaly.previousValue,
        percentChange: anomaly.percentChange / 100,
        reason: anomaly.reason,
      });
    });

    // Format columns
    sheet.getColumn('E').numFmt = '#,##0';
    sheet.getColumn('F').numFmt = '#,##0';
    sheet.getColumn('G').numFmt = '0.00%';
  }

  /**
   * Export report as JSON
   */
  public async exportToJSON(reportData: ReportData, outputPath?: string): Promise<string> {
    try {
      const filename = outputPath || this.generateFilename('json', reportData);
      const filePath = path.join(PATHS.REPORTS, filename);

      logger.info(`Generating JSON report: ${filePath}`);

      const json = JSON.stringify(reportData, null, 2);
      fs.writeFileSync(filePath, json, 'utf-8');

      logger.info(`JSON report generated: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Failed to generate JSON report:', error);
      throw error;
    }
  }

  /**
   * Generate filename for report
   */
  private generateFilename(format: 'pdf' | 'xlsx' | 'json', reportData: ReportData): string {
    const { testResult, property } = reportData;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const safePropertyName = property.displayName.replace(/[^a-z0-9]/gi, '_');
    return `${safePropertyName}_${testResult.testType}_${timestamp}.${format}`;
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('de-DE');
  }

  /**
   * Format date and time for display
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('de-DE');
  }

  /**
   * Delete old reports
   */
  public async cleanupOldReports(daysToKeep: number = 90): Promise<number> {
    try {
      const reportsDir = PATHS.REPORTS;
      const files = fs.readdirSync(reportsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(reportsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.info(`Deleted old report: ${file}`);
        }
      }

      logger.info(`Cleaned up ${deletedCount} old reports (older than ${daysToKeep} days)`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old reports:', error);
      return 0;
    }
  }

  /**
   * Get report file size
   */
  public getReportSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      logger.error('Failed to get report size:', error);
      return 0;
    }
  }

  /**
   * Format file size for display
   */
  public formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Export singleton instance
export default new ReportService();
