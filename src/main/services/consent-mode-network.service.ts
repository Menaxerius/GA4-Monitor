import { session, BrowserWindow, WebRequest } from 'electron';
import logger from '../utils/logger';

export interface GA4Hit {
  url: string;
  method: string;
  params: Record<string, string>;
  eventName?: string;
  measurementId?: string;
  gcs?: string;
  gcd?: string;
  npa?: string;
  dma?: string;
  timestamp: number;
}

export interface ConsentState {
  ad_storage: 'granted' | 'denied' | 'unknown';
  analytics_storage: 'granted' | 'denied' | 'unknown';
  ad_user_data: 'granted' | 'denied' | 'unknown';
  ad_personalization: 'granted' | 'denied' | 'unknown';
}

export interface ConsentModeResult {
  url: string;
  measurement_id?: string;
  consent: {
    mode: 'consent_mode_v2' | 'consent_mode_v1' | 'no_consent_mode' | 'unknown';
    ad_storage: 'granted' | 'denied' | 'unknown';
    analytics_storage: 'granted' | 'denied' | 'unknown';
    ad_user_data: 'granted' | 'denied' | 'unknown';
    ad_personalization: 'granted' | 'denied' | 'unknown';
    confidence: number;
    reasons: string[];
  };
  evidence: {
    gcs?: string;
    gcd?: string;
    npa?: string;
    dma?: string;
    matched_request?: string;
    event_name?: string;
    ads_data_redaction?: string;
    anonymizeip?: string;
  };
  hits_seen: number;
  debug_log?: string[];
}

export class ConsentModeNetworkService {
  private static instance: ConsentModeNetworkService;
  private debugMode: boolean = true;

  private constructor() {}

  public static getInstance(): ConsentModeNetworkService {
    if (!ConsentModeNetworkService.instance) {
      ConsentModeNetworkService.instance = new ConsentModeNetworkService();
    }
    return ConsentModeNetworkService.instance;
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private log(message: string, ...args: any[]): void {
    if (this.debugMode) {
      logger.info(`[ConsentModeNetwork] ${message}`, ...args);
    }
  }

  public async detectConsentMode(url: string, timeout: number = 15000): Promise<ConsentModeResult> {
    this.log(`Starting consent mode detection for: ${url}`);
    
    const debugLog: string[] = [];
    const ga4Hits: GA4Hit[] = [];
    
    const partitionName = `consent-check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let ses: Electron.Session | null = null;
    let webRequest: WebRequest | null = null;

    try {
      ses = session.fromPartition(partitionName);
      webRequest = ses.webRequest;
      
      await new Promise<void>((resolveSetup) => {
        webRequest!.onBeforeRequest(
          { urls: ['*://*.google-analytics.com/*', '*://*.googletagmanager.com/*'] },
          (details, callback) => {
            const requestUrl = details.url;
            
            if (requestUrl.includes('/g/collect') || requestUrl.includes('/collect')) {
              this.log(`GA4 hit detected: ${requestUrl.substring(0, 200)}`);
              debugLog.push(`Hit: ${requestUrl.substring(0, 150)}`);
              
              const hit = this.parseGA4Hit(details);
              if (hit) {
                ga4Hits.push(hit);
                this.log(`Parsed hit - gcs: ${hit.gcs}, gcd: ${hit.gcd}, tid: ${hit.measurementId}`);
                debugLog.push(`gcs=${hit.gcs}, gcd=${hit.gcd?.substring(0, 20)}, tid=${hit.measurementId}`);
              }
            }
            
            callback({});
          }
        );
        resolveSetup();
      });

      const loadResult = await this.loadPageInIsolatedSession(url, ses, timeout, debugLog);
      
      if (!loadResult.success) {
        debugLog.push(`Page load issue: ${loadResult.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error: any) {
      this.log(`Error during detection: ${error.message}`);
      debugLog.push(`Error: ${error.message}`);
    } finally {
      if (webRequest) {
        try {
          webRequest.onBeforeRequest(null as any, () => {});
        } catch (e) {}
      }
      if (ses) {
        try {
          await ses.clearStorageData();
          await ses.clearCache();
        } catch (e) {}
      }
    }

    const bestHit = this.selectBestHit(ga4Hits, debugLog);
    const result = this.inferConsentFromHit(bestHit, url, ga4Hits.length, debugLog);
    result.debug_log = debugLog;

    this.log(`Detection complete: mode=${result.consent.mode}, confidence=${result.consent.confidence}, hits=${result.hits_seen}`);
    
    return result;
  }

  private parseGA4Hit(details: Electron.OnBeforeRequestListenerDetails): GA4Hit | null {
    try {
      const url = new URL(details.url);
      const params: Record<string, string> = {};
      
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });

      if (details.method === 'POST' && details.uploadData && details.uploadData.length > 0) {
        const uploadData = details.uploadData[0];
        let bodyStr = '';
        
        if (uploadData.bytes) {
          bodyStr = uploadData.bytes.toString('utf8');
        } else if ((uploadData as any).string) {
          bodyStr = (uploadData as any).string;
        }
        
        if (bodyStr) {
          bodyStr.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value !== undefined) {
              try {
                params[key] = decodeURIComponent(value);
              } catch {
                params[key] = value;
              }
            }
          });
        }
      }

      return {
        url: details.url,
        method: details.method,
        params,
        eventName: params.en,
        measurementId: params.tid,
        gcs: params.gcs,
        gcd: params.gcd,
        npa: params.npa,
        dma: params.dma,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      this.log(`Failed to parse GA4 hit: ${error.message}`);
      return null;
    }
  }

  private selectBestHit(hits: GA4Hit[], debugLog: string[]): GA4Hit | null {
    if (hits.length === 0) {
      debugLog.push('No GA4 hits captured');
      return null;
    }

    debugLog.push(`Total hits captured: ${hits.length}`);

    const hitsWithGcs = hits.filter(h => h.gcs);
    if (hitsWithGcs.length > 0) {
      debugLog.push(`Hits with gcs: ${hitsWithGcs.length}`);
    }

    const pageViewHits = hits.filter(h => h.eventName === 'page_view');
    if (pageViewHits.length > 0) {
      debugLog.push(`Page view hits: ${pageViewHits.length}`);
    }

    let bestHit: GA4Hit | null = null;

    const gcsPageView = hits.find(h => h.gcs && h.eventName === 'page_view');
    if (gcsPageView) {
      bestHit = gcsPageView;
      debugLog.push('Selected: hit with gcs and page_view');
    }

    if (!bestHit) {
      const gcsHit = hits.find(h => h.gcs);
      if (gcsHit) {
        bestHit = gcsHit;
        debugLog.push('Selected: first hit with gcs');
      }
    }

    if (!bestHit) {
      const pageView = hits.find(h => h.eventName === 'page_view');
      if (pageView) {
        bestHit = pageView;
        debugLog.push('Selected: first page_view hit');
      }
    }

    if (!bestHit) {
      bestHit = hits[0];
      debugLog.push('Selected: first hit (fallback)');
    }

    return bestHit;
  }

  private inferConsentFromHit(
    hit: GA4Hit | null,
    url: string,
    hitsSeen: number,
    debugLog: string[]
  ): ConsentModeResult {
    const unknownResult = (): ConsentModeResult => ({
      url,
      measurement_id: hit?.measurementId,
      consent: {
        mode: 'unknown',
        ad_storage: 'unknown',
        analytics_storage: 'unknown',
        ad_user_data: 'unknown',
        ad_personalization: 'unknown',
        confidence: 0,
        reasons: ['No GA4 requests captured - cannot determine consent state'],
      },
      evidence: {},
      hits_seen: hitsSeen,
    });

    if (!hit) {
      return unknownResult();
    }

    const reasons: string[] = [];
    let confidence = 0;
    let consentState: ConsentState = {
      ad_storage: 'unknown',
      analytics_storage: 'unknown',
      ad_user_data: 'unknown',
      ad_personalization: 'unknown',
    };

    if (hit.gcs) {
      debugLog.push(`Parsing gcs: ${hit.gcs}`);
      consentState = this.parseGcs(hit.gcs, debugLog);
      confidence = 0.95;
      reasons.push(`Consent state from gcs parameter (${hit.gcs})`);
    }

    if (!hit.gcs && hit.gcd) {
      debugLog.push(`No gcs, parsing gcd: ${hit.gcd.substring(0, 30)}...`);
      const gcdResult = this.parseGcd(hit.gcd, debugLog);
      consentState = gcdResult.state;
      confidence = gcdResult.confidence;
      reasons.push(`Consent state inferred from gcd parameter`);
    }

    if (hit.npa === '1') {
      reasons.push('npa=1 indicates non-personalized ads mode');
    }

    if (hit.params['ep.ads_data_redaction'] === '1') {
      reasons.push('ads_data_redaction=1 confirms consent mode active');
    }

    if (hit.params['ep.anonymizeip'] === 'true') {
      reasons.push('anonymizeip=true - IP anonymization enabled');
    }

    let mode: ConsentModeResult['consent']['mode'] = 'unknown';
    
    if (hit.gcs || hit.gcd) {
      const hasV2Signals = 
        consentState.ad_user_data !== 'unknown' || 
        consentState.ad_personalization !== 'unknown' ||
        hit.params['ep.ads_data_redaction'] !== undefined;
      
      if (hasV2Signals) {
        mode = 'consent_mode_v2';
      } else {
        const allDenied = Object.values(consentState).every(v => v === 'denied');
        const allGranted = Object.values(consentState).every(v => v === 'granted');
        const allUnknown = Object.values(consentState).every(v => v === 'unknown');
        
        if (allUnknown) {
          mode = 'unknown';
        } else if (allDenied) {
          mode = 'consent_mode_v2';
        } else if (allGranted) {
          mode = 'consent_mode_v1';
        } else {
          mode = 'consent_mode_v2';
        }
      }
    } else {
      if (hitsSeen > 0) {
        mode = 'no_consent_mode';
        confidence = 0.7;
        reasons.push('GA4 requests without gcs/gcd - no consent mode detected');
      }
    }

    if (mode === 'no_consent_mode') {
      confidence = 0.7;
    }

    return {
      url,
      measurement_id: hit.measurementId,
      consent: {
        mode,
        ...consentState,
        confidence: Math.round(confidence * 100) / 100,
        reasons,
      },
      evidence: {
        gcs: hit.gcs,
        gcd: hit.gcd,
        npa: hit.npa,
        dma: hit.dma,
        matched_request: hit.url.substring(0, 300),
        event_name: hit.eventName,
        ads_data_redaction: hit.params['ep.ads_data_redaction'],
        anonymizeip: hit.params['ep.anonymizeip'],
      },
      hits_seen: hitsSeen,
    };
  }

  private parseGcs(gcs: string, debugLog: string[]): ConsentState {
    if (!gcs || gcs.length < 2) {
      debugLog.push('gcs too short or missing');
      return {
        ad_storage: 'unknown',
        analytics_storage: 'unknown',
        ad_user_data: 'unknown',
        ad_personalization: 'unknown',
      };
    }

    const digits = gcs.replace('G', '');
    debugLog.push(`gcs digits: ${digits}`);

    const parseDigit = (char: string | undefined): 'granted' | 'denied' | 'unknown' => {
      if (!char) return 'unknown';
      if (char === '1') return 'granted';
      if (char === '0') return 'denied';
      return 'unknown';
    };

    const state: ConsentState = {
      ad_storage: parseDigit(digits[0]),
      analytics_storage: parseDigit(digits[1]),
      ad_user_data: parseDigit(digits[2]),
      ad_personalization: parseDigit(digits[3]),
    };

    debugLog.push(`gcs parsed: ad_storage=${state.ad_storage}, analytics=${state.analytics_storage}, ad_user_data=${state.ad_user_data}, ad_personalization=${state.ad_personalization}`);

    return state;
  }

  private parseGcd(gcd: string, debugLog: string[]): { state: ConsentState; confidence: number } {
    if (!gcd) {
      return {
        state: {
          ad_storage: 'unknown',
          analytics_storage: 'unknown',
          ad_user_data: 'unknown',
          ad_personalization: 'unknown',
        },
        confidence: 0,
      };
    }

    const lCount = (gcd.match(/l/gi) || []).length;
    const rCount = (gcd.match(/r/gi) || []).length;
    const total = gcd.length;

    debugLog.push(`gcd analysis: l=${lCount}, r=${rCount}, total=${total}`);

    if (total === 0) {
      return {
        state: {
          ad_storage: 'unknown',
          analytics_storage: 'unknown',
          ad_user_data: 'unknown',
          ad_personalization: 'unknown',
        },
        confidence: 0,
      };
    }

    const lRatio = lCount / total;
    const rRatio = rCount / total;

    debugLog.push(`gcd ratios: l-ratio=${lRatio.toFixed(2)}, r-ratio=${rRatio.toFixed(2)}`);

    if (lRatio > 0.45 && lRatio >= rRatio) {
      debugLog.push('gcd inference: all denied (l dominant)');
      return {
        state: {
          ad_storage: 'denied',
          analytics_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        },
        confidence: 0.75,
      };
    }

    if (rRatio > 0.45) {
      debugLog.push('gcd inference: all granted (r dominant)');
      return {
        state: {
          ad_storage: 'granted',
          analytics_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted',
        },
        confidence: 0.65,
      };
    }

    debugLog.push('gcd inference: unknown (no clear pattern)');
    return {
      state: {
        ad_storage: 'unknown',
        analytics_storage: 'unknown',
        ad_user_data: 'unknown',
        ad_personalization: 'unknown',
      },
      confidence: 0.4,
    };
  }

  private async loadPageInIsolatedSession(
    url: string,
    session: Electron.Session,
    timeout: number,
    debugLog: string[]
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      let win: BrowserWindow | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (win && !win.isDestroyed()) {
          win.close();
        }
      };

      const settle = (success: boolean, error?: string) => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ success, error });
        }
      };

      timeoutId = setTimeout(() => {
        debugLog.push('Page load timeout');
        settle(true, 'timeout');
      }, timeout);

      try {
        win = new BrowserWindow({
          width: 1280,
          height: 800,
          show: false,
          webPreferences: {
            session: session,
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            javascript: true,
            images: true,
          },
        });

        win.webContents.on('did-finish-load', () => {
          debugLog.push('Page finished loading');
          setTimeout(() => settle(true), 1000);
        });

        win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
          debugLog.push(`Page load failed: ${errorDescription}`);
          settle(false, errorDescription);
        });

        win.loadURL(url).catch((err) => {
          debugLog.push(`loadURL error: ${err.message}`);
          settle(false, err.message);
        });

      } catch (error: any) {
        debugLog.push(`Window creation error: ${error.message}`);
        settle(false, error.message);
      }
    });
  }
}

export default ConsentModeNetworkService.getInstance();
