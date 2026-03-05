import { net } from 'electron';
import { URL } from 'url';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';
import consentModeNetworkService, { ConsentModeResult } from './consent-mode-network.service';

export interface CookieBannerResult {
  hasCookieBanner: boolean;
  bannerType?: 'popup' | 'banner' | 'sticky' | 'inline' | 'unknown';
  detectedElements: string[];
  confidence: 'high' | 'medium' | 'low';
  checkedAt: Date;
  bannerCode?: string;
  gtmDetected: boolean;
  gtmContainerId?: string;
  gtmCode?: string;
  gaDetected: boolean;
  gaMeasurementId?: string;
  gaCode?: string;
  gtmGaLoadingBehavior?: 'blocked' | 'loaded_without_consent' | 'loaded_with_consent_mode' | 'unknown';
  consentModeDetected: boolean;
  consentModeVersion?: 'v1' | 'v2' | 'unknown';
  consentModeConfig?: {
    hasDefaultConsent: boolean;
    hasUpdateConsent: boolean;
    hasWaitForUpdate: boolean;
    detectedRegions: string[];
  };
  consentModeCode?: string;
  consentSetupStatus?: 'correct' | 'missing_default' | 'missing_update' | 'not_configured' | 'incomplete' | 'cannot_verify';
  consentIssues?: string[];
  networkConsent?: {
    mode: 'consent_mode_v2' | 'consent_mode_v1' | 'no_consent_mode' | 'unknown';
    ad_storage: 'granted' | 'denied' | 'unknown';
    analytics_storage: 'granted' | 'denied' | 'unknown';
    ad_user_data: 'granted' | 'denied' | 'unknown';
    ad_personalization: 'granted' | 'denied' | 'unknown';
    confidence: number;
    reasons: string[];
    evidence: {
      gcs?: string;
      gcd?: string;
      npa?: string;
      dma?: string;
      matched_request?: string;
      event_name?: string;
    };
    hits_seen: number;
    measurement_id?: string;
  };
}

export interface DetectionStrategy {
  name: string;
  matched: boolean;
  selector?: string;
  details?: string;
}

export class CookieBannerService {
  private static instance: CookieBannerService;

  // High-confidence: specific vendor banner selectors (exact IDs/classes)
  private readonly VENDOR_SELECTORS = [
    // OneTrust
    { selector: '#onetrust-banner-sdk', vendor: 'OneTrust' },
    { selector: '#onetrust-consent-sdk', vendor: 'OneTrust' },
    // Cookiebot
    { selector: '#CybotCookiebotDialog', vendor: 'Cookiebot' },
    { selector: '.cookiebot', vendor: 'Cookiebot' },
    // Usercentrics
    { selector: '#usercentrics-root', vendor: 'Usercentrics' },
    { selector: '[data-usercentrics]', vendor: 'Usercentrics' },
    // TrustArc
    { selector: '.trustarc-banner', vendor: 'TrustArc' },
    { selector: '#truste-consent-track', vendor: 'TrustArc' },
    // Quantcast
    { selector: '.qc-cmp2-container', vendor: 'Quantcast' },
    { selector: '.quantcast-mmp-consent', vendor: 'Quantcast' },
    // Didomi
    { selector: '#didomi-host', vendor: 'Didomi' },
    { selector: '#didomi-popup', vendor: 'Didomi' },
    // Borlabs Cookie (WP)
    { selector: '#BorlabsCookieBox', vendor: 'Borlabs Cookie' },
    // Complianz (WP)
    { selector: '.cmplz-cookiebanner', vendor: 'Complianz' },
    // CookieYes
    { selector: '.cky-consent-container', vendor: 'CookieYes' },
    // Klaro
    { selector: '.klaro', vendor: 'Klaro' },
    // Real Cookie Banner (WP)
    { selector: '.rcb-banner', vendor: 'Real Cookie Banner' },
    // CCM19
    { selector: '#ccm-widget', vendor: 'CCM19' },
  ];

  // Medium-confidence: generic cookie banner patterns (specific class names)
  private readonly GENERIC_BANNER_SELECTORS = [
    '.cookie-banner',
    '.cookie-consent',
    '.cookie-notice',
    '.cookie-dialog',
    '.cookie-popup',
    '.consent-banner',
    '.consent-popup',
    '.gdpr-banner',
    '.gdpr-consent',
    '.privacy-banner',
    '#cookie-banner',
    '#cookie-consent',
    '#cookie-notice',
    '#consent-banner',
    '#gdpr-banner',
    '[class*="cookie-consent"]',
    '[class*="cookiebanner"]',
    '[class*="cookie-banner"]',
    '[id*="cookie-consent"]',
    '[id*="cookiebanner"]',
    '[class*="consent-banner"]',
    '[class*="gdpr"]',
    '[data-cookie-banner]',
    '[data-consent-banner]',
    '[data-gdpr]',
    '[class*="cc-banner"]',
    '[class*="cc-window"]',
    '[id*="cc-"]',
    '.cc-banner',
    '.cc-window',
    '.cc_container',
    '#cc-banner',
    '#cc-window',
    '[class*="optanon"]',
    '[id*="optanon"]',
    '[data-cc]',
    'div[data-cookie]',
    'div[data-consent]',
  ];

  // CMP script patterns (detect by script URLs in HTML)
  private readonly CMP_SCRIPT_PATTERNS = [
    { pattern: /cookiebot\.com\/uc\.js/i, vendor: 'Cookiebot' },
    { pattern: /cookiebot\.org/i, vendor: 'Cookiebot' },
    { pattern: /Cookiebot\.show/i, vendor: 'Cookiebot' },
    { pattern: /CookieConsent/i, vendor: 'CookieConsent' },
    { pattern: /cdn\.cookielaw\.org/i, vendor: 'OneTrust' },
    { pattern: /onetrust\.com/i, vendor: 'OneTrust' },
    { pattern: /Optanon/i, vendor: 'OneTrust' },
    { pattern: /cdn\.cookiemanager/i, vendor: 'CookieManager' },
    { pattern: /usercentrics\.eu/i, vendor: 'Usercentrics' },
    { pattern: /app\.usercentrics\.eu/i, vendor: 'Usercentrics' },
    { pattern: /UC_UI/i, vendor: 'Usercentrics' },
    { pattern: /privacy-mgmt\.com/i, vendor: 'Sourcepoint' },
    { pattern: /quantcast\.mgr\.consensu\.org/i, vendor: 'Quantcast' },
    { pattern: /didomi\.io/i, vendor: 'Didomi' },
    { pattern: /Didomi\.preferences/i, vendor: 'Didomi' },
    { pattern: /borlabs\.io/i, vendor: 'Borlabs Cookie' },
    { pattern: /BorlabsCookie/i, vendor: 'Borlabs Cookie' },
    { pattern: /complianz/i, vendor: 'Complianz' },
    { pattern: /cmplz_/i, vendor: 'Complianz' },
    { pattern: /klaro\.org|kiprotect\.com\/klaro/i, vendor: 'Klaro' },
    { pattern: /klaro\.getManager/i, vendor: 'Klaro' },
    { pattern: /trustarc\.com/i, vendor: 'TrustArc' },
    { pattern: /cookieyes\.com/i, vendor: 'CookieYes' },
    { pattern: /cookieinformation\.com/i, vendor: 'CookieInformation' },
    { pattern: /consentmanager\.net/i, vendor: 'ConsentManager' },
    { pattern: /cookiefirst\.com/i, vendor: 'CookieFirst' },
    { pattern: /iubenda\.com/i, vendor: 'Iubenda' },
    { pattern: /iubenda\.cs/i, vendor: 'Iubenda' },
    { pattern: /osano\.com/i, vendor: 'Osano' },
    { pattern: /cookie-script\.com/i, vendor: 'CookieScript' },
    { pattern: /civiccookiecontrol/i, vendor: 'Civic Cookie Control' },
    { pattern: /moove\.gdpr/i, vendor: 'Moove GDPR' },
    { pattern: /gdpr-cookie-consent/i, vendor: 'GDPR Cookie Consent' },
    { pattern: /wp-rocket/i, vendor: 'WP Rocket' },
    { pattern: /cookie-notice/i, vendor: 'Cookie Notice' },
    { pattern: /cookie-law-info/i, vendor: 'Cookie Law Info' },
    { pattern: /siteground.*consent/i, vendor: 'SiteGround' },
    { pattern: /consent\.mo/i, vendor: 'Consent Management' },
    { pattern: /consentmode/i, vendor: 'Consent Mode' },
    { pattern: /cookieInformation/i, vendor: 'CookieInformation' },
    { pattern: /cookieControl/i, vendor: 'CookieControl' },
    { pattern: /ccm19/i, vendor: 'CCM19' },
    { pattern: /cck/i, vendor: 'CookieConsentKit' },
    { pattern: /cookieconsent/i, vendor: 'Generic Cookie Consent' },
    { pattern: /cookie-banner\.js/i, vendor: 'Cookie Banner' },
    { pattern: /consent-banner/i, vendor: 'Consent Banner' },
    { pattern: /cookieChoiceInfo/i, vendor: 'Google Cookie Choice' },
    { pattern: /cookieAlert/i, vendor: 'Cookie Alert' },
    { pattern: /gdpr-banner/i, vendor: 'GDPR Banner' },
    { pattern: /dataLayer.*consent/i, vendor: 'GTM Consent' },
    { pattern: /googletagmanager\.com\/gtag\/js/i, vendor: 'Google Tag (GTM/GA)' },
  ];

  // Generic consent/cookie code patterns in JavaScript
  private readonly CONSENT_CODE_PATTERNS = [
    /cookieconsent/i,
    /cookie-consent/i,
    /cookieConsent/i,
    /showCookieConsent/i,
    /acceptCookies/i,
    /accept.*cookie/i,
    /declineCookies/i,
    /cookieSettings/i,
    /cookie-settings/i,
    /manageCookies/i,
    /manage.*consent/i,
    /consentMode/i,
    /consent.*mode/i,
    /gtag.*consent/i,
    /analytics.*consent/i,
    /marketing.*consent/i,
    /functional.*consent/i,
    /hasConsent/i,
    /checkConsent/i,
    /getConsent/i,
    /setConsent/i,
    /initCookieConsent/i,
    /loadCookieConsent/i,
  ];

  // IAB TCF API patterns (high confidence for consent management)
  private readonly TCF_PATTERNS = [
    /__tcfapi/,
    /__cmp\s*\(/,
    /window\.__tcfapi/,
    /window\.__cmp/,
    /cmpLoaded/,
    /tcData/,
  ];

  // Cookie banner text patterns - more specific to reduce false positives
  private readonly COOKIE_TEXT_PATTERNS = [
    // Specific banner phrases (not just the word "cookie")
    /we use cookies/i,
    /this website uses cookies/i,
    /this site uses cookies/i,
    /by continuing to use/i,
    /consent to cookies/i,
    /accept all cookies/i,
    /accept cookies/i,
    /cookie settings/i,
    // German specific phrases
    /wir verwenden cookies/i,
    /wir nutzen cookies/i,
    /diese (?:website|webseite|seite) (?:verwendet|nutzt|benutzt) cookies/i,
    /cookie[- ]?einstellungen/i,
    /alle cookies akzeptieren/i,
    /cookies akzeptieren/i,
    // French
    /nous utilisons des cookies/i,
    /accepter les cookies/i,
    // Spanish
    /utilizamos cookies/i,
    /aceptar cookies/i,
    // Italian
    /utilizziamo i cookie/i,
    /accettare i cookie/i,
  ];

  private constructor() {}

  public static getInstance(): CookieBannerService {
    if (!CookieBannerService.instance) {
      CookieBannerService.instance = new CookieBannerService();
    }
    return CookieBannerService.instance;
  }

  /**
   * Check if a website has a cookie banner (with retry + strategy-based detection)
   */
  public async checkCookieBanner(url: string): Promise<CookieBannerResult> {
    try {
      logger.info(`Checking cookie banner for: ${url}`);

      // Ensure URL has protocol
      let fullUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = `https://${url}`;
      }

      // Run both DOM-based and network-based detection in parallel
      const [domResult, networkConsentResult] = await Promise.allSettled([
        this.performDomBasedDetection(fullUrl),
        consentModeNetworkService.detectConsentMode(fullUrl, 20000),
      ]);

      const domData = domResult.status === 'fulfilled' ? domResult.value : null;
      const networkData = networkConsentResult.status === 'fulfilled' ? networkConsentResult.value : null;

      if (!domData) {
        throw new Error('Failed to perform DOM-based detection');
      }

      // Build the combined result
      const detectedElements = domData.detectedElements;
      let consentModeDetected = domData.consentModeDetection.detected;
      let consentModeVersion = domData.consentModeDetection.version;
      let consentSetup = domData.consentSetup;

      // Network-based consent detection overrides DOM-based if available
      if (networkData) {
        logger.info(`Network consent detection: mode=${networkData.consent.mode}, confidence=${networkData.consent.confidence}, hits=${networkData.hits_seen}`);
        
        detectedElements.push(`--- Network Consent Detection ---`);
        detectedElements.push(`Mode: ${networkData.consent.mode}`);
        detectedElements.push(`Confidence: ${Math.round(networkData.consent.confidence * 100)}%`);
        detectedElements.push(`GA4 Hits: ${networkData.hits_seen}`);
        
        if (networkData.consent.reasons.length > 0) {
          detectedElements.push(...networkData.consent.reasons);
        }

        // Update consent mode detection based on network data
        if (networkData.consent.mode !== 'unknown') {
          consentModeDetected = networkData.consent.mode !== 'no_consent_mode';
          consentModeVersion = networkData.consent.mode === 'consent_mode_v1' ? 'v1' : 
                               networkData.consent.mode === 'consent_mode_v2' ? 'v2' : 'unknown';
        }

        // Re-evaluate consent setup with network data
        consentSetup = this.evaluateConsentSetupWithNetwork(
          domData.hasCookieBanner,
          domData.gtmDetection.detected,
          domData.gaDetection.detected,
          networkData
        );
      }

      const loadingBehavior = this.determineLoadingBehavior(
        domData.html,
        domData.gtmDetection.detected,
        domData.gaDetection.detected,
        consentModeDetected
      );

      // Add detection info
      if (domData.gtmDetection.detected) {
        detectedElements.push(`GTM: ${domData.gtmDetection.containerId || 'detected'}`);
      }
      if (domData.gaDetection.detected) {
        detectedElements.push(`GA: ${domData.gaDetection.measurementId || 'detected'}`);
      }
      if (consentModeDetected) {
        detectedElements.push(`Consent Mode ${consentModeVersion || ''}`);
      }

      if (consentSetup.issues.length > 0) {
        detectedElements.push(...consentSetup.issues);
      }

      logger.info(`Cookie banner check for ${url}: hasBanner=${domData.hasCookieBanner}, confidence=${domData.confidence}, consentMode=${consentModeDetected}`);

      return {
        hasCookieBanner: domData.hasCookieBanner,
        bannerType: domData.bannerType,
        detectedElements,
        confidence: domData.confidence,
        checkedAt: new Date(),
        bannerCode: domData.bannerCode,
        gtmDetected: domData.gtmDetection.detected,
        gtmContainerId: domData.gtmDetection.containerId,
        gtmCode: domData.gtmDetection.code,
        gaDetected: domData.gaDetection.detected,
        gaMeasurementId: domData.gaDetection.measurementId,
        gaCode: domData.gaDetection.code,
        gtmGaLoadingBehavior: loadingBehavior,
        consentModeDetected,
        consentModeVersion,
        consentModeConfig: domData.consentModeDetection.config,
        consentModeCode: domData.consentModeDetection.code,
        consentSetupStatus: consentSetup.status,
        consentIssues: consentSetup.issues,
        networkConsent: networkData ? {
          mode: networkData.consent.mode,
          ad_storage: networkData.consent.ad_storage,
          analytics_storage: networkData.consent.analytics_storage,
          ad_user_data: networkData.consent.ad_user_data,
          ad_personalization: networkData.consent.ad_personalization,
          confidence: networkData.consent.confidence,
          reasons: networkData.consent.reasons,
          evidence: {
            gcs: networkData.evidence.gcs,
            gcd: networkData.evidence.gcd,
            npa: networkData.evidence.npa,
            dma: networkData.evidence.dma,
            matched_request: networkData.evidence.matched_request,
            event_name: networkData.evidence.event_name,
          },
          hits_seen: networkData.hits_seen,
          measurement_id: networkData.measurement_id,
        } : undefined,
      };
    } catch (error: any) {
      logger.error(`Failed to check cookie banner for ${url}:`, error.message);

      return {
        hasCookieBanner: false,
        detectedElements: [`Check failed: ${error.message}`],
        confidence: 'low',
        checkedAt: new Date(),
        gtmDetected: false,
        gaDetected: false,
        gtmGaLoadingBehavior: 'unknown',
        consentModeDetected: false,
      };
    }
  }

  private async performDomBasedDetection(fullUrl: string): Promise<{
    hasCookieBanner: boolean;
    bannerType: CookieBannerResult['bannerType'];
    detectedElements: string[];
    confidence: CookieBannerResult['confidence'];
    bannerCode?: string;
    gtmDetection: { detected: boolean; containerId?: string; code?: string };
    gaDetection: { detected: boolean; measurementId?: string; code?: string };
    consentModeDetection: {
      detected: boolean;
      version?: 'v1' | 'v2' | 'unknown';
      config?: {
        hasDefaultConsent: boolean;
        hasUpdateConsent: boolean;
        hasWaitForUpdate: boolean;
        detectedRegions: string[];
      };
      code?: string;
    };
    consentSetup: { status: 'correct' | 'missing_default' | 'missing_update' | 'not_configured' | 'incomplete' | 'cannot_verify'; issues: string[] };
    html: string;
  }> {
    const html = await this.fetchWithRetry(fullUrl, 3);

    if (!html) {
      throw new Error('Failed to fetch website content');
    }

    const $ = cheerio.load(html);
    const strategies: DetectionStrategy[] = [];
    const detectedElements: string[] = [];
    let bannerType: CookieBannerResult['bannerType'] = 'unknown';
    let detectedVendor: string | undefined;

    // Strategy 1: CMP script URL detection
    for (const { pattern, vendor } of this.CMP_SCRIPT_PATTERNS) {
      if (pattern.test(html)) {
        strategies.push({ name: 'cmp_script', matched: true, details: vendor });
        detectedElements.push(`CMP script detected: ${vendor}`);
        detectedVendor = vendor;
        break;
      }
    }

    // Strategy 2: IAB TCF API detection
    for (const pattern of this.TCF_PATTERNS) {
      if (pattern.test(html)) {
        strategies.push({ name: 'iab_tcf', matched: true, details: pattern.source });
        detectedElements.push(`IAB TCF API detected: ${pattern.source}`);
        break;
      }
    }
    if (!strategies.some(s => s.name === 'iab_tcf')) {
      strategies.push({ name: 'iab_tcf', matched: false });
    }

    // Strategy 3: Known vendor DOM selectors
    for (const { selector, vendor } of this.VENDOR_SELECTORS) {
      try {
        const elements = $(selector);
        if (elements.length > 0) {
          strategies.push({ name: 'vendor_dom', matched: true, selector, details: vendor });
          detectedElements.push(`Vendor banner: ${vendor} (${selector})`);
          detectedVendor = detectedVendor || vendor;
          if (selector.includes('popup') || selector.includes('dialog') || selector.includes('Dialog')) {
            bannerType = 'popup';
          } else {
            bannerType = 'banner';
          }
          break;
        }
      } catch { continue; }
    }
    if (!strategies.some(s => s.name === 'vendor_dom')) {
      strategies.push({ name: 'vendor_dom', matched: false });
    }

    // Strategy 4: Generic banner DOM selectors
    let genericDomFound = false;
    for (const selector of this.GENERIC_BANNER_SELECTORS) {
      try {
        const elements = $(selector);
        if (elements.length > 0) {
          strategies.push({ name: 'generic_dom', matched: true, selector });
          detectedElements.push(`Generic banner element: ${selector} (${elements.length} found)`);
          genericDomFound = true;
          if (!bannerType || bannerType === 'unknown') {
            if (selector.includes('popup') || selector.includes('dialog')) {
              bannerType = 'popup';
            } else {
              bannerType = 'banner';
            }
          }
          break;
        }
      } catch { continue; }
    }
    if (!genericDomFound) {
      strategies.push({ name: 'generic_dom', matched: false });
    }

    // Strategy 5: Banner text patterns
    let textMatchFound = false;
    const bannerContainers = $('[role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal, [class*="overlay"]');
    const textToCheck = bannerContainers.length > 0 ? bannerContainers.text() : $('body').text();

    for (const pattern of this.COOKIE_TEXT_PATTERNS) {
      if (pattern.test(textToCheck)) {
        textMatchFound = true;
        strategies.push({ name: 'text_pattern', matched: true, details: pattern.source });
        const matches = textToCheck.match(pattern);
        if (matches && matches.length > 0) {
          detectedElements.push(`Text: "${matches[0].substring(0, 60)}"`);
        }
        break;
      }
    }
    if (!textMatchFound) {
      strategies.push({ name: 'text_pattern', matched: false });
    }

    // Strategy 6: Consent code patterns
    let consentCodeFound = false;
    for (const pattern of this.CONSENT_CODE_PATTERNS) {
      if (pattern.test(html)) {
        consentCodeFound = true;
        strategies.push({ name: 'consent_code', matched: true, details: pattern.source });
        detectedElements.push(`Consent code: ${pattern.source}`);
        break;
      }
    }
    if (!consentCodeFound) {
      strategies.push({ name: 'consent_code', matched: false });
    }

    // Strategy 7: Data attributes
    const consentDataAttrs = $('[data-cookie], [data-consent], [data-gdpr], [data-privacy]');
    if (consentDataAttrs.length > 0) {
      strategies.push({ name: 'data_attributes', matched: true, details: `${consentDataAttrs.length} elements` });
      detectedElements.push(`Data consent attributes: ${consentDataAttrs.length} found`);
    } else {
      strategies.push({ name: 'data_attributes', matched: false });
    }

    // Calculate confidence
    const cmpDetected = strategies.some(s => s.name === 'cmp_script' && s.matched);
    const tcfDetected = strategies.some(s => s.name === 'iab_tcf' && s.matched);
    const vendorDomDetected = strategies.some(s => s.name === 'vendor_dom' && s.matched);
    const consentCodeDetected = strategies.some(s => s.name === 'consent_code' && s.matched);
    const dataAttrDetected = strategies.some(s => s.name === 'data_attributes' && s.matched);

    let confidence: CookieBannerResult['confidence'] = 'low';
    if (cmpDetected || tcfDetected || vendorDomDetected) {
      confidence = 'high';
    } else if (genericDomFound && textMatchFound) {
      confidence = 'high';
    } else if (genericDomFound || textMatchFound || consentCodeDetected || dataAttrDetected) {
      confidence = 'medium';
    }

    const hasCookieBanner = cmpDetected || tcfDetected || vendorDomDetected || genericDomFound || textMatchFound || consentCodeDetected || dataAttrDetected;
    const bannerCode = hasCookieBanner ? this.extractBannerCode($) : undefined;

    const gtmDetection = this.detectGTM(html);
    const gaDetection = this.detectGA(html);
    const consentModeDetection = this.detectConsentMode(html);

    const loadingBehavior = this.determineLoadingBehavior(
      html,
      gtmDetection.detected,
      gaDetection.detected,
      consentModeDetection.detected
    );

    const consentSetup = this.evaluateConsentSetup(
      hasCookieBanner,
      gtmDetection.detected,
      gaDetection.detected,
      consentModeDetection,
      loadingBehavior
    );

    return {
      hasCookieBanner,
      bannerType,
      detectedElements,
      confidence,
      bannerCode,
      gtmDetection,
      gaDetection,
      consentModeDetection,
      consentSetup,
      html,
    };
  }

  private evaluateConsentSetupWithNetwork(
    hasCookieBanner: boolean,
    gtmDetected: boolean,
    gaDetected: boolean,
    networkData: ConsentModeResult
  ): { status: 'correct' | 'missing_default' | 'missing_update' | 'not_configured' | 'incomplete' | 'cannot_verify'; issues: string[] } {
    const issues: string[] = [];

    if (!gtmDetected && !gaDetected && networkData.hits_seen === 0) {
      return { status: 'not_configured', issues: ['No GTM/GA tracking detected'] };
    }

    if (networkData.hits_seen === 0) {
      issues.push('No GA4 requests detected - Network-based detection not possible');
      return { status: 'cannot_verify', issues };
    }

    if (networkData.consent.mode === 'no_consent_mode') {
      issues.push('CRITICAL: No Consent Mode detected in GA4 requests');
      issues.push('GA4 is sending data without Consent Mode parameters (gcs/gcd)');
      return { status: 'not_configured', issues };
    }

    if (networkData.consent.mode === 'unknown') {
      issues.push('Consent Mode status unclear');
      issues.push('Recommendation: Manual testing required');
      return { status: 'cannot_verify', issues };
    }

    // We have consent mode detected via network
    const { consent } = networkData;

    if (consent.mode === 'consent_mode_v2') {
      const allGranted = 
        consent.ad_storage === 'granted' &&
        consent.analytics_storage === 'granted' &&
        consent.ad_user_data === 'granted' &&
        consent.ad_personalization === 'granted';

      const allDenied =
        consent.ad_storage === 'denied' &&
        consent.analytics_storage === 'denied' &&
        consent.ad_user_data === 'denied' &&
        consent.ad_personalization === 'denied';

      if (allGranted) {
        issues.push('Consent Mode V2 active - All consent types granted');
        issues.push('User has given full consent');
      } else if (allDenied) {
        issues.push('Consent Mode V2 active - All consent types denied');
        issues.push('Tags are correctly blocked (default state)');
      } else {
        issues.push('Consent Mode V2 active - Partial consent');
      }

      issues.push(`Confidence: ${Math.round(consent.confidence * 100)}%`);
      
      if (networkData.evidence.gcs) {
        issues.push(`gcs Parameter: ${networkData.evidence.gcs}`);
      }

      return { status: 'correct', issues };
    }

    if (consent.mode === 'consent_mode_v1') {
      issues.push('Consent Mode V1 detected - Upgrade to V2 recommended');
      return { status: 'incomplete', issues };
    }

    return { status: 'incomplete', issues };
  }

  /**
   * Fetch URL with retry and exponential backoff
   */
  private async fetchWithRetry(url: string, maxRetries: number): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeHttpRequest(url);
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          logger.warn(`Retry ${attempt + 1}/${maxRetries} for ${url} after ${delay}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error('Failed to fetch after retries');
  }

  /**
   * Detect Google Tag Manager
   */
  private detectGTM(html: string): {
    detected: boolean;
    containerId?: string;
    code?: string;
  } {
    // Pattern 1: GTM script tag
    // <script src="https://www.googletagmanager.com/gtag/js?id=GTM-XXXXXXX"></script>
    const gtmScriptPattern = /<script[^>]*src=["']https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=(GTM-[A-Z0-9]+)["'][^>]*>/i;
    const gtmScriptMatch = html.match(gtmScriptPattern);
    if (gtmScriptMatch) {
      return { detected: true, containerId: gtmScriptMatch[1], code: this.extractCodeSnippet(html, gtmScriptMatch[0]) };
    }

    // Pattern 2: GTM iframe (noscript)
    // <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
    const gtmIframePattern = /<iframe[^>]*src=["']https:\/\/www\.googletagmanager\.com\/ns\.html\?id=(GTM-[A-Z0-9]+)["'][^>]*>/i;
    const gtmIframeMatch = html.match(gtmIframePattern);
    if (gtmIframeMatch) {
      return { detected: true, containerId: gtmIframeMatch[1], code: this.extractCodeSnippet(html, gtmIframeMatch[0]) };
    }

    // Pattern 3: DataLayer
    // window.dataLayer = window.dataLayer || [];
    const hasDataLayer = html.includes('dataLayer') || html.includes('DataLayer');

    // Pattern 4: GTM helper function
    const hasGTMFunction = /function\s*\(\s*w\s*,\s*d\s*,\s*s\s*,\s*l\s*,\s*i\s*\)/.test(html) ||
                         html.includes('(w[l]=w[l]||[])');

    if (hasDataLayer || hasGTMFunction) {
      // Try to extract GTM ID from common patterns
      const gtmIdPattern = /GTM-([A-Z0-9]+)/i;
      const gtmIdMatch = html.match(gtmIdPattern);
      if (gtmIdMatch) {
        return { detected: true, containerId: `GTM-${gtmIdMatch[1]}`, code: this.extractCodeSnippet(html, 'GTM') };
      }
      return { detected: true, containerId: undefined, code: 'DataLayer found' };
    }

    return { detected: false };
  }

  /**
   * Detect Google Analytics
   */
  private detectGA(html: string): {
    detected: boolean;
    measurementId?: string;
    code?: string;
  } {
    // Pattern 1: GA4 Measurement ID in JavaScript context (quoted string with proper format)
    // Only match in quotes to avoid URLs and path segments
    const ga4InQuotesPattern = /['"]G-[A-Z0-9]{10}['"]/i;
    const ga4InQuotesMatch = html.match(ga4InQuotesPattern);
    if (ga4InQuotesMatch) {
      // Extract the ID without quotes
      const id = ga4InQuotesMatch[0].replace(/['"]/g, '');
      return { detected: true, measurementId: id, code: this.extractCodeSnippet(html, ga4InQuotesMatch[0]) };
    }

    // Pattern 2: Universal Analytics (UA-XXXXXXXX-X) - also in quotes
    const uaInQuotesPattern = /['"]UA-\d{6,}-\d{1,2}['"]/i;
    const uaInQuotesMatch = html.match(uaInQuotesPattern);
    if (uaInQuotesMatch) {
      const id = uaInQuotesMatch[0].replace(/['"]/g, '');
      return { detected: true, measurementId: id, code: this.extractCodeSnippet(html, uaInQuotesMatch[0]) };
    }

    // Pattern 3: Google Analytics script URL
    const gaScriptPattern = /google-analytics\.com\/(analytics|gtag|ga|collect)\.js/i;
    if (gaScriptPattern.test(html)) {
      return { detected: true, measurementId: undefined, code: this.extractCodeSnippet(html, 'google-analytics.com') };
    }

    // Pattern 4: gtag() function with config
    const gtagConfigPattern = /gtag\(\s*['"]config['"]\s*,\s*['"]([G-UA]-[A-Z0-9-]+)/i;
    const gtagConfigMatch = html.match(gtagConfigPattern);
    if (gtagConfigMatch) {
      return { detected: true, measurementId: gtagConfigMatch[1], code: this.extractCodeSnippet(html, gtagConfigMatch[0]) };
    }

    // Pattern 5: ga() or ga() create function (legacy analytics.js)
    const gaCreatePattern = /ga\(\s*['"]create['"]\s*,\s*['"]([G-UA]-[A-Z0-9-]+)/i;
    const gaCreateMatch = html.match(gaCreatePattern);
    if (gaCreateMatch) {
      return { detected: true, measurementId: gaCreateMatch[1], code: this.extractCodeSnippet(html, gaCreateMatch[0]) };
    }

    return { detected: false };
  }

  /**
   * Detect Google Consent Mode
   */
  private detectConsentMode(html: string): {
    detected: boolean;
    version?: 'v1' | 'v2' | 'unknown';
    config?: {
      hasDefaultConsent: boolean;
      hasUpdateConsent: boolean;
      hasWaitForUpdate: boolean;
      detectedRegions: string[];
    };
    code?: string;
  } {
    const config = {
      hasDefaultConsent: false,
      hasUpdateConsent: false,
      hasWaitForUpdate: false,
      detectedRegions: [] as string[],
    };

    let version: 'v1' | 'v2' | 'unknown' = 'unknown';
    let consentCode = '';
    let detected = false;

    // Pattern 1: Direct gtag consent commands
    const gtagConsentPatterns = [
      /gtag\(\s*['"]consent['"]\s*,/i,
      /gtag\s*\(\s*['"]consent['"]/i,
      /gtag\(["']consent["']/i,
    ];

    for (const pattern of gtagConsentPatterns) {
      if (pattern.test(html)) {
        detected = true;
        break;
      }
    }

    // Pattern 2: Consent mode via dataLayer
    const dataLayerConsentPatterns = [
      /dataLayer\.push\s*\([^)]*['"]consent['"]/i,
      /dataLayer\s*=\s*[^;]*['"]consent['"]/i,
      /window\.dataLayer[^;]*consent/i,
    ];

    if (!detected) {
      for (const pattern of dataLayerConsentPatterns) {
        if (pattern.test(html)) {
          detected = true;
          break;
        }
      }
    }

    // Pattern 3: Google Consent Mode v2 specific patterns
    const v2Patterns = [
      /ad_storage/i,
      /analytics_storage/i,
      /ad_user_data/i,
      /ad_personalization/i,
      /functionality_storage/i,
      /personalization_storage/i,
      /security_storage/i,
    ];

    let v2StorageTypesFound = 0;
    for (const pattern of v2Patterns) {
      if (pattern.test(html)) {
        v2StorageTypesFound++;
      }
    }

    if (v2StorageTypesFound >= 2) {
      detected = true;
      version = 'v2';
    }

    // Pattern 4: CMP-managed consent mode
    const cmpConsentPatterns = [
      /cookiebot.*consent/i,
      /Cookiebot\.consent/i,
      /usercentrics.*consent/i,
      /UC_UI.*consent/i,
      /onetrust.*consent/i,
      /Optanon.*consent/i,
      /didomi.*consent/i,
      /Didomi.*consent/i,
      /consentmanager.*gtag/i,
      /quantcast.*consent/i,
      /borlabs.*consent/i,
      /BorlabsCookie.*consent/i,
      /complianz.*consent/i,
      /cmplz.*consent/i,
    ];

    if (!detected) {
      for (const pattern of cmpConsentPatterns) {
        if (pattern.test(html)) {
          detected = true;
          logger.info(`Consent Mode detected via CMP pattern: ${pattern.source}`);
          break;
        }
      }
    }

    // Pattern 5: Check for consent-related variables and functions
    const consentVarPatterns = [
      /window\.__consent/i,
      /window\.consentMode/i,
      /window\.googleConsent/i,
      /hasConsent\s*[=:]/i,
      /consentGranted/i,
      /consentDenied/i,
      /marketingConsent/i,
      /analyticsConsent/i,
      /updateConsent/i,
      /setConsent/i,
      /initConsent/i,
    ];

    if (!detected) {
      for (const pattern of consentVarPatterns) {
        if (pattern.test(html)) {
          detected = true;
          break;
        }
      }
    }

    // Pattern 6: GTM Consent Mode integration
    const gtmConsentPatterns = [
      /google.*tag.*manager.*consent/i,
      /GTM.*consent/i,
      /googletagmanager.*consent/i,
      /dataLayer.*consent.*mode/i,
    ];

    if (!detected) {
      for (const pattern of gtmConsentPatterns) {
        if (pattern.test(html)) {
          detected = true;
          break;
        }
      }
    }

    // If still not detected, check for any gtag with 'denied' or 'granted' values
    if (!detected) {
      if (/['"]denied['"]/i.test(html) && /['"]granted['"]/i.test(html)) {
        // Check if it's in the context of consent
        const contextPattern = /(?:ad_storage|analytics_storage|functionality_storage|personalization_storage|security_storage|ad_user_data|ad_personalization)/i;
        if (contextPattern.test(html)) {
          detected = true;
        }
      }
    }

    if (!detected) {
      return { detected: false };
    }

    // Now analyze the detected consent mode for version and config

    // Detect 'default' consent (v1 and v2)
    if (/gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]\s*,/i.test(html)) {
      config.hasDefaultConsent = true;
    }

    // Also check for default in other formats
    if (!config.hasDefaultConsent) {
      const defaultPatterns = [
        /consent.*default/i,
        /default.*consent/i,
        /['"]default['"]\s*,\s*\{/i,
      ];
      for (const pattern of defaultPatterns) {
        if (pattern.test(html)) {
          config.hasDefaultConsent = true;
          break;
        }
      }
    }

    // Detect 'update' consent (v2 only)
    if (/gtag\(\s*['"]consent['"]\s*,\s*['"]update['"]\s*,/i.test(html)) {
      config.hasUpdateConsent = true;
      version = 'v2';
    }

    // Also check for update in other formats
    if (!config.hasUpdateConsent) {
      const updatePatterns = [
        /consent.*update/i,
        /update.*consent/i,
        /['"]update['"]\s*,\s*\{/i,
      ];
      for (const pattern of updatePatterns) {
        if (pattern.test(html)) {
          config.hasUpdateConsent = true;
          break;
        }
      }
    }

    if (config.hasUpdateConsent && !version) {
      version = 'v2';
    } else if (config.hasDefaultConsent && !config.hasUpdateConsent) {
      version = 'v1';
    }

    // Detect wait_for_update parameter (v2 specific)
    if (/wait_for_update\s*:/i.test(html) || /waitForUpdate\s*:/i.test(html) || /wait_for_update/i.test(html)) {
      config.hasWaitForUpdate = true;
      version = 'v2';
    }

    // Detect consent regions
    const regionPatterns = [
      /region\s*:\s*['"]([A-Z]{2})['"]/gi,
      /region\s*:\s*\[([^\]]+)\]/gi,
    ];

    for (const pattern of regionPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const regions = match[1].match(/[A-Z]{2}/g);
        if (regions) {
          for (const region of regions) {
            if (!config.detectedRegions.includes(region)) {
              config.detectedRegions.push(region);
            }
          }
        }
      }
    }

    // Detect specific consent types
    const consentTypes = [
      'ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization',
      'functionality_storage', 'personalization_storage', 'security_storage',
    ];

    let detectedConsentTypes: string[] = [];
    for (const type of consentTypes) {
      const pattern = new RegExp(`['"]${type}['"]\\s*:\\s*['"](granted|denied)['"]`, 'gi');
      if (pattern.test(html)) {
        detectedConsentTypes.push(type);
      }
    }

    // Determine version based on consent types
    if (detectedConsentTypes.includes('ad_user_data') || detectedConsentTypes.includes('ad_personalization')) {
      version = 'v2';
    }

    // If we have v2 storage types but couldn't determine version yet
    if (version === 'unknown' && v2StorageTypesFound >= 2) {
      version = 'v2';
    }

    // Extract consent code snippet
    const consentMatch = html.match(/gtag\(\s*['"]consent['"][^;]{0,300}\);/gi);
    if (consentMatch && consentMatch.length > 0) {
      consentCode = consentMatch.slice(0, 3).join('\n');
    } else {
      // Try to find any consent-related code
      const altConsentMatch = html.match(/(?:consent|Consent)[^<>{]{0,200}(?:granted|denied|update|default)[^<>{]{0,200}/gi);
      if (altConsentMatch && altConsentMatch.length > 0) {
        consentCode = altConsentMatch.slice(0, 2).join('\n');
      }
    }

    // Limit code snippet length
    if (consentCode.length > 500) {
      consentCode = consentCode.substring(0, 500) + '...';
    }

    logger.info(`Consent Mode detected: detected=${detected}, version=${version}, default=${config.hasDefaultConsent}, update=${config.hasUpdateConsent}, wait=${config.hasWaitForUpdate}, regions=${config.detectedRegions.join(', ')}`);

    return {
      detected: true,
      version,
      config,
      code: consentCode || 'Consent Mode implementation detected',
    };
  }

  /**
   * Evaluate consent setup status and identify issues
   */
  private evaluateConsentSetup(
    hasCookieBanner: boolean,
    gtmDetected: boolean,
    gaDetected: boolean,
    consentModeDetection: { detected: boolean; version?: string; config?: { hasDefaultConsent: boolean; hasUpdateConsent: boolean; hasWaitForUpdate: boolean; detectedRegions: string[] } },
    loadingBehavior?: 'blocked' | 'loaded_without_consent' | 'loaded_with_consent_mode' | 'unknown'
  ): { status: 'correct' | 'missing_default' | 'missing_update' | 'not_configured' | 'incomplete' | 'cannot_verify'; issues: string[] } {
    const issues: string[] = [];

    // No tracking detected - nothing to check
    if (!gtmDetected && !gaDetected) {
      return { status: 'not_configured', issues: ['No GTM/GA tracking detected'] };
    }

    // CRITICAL: Tracking detected but loading WITHOUT consent
    if (loadingBehavior === 'loaded_without_consent') {
      issues.push('CRITICAL: GTM/GA is loaded without consent mechanism');
      issues.push('Privacy violation: Tracking active before user consent');
      return { status: 'not_configured', issues };
    }

    // GOOD: Tracking loaded WITH consent mode
    if (loadingBehavior === 'loaded_with_consent_mode') {
      // Even if we can't find default() in code, the behavior shows it's working
      if (!consentModeDetection.detected || !consentModeDetection.config?.hasDefaultConsent) {
        issues.push('Consent Mode implemented (via CMP or GTM Template)');
        issues.push('Tags are correctly blocked until consent');
        if (consentModeDetection.version === 'unknown') {
          issues.push('Note: Could not determine version');
        }
        return { status: 'correct', issues };
      }
    }

    // Tracking detected but no cookie banner
    if (!hasCookieBanner && (gtmDetected || gaDetected)) {
      issues.push('WARNING: Tracking active without cookie banner');
      if (!consentModeDetection.detected) {
        issues.push('No Consent Mode implemented');
        return { status: 'not_configured', issues };
      }
    }

    // Check consent mode configuration
    if (!consentModeDetection.detected) {
      issues.push('Consent Mode not detected');
      return { status: 'not_configured', issues };
    }

    // Check for required v2 features
    if (consentModeDetection.version === 'v1') {
      issues.push('Consent Mode V1 detected - Upgrade to V2 recommended (for Google Ads)');
      if (!consentModeDetection.config?.hasUpdateConsent) {
        issues.push('Note: update() might be missing');
      }
    }

    // Check for missing default consent (only if we couldn't verify via loading behavior)
    if (consentModeDetection.config && !consentModeDetection.config.hasDefaultConsent && loadingBehavior !== 'loaded_with_consent_mode') {
      issues.push('Consent Mode: default() not found in source code');
      issues.push('Recommendation: Manual testing required');
      return { status: 'cannot_verify', issues };
    }

    // Check for missing update (required for v2)
    if (consentModeDetection.version === 'v2' && consentModeDetection.config && !consentModeDetection.config.hasUpdateConsent) {
      issues.push('Consent Mode V2: update() after consent might be missing');
      return { status: 'missing_update', issues };
    }

    // Check if banner is detected but consent mode is missing
    if (hasCookieBanner && !consentModeDetection.detected) {
      issues.push('Cookie banner without Consent Mode integration');
      return { status: 'incomplete', issues };
    }

    // Everything looks good
    if (consentModeDetection.detected && consentModeDetection.version === 'v2') {
      issues.push('Consent Mode V2 correctly implemented');
      return { status: 'correct', issues };
    }

    if (consentModeDetection.detected && consentModeDetection.version === 'v1') {
      issues.push('Consent Mode V1 - V2 recommended for Google Ads');
      return { status: 'incomplete', issues };
    }

    // Unknown version but detected
    if (consentModeDetection.detected) {
      issues.push('Consent Mode detected, version undetermined');
      issues.push('Functionality should be tested manually');
      return { status: 'correct', issues };
    }

    return { status: 'incomplete', issues };
  }

  /**
   * Extract code snippet around a match
   */
  private extractCodeSnippet(html: string, search: string, contextLines: number = 2): string {
    const index = html.indexOf(search);
    if (index === -1) return search;

    const start = Math.max(0, index - 100);
    const end = Math.min(html.length, index + search.length + 100);
    let snippet = html.substring(start, end);

    // Clean up the snippet
    snippet = snippet.replace(/\s+/g, ' ').trim();
    if (snippet.length > 300) {
      snippet = snippet.substring(0, 300) + '...';
    }

    return snippet;
  }

  /**
   * Determine GTM/GA loading behavior
   */
  private determineLoadingBehavior(
    html: string,
    gtmDetected: boolean,
    gaDetected: boolean,
    consentModeDetected: boolean
  ): 'blocked' | 'loaded_without_consent' | 'loaded_with_consent_mode' | 'unknown' {
    if (!gtmDetected && !gaDetected) {
      return 'unknown';
    }

    // If consent mode is detected, GTM/GA is loaded but with consent mode
    if (consentModeDetected) {
      return 'loaded_with_consent_mode';
    }

    // Check for specific conditional loading patterns (more strict than before)
    const conditionalGTM = /if\s*\([^)]*(?:consent|cookie|gdpr|privacy)[^)]*\)[^{]*\{[^}]*googletagmanager/is.test(html);
    const conditionalGA = /if\s*\([^)]*(?:consent|cookie|gdpr|privacy)[^)]*\)[^{]*\{[^}]*(?:google-analytics|gtag)/is.test(html);

    // Check for CMP-managed tag injection patterns
    const cmpManagedTags = /(?:cookiebot|usercentrics|onetrust|didomi).*(?:gtm|analytics|gtag)/is.test(html) ||
                            /data-(?:cookieconsent|cookiecategory|usercentrics)/i.test(html);

    // Check for script type="text/plain" pattern (common CMP blocking technique)
    const blockedScripts = /type\s*=\s*["']text\/plain["'][^>]*(?:googletagmanager|google-analytics|gtag)/i.test(html);

    if (conditionalGTM || conditionalGA || cmpManagedTags || blockedScripts) {
      return 'blocked';
    }

    // GTM/GA is loaded directly without any consent mechanism
    if (gtmDetected || gaDetected) {
      return 'loaded_without_consent';
    }

    return 'unknown';
  }

  /**
   * Extract cookie banner code
   */
  private extractBannerCode($: any): string {
    // Try to find the cookie banner element
    const bannerSelectors = [
      '.cookie-banner', '.cookie-consent', '.cookie-notice', '.cookie-dialog',
      '.cookie-popup', '.consent-banner', '.consent-popup', '.gdpr-banner',
      '#cookie-banner', '#cookie-consent', '#onetrust-banner-sdk',
    ];

    for (const selector of bannerSelectors) {
      try {
        const element = $(selector).first();
        if (element.length > 0) {
          let code = element.html() || '';
          // Clean up and limit size
          code = code.replace(/\s+/g, ' ').trim();
          if (code.length > 500) {
            code = code.substring(0, 500) + '...';
          }
          if (code.length > 50) {
            return code;
          }
        }
      } catch (error) {
        continue;
      }
    }

    return '';
  }

  /**
   * Make HTTP request using Electron's net module
   */
  private makeHttpRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        },
      });

      let html = '';
      let timeoutHandle: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      };

      request.on('response', (response) => {
        cleanup();

        // Follow redirects (max 5)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, url).toString();
          this.makeHttpRequest(redirectUrl).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.on('data', (chunk) => {
          html += chunk.toString();
        });

        response.on('end', () => {
          resolve(html);
        });
      });

      request.on('error', (error) => {
        cleanup();
        reject(error);
      });

      // Set timeout
      timeoutHandle = setTimeout(() => {
        cleanup();
        request.abort();
        reject(new Error('Request timeout'));
      }, 10000);

      request.end();
    });
  }

  /**
   * Check multiple websites in parallel
   */
  public async checkMultiple(urls: string[]): Promise<Map<string, CookieBannerResult>> {
    const results = new Map<string, CookieBannerResult>();

    const promises = urls.map(async (url) => {
      try {
        const result = await this.checkCookieBanner(url);
        return { url, result };
      } catch (error) {
        logger.error(`Failed to check ${url}:`, error);
        return {
          url,
          result: {
            hasCookieBanner: false,
            detectedElements: ['Check failed'],
            confidence: 'low' as const,
            checkedAt: new Date(),
            gtmDetected: false,
            gaDetected: false,
            gtmGaLoadingBehavior: 'unknown' as const,
            consentModeDetected: false,
          },
        };
      }
    });

    const settled = await Promise.allSettled(promises);

    settled.forEach((promise, index) => {
      if (promise.status === 'fulfilled') {
        results.set(promise.value.url, promise.value.result);
      }
    });

    return results;
  }
}

export default CookieBannerService.getInstance();
