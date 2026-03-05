import cron from 'node-cron';
import logger from '../utils/logger';
import storageService from './storage.service';
import GAMonitorTask from '../tasks/ga-monitor-task';
import { getNextRunDate, intervalToCron } from '../utils/date-utils';
import type { ScheduledTask, TestInterval } from '../../shared/types';

interface ScheduledJob {
  task: ScheduledTask;
  cronJob: cron.ScheduledTask;
}

export class SchedulerService {
  private jobs: Map<number, ScheduledJob> = new Map();
  private monitorTask: GAMonitorTask;

  constructor() {
    this.monitorTask = new GAMonitorTask();
    this.initialize();
  }

  /**
   * Initialize scheduler - load and start active tasks from database
   */
  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing scheduler service...');

      // Load active tasks from database
      const activeTasks = storageService.getActiveScheduledTasks();

      logger.info(`Found ${activeTasks.length} active scheduled tasks`);

      // Start all active tasks
      for (const task of activeTasks) {
        await this.startTask(task);
      }

      logger.info('Scheduler service initialized');
    } catch (error) {
      logger.error('Failed to initialize scheduler service:', error);
    }
  }

  /**
   * Create a new scheduled task
   */
  public async createScheduledTask(config: {
    propertyId: string;
    interval: TestInterval;
    time: string;
    taskType?: string;
    config?: Record<string, any>;
  }): Promise<ScheduledTask> {
    try {
      // Validate input
      if (!config.propertyId) {
        throw new Error('Property ID is required');
      }

      // Check if property exists
      const property = storageService.getProperty(config.propertyId);
      if (!property) {
        throw new Error(`Property ${config.propertyId} not found`);
      }

      // Generate cron expression
      const cronExpression = intervalToCron(config.interval, config.time);

      // Calculate next run date
      const nextRunDate = getNextRunDate(config.interval, config.time);

      // Create in database
      const task = storageService.createScheduledTask({
        propertyId: config.propertyId,
        taskType: config.taskType || 'monitoring',
        intervalType: config.interval,
        cronExpression,
        isActive: true,
        nextRunAt: nextRunDate,
        config: config.config,
      });

      logger.info(`Created scheduled task ${task.id} for property ${config.propertyId}`);

      // Start the task
      await this.startTask(task);

      return task;
    } catch (error) {
      logger.error('Failed to create scheduled task:', error);
      throw error;
    }
  }

  /**
   * Update a scheduled task
   */
  public async updateScheduledTask(
    taskId: number,
    updates: {
      interval?: TestInterval;
      time?: string;
      isActive?: boolean;
      config?: Record<string, any>;
    }
  ): Promise<ScheduledTask> {
    try {
      const task = storageService.getScheduledTask(taskId);
      if (!task) {
        throw new Error(`Scheduled task ${taskId} not found`);
      }

      // Stop existing job if active
      if (this.jobs.has(taskId)) {
        this.stopTask(taskId);
      }

      // Update values
      let cronExpression = task.cronExpression;
      let nextRunAt = task.nextRunAt;

      if (updates.interval || updates.time) {
        const interval = updates.interval || task.intervalType;
        const time = updates.time || '09:00';
        cronExpression = intervalToCron(interval, time);
        nextRunAt = getNextRunDate(interval, time);
      }

      // Update in database
      storageService.updateScheduledTask(taskId, {
        intervalType: updates.interval || task.intervalType,
        cronExpression,
        isActive: updates.isActive !== undefined ? updates.isActive : task.isActive,
        nextRunAt,
        config: updates.config || task.config,
      });

      // Reload from database
      const updatedTask = storageService.getScheduledTask(taskId)!;

      logger.info(`Updated scheduled task ${taskId}`);

      // Restart if active
      if (updatedTask.isActive) {
        await this.startTask(updatedTask);
      }

      return updatedTask;
    } catch (error) {
      logger.error('Failed to update scheduled task:', error);
      throw error;
    }
  }

  /**
   * Delete a scheduled task
   */
  public async deleteScheduledTask(taskId: number): Promise<void> {
    try {
      // Stop if running
      if (this.jobs.has(taskId)) {
        this.stopTask(taskId);
      }

      // Delete from database
      storageService.deleteScheduledTask(taskId);

      logger.info(`Deleted scheduled task ${taskId}`);
    } catch (error) {
      logger.error('Failed to delete scheduled task:', error);
      throw error;
    }
  }

  /**
   * Toggle task active/inactive
   */
  public async toggleTask(taskId: number): Promise<ScheduledTask> {
    try {
      const task = storageService.getScheduledTask(taskId);
      if (!task) {
        throw new Error(`Scheduled task ${taskId} not found`);
      }

      const newIsActive = !task.isActive;

      if (newIsActive) {
        // Start task
        await this.startTask(task);
        storageService.updateScheduledTask(taskId, { isActive: true });
      } else {
        // Stop task
        this.stopTask(taskId);
        storageService.updateScheduledTask(taskId, { isActive: false });
      }

      // Reload from database
      const updatedTask = storageService.getScheduledTask(taskId)!;
      logger.info(`Toggled task ${taskId} to ${newIsActive ? 'active' : 'inactive'}`);

      return updatedTask;
    } catch (error) {
      logger.error('Failed to toggle task:', error);
      throw error;
    }
  }

  /**
   * Start a scheduled task
   */
  private async startTask(task: ScheduledTask): Promise<void> {
    try {
      if (this.jobs.has(task.id)) {
        logger.warn(`Task ${task.id} is already running`);
        return;
      }

      // Validate cron expression
      if (!cron.validate(task.cronExpression)) {
        throw new Error(`Invalid cron expression: ${task.cronExpression}`);
      }

      // Create cron job
      const cronJob = cron.schedule(
        task.cronExpression,
        async () => {
          logger.info(`Executing scheduled task ${task.id} for property ${task.propertyId}`);

          try {
            // Update last run time
            storageService.updateScheduledTask(task.id, {
              lastRunAt: new Date(),
            });

            // Execute monitoring task
            await this.monitorTask.execute({
              propertyId: task.propertyId,
              interval: task.intervalType,
              ...task.config,
            });

            // Calculate next run time
            const nextRunDate = getNextRunDate(task.intervalType, '09:00');
            storageService.updateScheduledTask(task.id, {
              nextRunAt: nextRunDate,
            });

            logger.info(`Scheduled task ${task.id} completed successfully`);
          } catch (error) {
            logger.error(`Scheduled task ${task.id} failed:`, error);
          }
        },
        {
          scheduled: true,
          timezone: process.env.TZ || 'UTC',
        }
      );

      // Store job
      this.jobs.set(task.id, { task, cronJob });

      logger.info(`Started scheduled task ${task.id} with cron: ${task.cronExpression}`);
    } catch (error) {
      logger.error('Failed to start scheduled task:', error);
      throw error;
    }
  }

  /**
   * Stop a scheduled task
   */
  private stopTask(taskId: number): void {
    try {
      const job = this.jobs.get(taskId);
      if (!job) {
        logger.warn(`Task ${taskId} is not running`);
        return;
      }

      // Stop cron job
      job.cronJob.stop();
      this.jobs.delete(taskId);

      logger.info(`Stopped scheduled task ${taskId}`);
    } catch (error) {
      logger.error('Failed to stop scheduled task:', error);
    }
  }

  /**
   * Get all scheduled tasks
   */
  public getAllTasks(): ScheduledTask[] {
    try {
      return storageService.getScheduledTasks();
    } catch (error) {
      logger.error('Failed to get all scheduled tasks:', error);
      return [];
    }
  }

  /**
   * Get task by ID
   */
  public getTask(taskId: number): ScheduledTask | null {
    try {
      return storageService.getScheduledTask(taskId);
    } catch (error) {
      logger.error('Failed to get scheduled task:', error);
      return null;
    }
  }

  /**
   * Get tasks for a property
   */
  public getTasksForProperty(propertyId: string): ScheduledTask[] {
    try {
      const allTasks = storageService.getScheduledTasks();
      return allTasks.filter(t => t.propertyId === propertyId);
    } catch (error) {
      logger.error('Failed to get tasks for property:', error);
      return [];
    }
  }

  /**
   * Get active tasks
   */
  public getActiveTasks(): ScheduledTask[] {
    try {
      return storageService.getActiveScheduledTasks();
    } catch (error) {
      logger.error('Failed to get active tasks:', error);
      return [];
    }
  }

  /**
   * Get running jobs count
   */
  public getRunningJobsCount(): number {
    return this.jobs.size;
  }

  /**
   * Manually trigger a task execution
   */
  public async triggerTask(taskId: number): Promise<void> {
    try {
      const task = storageService.getScheduledTask(taskId);
      if (!task) {
        throw new Error(`Scheduled task ${taskId} not found`);
      }

      logger.info(`Manually triggering task ${taskId}`);

      // Update last run time
      storageService.updateScheduledTask(taskId, {
        lastRunAt: new Date(),
      });

      // Execute monitoring task
      await this.monitorTask.execute({
        propertyId: task.propertyId,
        interval: task.intervalType,
        ...task.config,
      });

      logger.info(`Manual trigger of task ${taskId} completed`);
    } catch (error) {
      logger.error('Failed to trigger task:', error);
      throw error;
    }
  }

  /**
   * Stop all scheduled tasks
   */
  public stopAll(): void {
    try {
      logger.info('Stopping all scheduled tasks...');

      for (const [taskId] of this.jobs) {
        this.stopTask(taskId);
      }

      logger.info('All scheduled tasks stopped');
    } catch (error) {
      logger.error('Failed to stop all tasks:', error);
    }
  }

  /**
   * Restart all active tasks from database
   */
  public async restartAll(): Promise<void> {
    try {
      logger.info('Restarting all scheduled tasks...');

      // Stop all running jobs
      this.stopAll();

      // Reload and start active tasks
      const activeTasks = storageService.getActiveScheduledTasks();

      for (const task of activeTasks) {
        await this.startTask(task);
      }

      logger.info('All scheduled tasks restarted');
    } catch (error) {
      logger.error('Failed to restart all tasks:', error);
    }
  }
}

// Export singleton instance
export default new SchedulerService();
