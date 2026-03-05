import { contextBridge, ipcRenderer } from 'electron';

// Define IPC channels inline to avoid import issues
const IPC_CHANNELS = {
  AUTH_GET_STATE: 'auth:get-state',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  PROPERTIES_LIST: 'properties:list',
  PROPERTIES_GET: 'properties:get',
  PROPERTIES_SET_FAVORITE: 'properties:set-favorite',
  TESTS_RUN: 'tests:run',
  TESTS_GET_RESULTS: 'tests:get-results',
  TESTS_GET_RESULT: 'tests:get-result',
  TESTS_GET_HISTORY: 'tests:get-history',
  TESTS_GET_EVENT_DETAILS: 'tests:get-event-details',
  SCHEDULER_LIST: 'scheduler:list',
  SCHEDULER_CREATE: 'scheduler:create',
  SCHEDULER_UPDATE: 'scheduler:update',
  SCHEDULER_DELETE: 'scheduler:delete',
  SCHEDULER_TOGGLE: 'scheduler:toggle',
  REPORTS_GENERATE: 'reports:generate',
  REPORTS_EXPORT: 'reports:export',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_RESET: 'config:reset',
};

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ============================================
  // Authentication
  // ============================================
  auth: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_STATE),
    login: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  },

  // ============================================
  // Accounts
  // ============================================
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    switch: (email: string) => ipcRenderer.invoke('accounts:switch', email),
    remove: (email: string) => ipcRenderer.invoke('accounts:remove', email),
  },

  // ============================================
  // Properties
  // ============================================
  properties: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_LIST),
    get: (propertyId: string) => ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_GET, propertyId),
    setFavorite: (propertyId: string, isFavorite: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_SET_FAVORITE, propertyId, isFavorite),
    updateWebsiteUrl: (propertyId: string, websiteUrl: string) =>
      ipcRenderer.invoke('properties:update-website-url', propertyId, websiteUrl),
    checkCookieBanner: (propertyId: string, websiteUrl: string) =>
      ipcRenderer.invoke('properties:check-cookie-banner', propertyId, websiteUrl),
  },

  // ============================================
  // Tests
  // ============================================
  tests: {
    run: (config: { propertyId: string; interval: string; customDate?: Date }) =>
      ipcRenderer.invoke(IPC_CHANNELS.TESTS_RUN, config),
    getResults: (propertyId: string, limit?: number, offset?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.TESTS_GET_RESULTS, propertyId, limit, offset),
    getResult: (resultId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.TESTS_GET_RESULT, resultId),
    getHistory: (limit?: number, propertyId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TESTS_GET_HISTORY, limit, propertyId),
    getEventDetails: (testResultId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.TESTS_GET_EVENT_DETAILS, testResultId),
  },

  // ============================================
  // Events
  // ============================================
  events: {
    getDetailed: (propertyId: string, startDate: string, endDate: string, previousStartDate: string, previousEndDate: string) =>
      ipcRenderer.invoke('events:get-detailed', propertyId, startDate, endDate, previousStartDate, previousEndDate),
    getConversionEvents: (propertyId: string) =>
      ipcRenderer.invoke('events:get-conversion-events', propertyId),
  },

  // ============================================
  // Scheduler
  // ============================================
  scheduler: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_LIST),
    create: (config: any) => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_CREATE, config),
    update: (taskId: number, updates: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_UPDATE, taskId, updates),
    delete: (taskId: number) => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_DELETE, taskId),
    toggle: (taskId: number) => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_TOGGLE, taskId),
  },

  // ============================================
  // Reports
  // ============================================
  reports: {
    generate: (testResultId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GENERATE, testResultId),
    export: (testResultId: number, format: 'pdf' | 'excel' | 'json') =>
      ipcRenderer.invoke(IPC_CHANNELS.REPORTS_EXPORT, testResultId, format),
  },

  // ============================================
  // Configuration
  // ============================================
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
    set: (config: any) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, config),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_RESET),
  },
});

/**
 * Type definitions for the exposed API
 */
declare global {
  interface Window {
    electronAPI: {
      auth: {
        getState: () => Promise<any>;
        login: () => Promise<any>;
        logout: () => Promise<any>;
      };
      accounts: {
        list: () => Promise<any>;
        switch: (email: string) => Promise<any>;
        remove: (email: string) => Promise<any>;
      };
      properties: {
        list: () => Promise<any>;
        get: (propertyId: string) => Promise<any>;
        setFavorite: (propertyId: string, isFavorite: boolean) => Promise<any>;
        updateWebsiteUrl: (propertyId: string, websiteUrl: string) => Promise<any>;
        checkCookieBanner: (propertyId: string, websiteUrl: string) => Promise<any>;
      };
      tests: {
        run: (config: { propertyId: string; interval: string; customDate?: Date }) => Promise<any>;
        getResults: (propertyId: string, limit?: number, offset?: number) => Promise<any>;
        getResult: (resultId: number) => Promise<any>;
        getHistory: (limit?: number, propertyId?: string) => Promise<any>;
        getEventDetails: (testResultId: number) => Promise<any>;
      };
      events: {
        getDetailed: (propertyId: string, startDate: string, endDate: string, previousStartDate: string, previousEndDate: string) => Promise<any>;
        getConversionEvents: (propertyId: string) => Promise<string[]>;
      };
      scheduler: {
        list: () => Promise<any>;
        create: (config: any) => Promise<any>;
        update: (taskId: number, updates: any) => Promise<any>;
        delete: (taskId: number) => Promise<any>;
        toggle: (taskId: number) => Promise<any>;
      };
      reports: {
        generate: (testResultId: number) => Promise<any>;
        export: (testResultId: number, format: 'pdf' | 'excel' | 'json') => Promise<any>;
      };
      config: {
        get: () => Promise<any>;
        set: (config: any) => Promise<any>;
        reset: () => Promise<any>;
      };
    };
  }
}

export {};
