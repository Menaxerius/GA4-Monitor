import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Divider,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  TextField,
  InputAdornment,
  Skeleton,
  Stack,
  Tooltip,
  LinearProgress,
  alpha,
} from '@mui/material';
import {
  PlayArrow as RunTestIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Assessment as AssessmentIcon,
  Event as EventIcon,
  Public as WebsiteIcon,
  Shield as ShieldIcon,
  ManageAccounts as ManageAccountsIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  BarChart as BarChartIcon,
  BugReport as AnomalyIcon,
  AccessTime as TimeIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import EventMonitor from './EventMonitor';
import AccountManager from '../account/AccountManager';

interface Property {
  id: string;
  propertyId: string;
  displayName: string;
  accountName?: string;
  isFavorite?: boolean;
  websiteUrl?: string;
  cookieBannerDetected?: boolean;
  cookieBannerLastChecked?: Date;
  lastAccessedByAccount?: string;
}

interface TestResult {
  id: number;
  propertyId: string;
  testType: string;
  startDate: string;
  endDate: string;
  totalEvents: number;
  comparisonTotalEvents: number;
  percentChange: number;
  anomalyCount: number;
  status: 'success' | 'warning' | 'error';
  errorMessage?: string;
  createdAt: string;
}

interface EventDetail {
  id: number;
  testResultId: number;
  eventName: string;
  eventCount: number;
  comparisonCount: number;
  percentChange: number;
  isAnomaly: boolean;
  anomalyReason?: string;
  createdAt: string;
}

interface CookieBannerCheckResult {
  detected: boolean;
  confidence?: 'low' | 'medium' | 'high';
  checked?: Date;
  bannerCode?: string;
  gtmDetected?: boolean;
  gtmContainerId?: string;
  gtmCode?: string;
  gaDetected?: boolean;
  gaMeasurementId?: string;
  gaCode?: string;
  gtmGaLoadingBehavior?: 'blocked' | 'loaded_without_consent' | 'loaded_with_consent_mode' | 'unknown';
  consentModeDetected?: boolean;
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
  detectedElements?: string[];
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

const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const config = {
    success: { label: 'Success', color: 'success' as const, icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
    warning: { label: 'Warning', color: 'warning' as const, icon: <WarningIcon sx={{ fontSize: 16 }} /> },
    error: { label: 'Error', color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: 16 }} /> },
  }[status] || { label: status, color: 'default' as const, icon: null };

  return (
    <Chip
      icon={config.icon || undefined}
      label={config.label}
      color={config.color}
      size="small"
      variant="filled"
      sx={{ fontWeight: 600, fontSize: '0.75rem' }}
    />
  );
};

const KpiCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => (
  <Card
    sx={{
      height: '100%',
      borderLeft: 4,
      borderColor: color,
      transition: 'box-shadow 0.2s',
      '&:hover': { boxShadow: 4 },
    }}
  >
    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={700} sx={{ color, mt: 0.5 }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(color, 0.1), color, display: 'flex' }}>
          {icon}
        </Box>
      </Stack>
    </CardContent>
  </Card>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
    <Box sx={{ color: 'text.disabled', mb: 2 }}>{icon}</Box>
    <Typography variant="h6" color="text.secondary" gutterBottom>
      {title}
    </Typography>
    <Typography variant="body2" color="text.disabled">
      {description}
    </Typography>
  </Box>
);

const Dashboard: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [testRunning, setTestRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<string>('monthly');
  const [currentTab, setCurrentTab] = useState<number>(0);
  const [currentAccountEmail, setCurrentAccountEmail] = useState<string | null>(null);

  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [checkingCookieBanner, setCheckingCookieBanner] = useState(false);
  const [cookieBannerResult, setCookieBannerResult] = useState<CookieBannerCheckResult | null>(null);

  const [eventDetailsDialog, setEventDetailsDialog] = useState<{
    open: boolean;
    testResult: TestResult | null;
    eventDetails: EventDetail[];
    loading: boolean;
  }>({ open: false, testResult: null, eventDetails: [], loading: false });

  const [resultFilter, setResultFilter] = useState<string>('all');

  const loadProperties = useCallback(async () => {
    try {
      const authResponse = await window.electronAPI.auth.getState();
      if (authResponse.success) {
        setCurrentAccountEmail(authResponse.data.currentAccountEmail || null);
      }

      const response = await window.electronAPI.properties.list();
      if (response.success) {
        setProperties(response.data || []);
        if (response.data && response.data.length > 0) {
          const config = await window.electronAPI.config.get();
          const savedProperty = config.data?.selectedProperty;
          const propertyToSelect = savedProperty && response.data.some((p: Property) => p.propertyId === savedProperty)
            ? savedProperty
            : response.data[0].propertyId;
          setSelectedProperty(propertyToSelect);
        }
      } else {
        setError(response.error || 'Failed to load properties');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTestHistory = useCallback(async (propertyId?: string) => {
    const pid = propertyId || selectedProperty;
    if (!pid) return;
    try {
      const response = await window.electronAPI.tests.getHistory(20, pid);
      if (response.success) {
        setTestResults(response.data || []);
      }
    } catch (err) {
      console.error('Failed to load test history:', err);
    }
  }, [selectedProperty]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    if (!selectedProperty) return;

    const prop = properties.find(p => p.propertyId === selectedProperty);
    if (prop?.websiteUrl) {
      setWebsiteUrl(prop.websiteUrl);
    } else {
      setWebsiteUrl('');
    }

    window.electronAPI.config.set({ selectedProperty }).catch(() => {});
    loadTestHistory(selectedProperty);
  }, [selectedProperty, properties, loadTestHistory]);

  const handlePropertyChange = async (propertyId: string) => {
    const selectedProp = properties.find(p => p.propertyId === propertyId);

    if (selectedProp?.lastAccessedByAccount && currentAccountEmail) {
      if (selectedProp.lastAccessedByAccount !== currentAccountEmail) {
        await window.electronAPI.accounts.switch(selectedProp.lastAccessedByAccount);
        await loadProperties();
      }
    }

    setSelectedProperty(propertyId);
  };

  const handleRunTest = async () => {
    if (!selectedProperty) {
      setError('Please select a property');
      return;
    }
    setTestRunning(true);
    setError(null);
    try {
      const response = await window.electronAPI.tests.run({
        propertyId: selectedProperty,
        interval: selectedInterval,
      });
      if (response.success) {
        await loadTestHistory(selectedProperty);
      } else {
        setError(response.error || 'Test failed');
      }
    } catch (err: any) {
      setError(err.message || 'Test failed');
    } finally {
      setTestRunning(false);
    }
  };

  const handleCheckCookieBanner = async () => {
    if (!websiteUrl || !selectedProperty) {
      setError('Please enter a website URL');
      return;
    }
    setCheckingCookieBanner(true);
    setError(null);
    try {
      await window.electronAPI.properties.updateWebsiteUrl(selectedProperty, websiteUrl);

      const response = await window.electronAPI.properties.checkCookieBanner(selectedProperty, websiteUrl);
      if (response.success) {
        setCookieBannerResult({
          detected: response.data.hasCookieBanner,
          confidence: response.data.confidence,
          checked: new Date(),
          bannerCode: response.data.bannerCode,
          gtmDetected: response.data.gtmDetected,
          gtmContainerId: response.data.gtmContainerId,
          gtmCode: response.data.gtmCode,
          gaDetected: response.data.gaDetected,
          gaMeasurementId: response.data.gaMeasurementId,
          gaCode: response.data.gaCode,
          gtmGaLoadingBehavior: response.data.gtmGaLoadingBehavior,
          consentModeDetected: response.data.consentModeDetected,
          consentModeVersion: response.data.consentModeVersion,
          consentModeConfig: response.data.consentModeConfig,
          consentModeCode: response.data.consentModeCode,
          consentSetupStatus: response.data.consentSetupStatus,
          consentIssues: response.data.consentIssues,
          detectedElements: response.data.detectedElements,
          networkConsent: response.data.networkConsent,
        });
        await loadProperties();
      } else {
        setError(response.error || 'Cookie banner check failed');
      }
    } catch (err: any) {
      setError(err.message || 'Cookie banner check failed');
    } finally {
      setCheckingCookieBanner(false);
    }
  };

  const loadEventDetails = async (testResult: TestResult) => {
    setEventDetailsDialog({ open: true, testResult, eventDetails: [], loading: true });
    try {
      const response = await window.electronAPI.tests.getEventDetails(testResult.id);
      if (response.success) {
        setEventDetailsDialog(prev => ({ ...prev, eventDetails: response.data || [], loading: false }));
      } else {
        setEventDetailsDialog(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setEventDetailsDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const summary = React.useMemo(() => {
    const total = testResults.length;
    const successful = testResults.filter(r => r.status === 'success').length;
    const warnings = testResults.filter(r => r.status === 'warning').length;
    const errors = testResults.filter(r => r.status === 'error').length;
    const totalAnomalies = testResults.reduce((sum, r) => sum + r.anomalyCount, 0);
    const lastRun = testResults.length > 0 ? testResults[0].createdAt : null;
    return { total, successful, warnings, errors, totalAnomalies, lastRun };
  }, [testResults]);

  const filteredResults = React.useMemo(() => {
    if (resultFilter === 'all') return testResults;
    return testResults.filter(r => r.status === resultFilter);
  }, [testResults, resultFilter]);

  const selectedPropertyData = properties.find(p => p.propertyId === selectedProperty);

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width={200} height={40} sx={{ mb: 3 }} />
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map(i => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={200} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Dashboard
          </Typography>
          {selectedPropertyData && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {selectedPropertyData.displayName}
              {selectedPropertyData.accountName && ` — ${selectedPropertyData.accountName}`}
            </Typography>
          )}
        </Box>
        <Tooltip title="Refresh data">
          <IconButton onClick={() => { loadProperties(); loadTestHistory(); }} size="large">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Total Tests"
            value={summary.total}
            icon={<AssessmentIcon />}
            color="#1976d2"
            subtitle={summary.lastRun ? `Last: ${format(new Date(summary.lastRun), 'dd.MM.yy HH:mm')}` : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Successful"
            value={summary.successful}
            icon={<CheckCircleIcon />}
            color="#4caf50"
            subtitle={summary.total > 0 ? `${((summary.successful / summary.total) * 100).toFixed(0)}%` : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Warnings"
            value={summary.warnings}
            icon={<WarningIcon />}
            color="#ff9800"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Anomalies"
            value={summary.totalAnomalies}
            icon={<AnomalyIcon />}
            color={summary.errors > 0 ? '#f44336' : '#9e9e9e'}
            subtitle={summary.errors > 0 ? `${summary.errors} failed tests` : undefined}
          />
        </Grid>
      </Grid>

      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={currentTab}
          onChange={(_, v) => setCurrentTab(v)}
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', fontSize: '0.9rem' },
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Tab icon={<AssessmentIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Overview" />
          <Tab icon={<EventIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Event Details" />
          <Tab icon={<ManageAccountsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Accounts" />
        </Tabs>
      </Paper>

      {currentTab === 0 && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Run New Test
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Property</InputLabel>
                  <Select
                    value={selectedProperty}
                    label="Property"
                    onChange={(e) => handlePropertyChange(e.target.value)}
                    disabled={properties.length === 0}
                  >
                    {properties.map((property) => (
                      <MenuItem key={property.propertyId} value={property.propertyId}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <Typography variant="body2" noWrap>
                            {property.displayName}
                          </Typography>
                          {property.isFavorite && (
                            <Chip label="Favorite" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                          )}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Interval</InputLabel>
                  <Select
                    value={selectedInterval}
                    label="Interval"
                    onChange={(e) => setSelectedInterval(e.target.value)}
                  >
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="quarterly">Quarterly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={5}>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={testRunning ? <CircularProgress size={18} color="inherit" /> : <RunTestIcon />}
                  onClick={handleRunTest}
                  disabled={testRunning || !selectedProperty}
                  sx={{ height: 40, fontWeight: 600 }}
                >
                  {testRunning ? 'Running...' : 'Start Test'}
                </Button>
              </Grid>
            </Grid>
            {testRunning && <LinearProgress sx={{ mt: 2, borderRadius: 1 }} />}
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <ShieldIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>
                Cookie Banner & Consent Check
              </Typography>
            </Stack>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={7}>
                <TextField
                  fullWidth
                  size="small"
                  label="Website URL"
                  placeholder="https://www.example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={checkingCookieBanner}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <WebsiteIcon color="action" fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} md={5}>
                <Button
                  variant="outlined"
                  size="large"
                  fullWidth
                  startIcon={checkingCookieBanner ? <CircularProgress size={18} /> : <ShieldIcon />}
                  onClick={handleCheckCookieBanner}
                  disabled={checkingCookieBanner || !websiteUrl || !selectedProperty}
                  sx={{ height: 40, fontWeight: 600 }}
                >
                  {checkingCookieBanner ? 'Checking...' : 'Check Cookie Banner'}
                </Button>
              </Grid>
            </Grid>

            {checkingCookieBanner && <LinearProgress sx={{ mt: 2, borderRadius: 1 }} />}

            {!cookieBannerResult && selectedPropertyData?.cookieBannerLastChecked && (
              <Alert
                severity={selectedPropertyData.cookieBannerDetected ? 'warning' : 'success'}
                sx={{ mt: 2, borderRadius: 2 }}
                icon={selectedPropertyData.cookieBannerDetected ? <WarningIcon /> : <CheckCircleIcon />}
              >
                {selectedPropertyData.cookieBannerDetected
                  ? 'Cookie banner detected'
                  : 'No cookie banner detected'}
                {' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  (Last checked: {format(new Date(selectedPropertyData.cookieBannerLastChecked), 'dd.MM.yyyy HH:mm')})
                </Typography>
              </Alert>
            )}

            {cookieBannerResult && (
              <Box sx={{ mt: 2 }}>
                <Alert
                  severity={cookieBannerResult.detected ? 'warning' : 'success'}
                  sx={{ borderRadius: 2 }}
                >
                  <Stack spacing={1.5}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <Typography variant="body2" fontWeight={600}>
                        {cookieBannerResult.detected ? 'Cookie banner detected' : 'No cookie banner found'}
                      </Typography>
                      {cookieBannerResult.confidence && (
                        <Chip
                          label={`Confidence: ${cookieBannerResult.confidence.toUpperCase()}`}
                          size="small"
                          color={cookieBannerResult.confidence === 'high' ? 'success' : cookieBannerResult.confidence === 'medium' ? 'warning' : 'default'}
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                    </Stack>

                    <Stack direction="row" flexWrap="wrap" spacing={0.5} useFlexGap>
                      {cookieBannerResult.gtmDetected && (
                        <Chip icon={<BarChartIcon sx={{ fontSize: 14 }} />} label={`GTM: ${cookieBannerResult.gtmContainerId || 'Detected'}`} size="small" color="info" variant="outlined" />
                      )}
                      {cookieBannerResult.gaDetected && (
                        <Chip icon={<BarChartIcon sx={{ fontSize: 14 }} />} label={`GA: ${cookieBannerResult.gaMeasurementId || 'Detected'}`} size="small" color="info" variant="outlined" />
                      )}
                      {cookieBannerResult.consentModeDetected && (
                        <Chip
                          icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                          label={`Consent Mode ${cookieBannerResult.consentModeVersion?.toUpperCase() || ''}`}
                          size="small"
                          color={cookieBannerResult.consentModeVersion === 'v2' ? 'success' : 'default'}
                          variant="outlined"
                        />
                      )}
                      {cookieBannerResult.gtmGaLoadingBehavior && cookieBannerResult.gtmGaLoadingBehavior !== 'unknown' && (
                        <Chip
                          label={
                            cookieBannerResult.gtmGaLoadingBehavior === 'loaded_with_consent_mode' ? 'Loading: With Consent Mode' :
                            cookieBannerResult.gtmGaLoadingBehavior === 'loaded_without_consent' ? 'Loading: Without Consent' :
                            cookieBannerResult.gtmGaLoadingBehavior === 'blocked' ? 'Loading: Blocked' : 'Unknown'
                          }
                          size="small"
                          color={
                            cookieBannerResult.gtmGaLoadingBehavior === 'loaded_with_consent_mode' ? 'success' :
                            cookieBannerResult.gtmGaLoadingBehavior === 'loaded_without_consent' ? 'error' : 'default'
                          }
                          variant="filled"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                    </Stack>

                    {cookieBannerResult.consentSetupStatus && (
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                          <ShieldIcon fontSize="small" color={
                            cookieBannerResult.consentSetupStatus === 'correct' ? 'success' :
                            cookieBannerResult.consentSetupStatus === 'not_configured' ? 'error' :
                            cookieBannerResult.consentSetupStatus === 'cannot_verify' ? 'info' : 'warning'
                          } />
                          <Typography variant="subtitle2" fontWeight={600}>
                            Consent Mode Status
                          </Typography>
                          <Chip
                            label={
                              cookieBannerResult.consentSetupStatus === 'correct' ? 'Correctly configured' :
                              cookieBannerResult.consentSetupStatus === 'missing_default' ? 'Default missing' :
                              cookieBannerResult.consentSetupStatus === 'missing_update' ? 'Update missing' :
                              cookieBannerResult.consentSetupStatus === 'not_configured' ? 'Not configured' :
                              cookieBannerResult.consentSetupStatus === 'cannot_verify' ? 'Cannot verify' :
                              'Incomplete'
                            }
                            size="small"
                            color={
                              cookieBannerResult.consentSetupStatus === 'correct' ? 'success' :
                              cookieBannerResult.consentSetupStatus === 'not_configured' ? 'error' :
                              cookieBannerResult.consentSetupStatus === 'cannot_verify' ? 'info' : 'warning'
                            }
                            sx={{ fontWeight: 600 }}
                          />
                        </Stack>

                        {cookieBannerResult.consentModeVersion && (
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">Version:</Typography>
                            <Chip
                              label={cookieBannerResult.consentModeVersion === 'v2' ? 'V2 (Google Ads Mode)' : cookieBannerResult.consentModeVersion === 'v1' ? 'V1 (Basic)' : 'Unknown'}
                              size="small"
                              color={cookieBannerResult.consentModeVersion === 'v2' ? 'success' : cookieBannerResult.consentModeVersion === 'v1' ? 'warning' : 'default'}
                              variant="outlined"
                            />
                            {cookieBannerResult.consentModeVersion === 'v1' && (
                              <Typography variant="caption" color="warning.main">
                                (Upgrade to V2 recommended for Google Ads)
                              </Typography>
                            )}
                          </Stack>
                        )}

                        {cookieBannerResult.consentModeConfig && (
                          <Stack direction="row" flexWrap="wrap" spacing={0.5} useFlexGap>
                            {cookieBannerResult.consentModeConfig.hasDefaultConsent && <Chip label="default()" size="small" color="success" variant="outlined" />}
                            {cookieBannerResult.consentModeConfig.hasUpdateConsent && <Chip label="update()" size="small" color="success" variant="outlined" />}
                            {cookieBannerResult.consentModeConfig.hasWaitForUpdate && <Chip label="wait_for_update" size="small" variant="outlined" />}
                            {cookieBannerResult.consentModeConfig.detectedRegions.length > 0 && (
                              <Chip label={`Regions: ${cookieBannerResult.consentModeConfig.detectedRegions.join(', ')}`} size="small" variant="outlined" />
                            )}
                          </Stack>
                        )}

                        {cookieBannerResult.consentIssues && cookieBannerResult.consentIssues.length > 0 && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary">
                              Notes:
                            </Typography>
                            <List dense disablePadding>
                              {cookieBannerResult.consentIssues.map((issue, i) => (
                                <ListItem key={i} dense disableGutters sx={{ py: 0.25 }}>
                                  <ListItemIcon sx={{ minWidth: 24 }}>
                                    {issue.toLowerCase().includes('critical') ? (
                                      <ErrorIcon color="error" sx={{ fontSize: 14 }} />
                                    ) : issue.toLowerCase().includes('warning') || issue.toLowerCase().includes('missing') ? (
                                      <WarningIcon color="warning" sx={{ fontSize: 14 }} />
                                    ) : issue.toLowerCase().includes('correct') || issue.toLowerCase().includes('blocked') ? (
                                      <CheckCircleIcon color="success" sx={{ fontSize: 14 }} />
                                    ) : (
                                      <InfoIcon color="info" sx={{ fontSize: 14 }} />
                                    )}
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={issue}
                                    primaryTypographyProps={{ variant: 'caption', component: 'div' }}
                                  />
                                </ListItem>
                              ))}
                            </List>
                          </Box>
                        )}
                      </Paper>
                    )}

                    {cookieBannerResult.networkConsent && (
                      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default', border: '2px solid', borderColor: 'primary.main' }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                          <BarChartIcon fontSize="small" color="primary" />
                          <Typography variant="subtitle2" fontWeight={600}>
                            Network Consent Mode (GA4 Requests)
                          </Typography>
                          <Chip
                            label={`${cookieBannerResult.networkConsent.hits_seen} GA4 Hits`}
                            size="small"
                            color="info"
                            variant="outlined"
                          />
                        </Stack>

                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                          <Chip
                            label={
                              cookieBannerResult.networkConsent.mode === 'consent_mode_v2' ? 'Consent Mode V2' :
                              cookieBannerResult.networkConsent.mode === 'consent_mode_v1' ? 'Consent Mode V1' :
                              cookieBannerResult.networkConsent.mode === 'no_consent_mode' ? 'No Consent Mode' :
                              'Unknown'
                            }
                            size="small"
                            color={
                              cookieBannerResult.networkConsent.mode === 'consent_mode_v2' ? 'success' :
                              cookieBannerResult.networkConsent.mode === 'no_consent_mode' ? 'error' :
                              cookieBannerResult.networkConsent.mode === 'consent_mode_v1' ? 'warning' : 'default'
                            }
                            sx={{ fontWeight: 600 }}
                          />
                          <Chip
                            label={`${Math.round(cookieBannerResult.networkConsent.confidence * 100)}% Confidence`}
                            size="small"
                            variant="outlined"
                          />
                        </Stack>

                        {cookieBannerResult.networkConsent.measurement_id && (
                          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            Measurement ID: {cookieBannerResult.networkConsent.measurement_id}
                          </Typography>
                        )}

                        <Grid container spacing={1} sx={{ mb: 1 }}>
                          <Grid item xs={6} sm={3}>
                            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="caption" color="text.secondary">ad_storage</Typography>
                              <Box>
                                <Chip
                                  label={cookieBannerResult.networkConsent.ad_storage}
                                  size="small"
                                  color={cookieBannerResult.networkConsent.ad_storage === 'granted' ? 'success' : cookieBannerResult.networkConsent.ad_storage === 'denied' ? 'error' : 'default'}
                                />
                              </Box>
                            </Paper>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="caption" color="text.secondary">analytics_storage</Typography>
                              <Box>
                                <Chip
                                  label={cookieBannerResult.networkConsent.analytics_storage}
                                  size="small"
                                  color={cookieBannerResult.networkConsent.analytics_storage === 'granted' ? 'success' : cookieBannerResult.networkConsent.analytics_storage === 'denied' ? 'error' : 'default'}
                                />
                              </Box>
                            </Paper>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="caption" color="text.secondary">ad_user_data</Typography>
                              <Box>
                                <Chip
                                  label={cookieBannerResult.networkConsent.ad_user_data}
                                  size="small"
                                  color={cookieBannerResult.networkConsent.ad_user_data === 'granted' ? 'success' : cookieBannerResult.networkConsent.ad_user_data === 'denied' ? 'error' : 'default'}
                                />
                              </Box>
                            </Paper>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Paper variant="outlined" sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="caption" color="text.secondary">ad_personalization</Typography>
                              <Box>
                                <Chip
                                  label={cookieBannerResult.networkConsent.ad_personalization}
                                  size="small"
                                  color={cookieBannerResult.networkConsent.ad_personalization === 'granted' ? 'success' : cookieBannerResult.networkConsent.ad_personalization === 'denied' ? 'error' : 'default'}
                                />
                              </Box>
                            </Paper>
                          </Grid>
                        </Grid>

                        {cookieBannerResult.networkConsent.evidence.gcs && (
                          <Box sx={{ mb: 1 }}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary">Evidence:</Typography>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                              {cookieBannerResult.networkConsent.evidence.gcs && (
                                <Chip label={`gcs: ${cookieBannerResult.networkConsent.evidence.gcs}`} size="small" variant="outlined" color="primary" />
                              )}
                              {cookieBannerResult.networkConsent.evidence.gcd && (
                                <Chip label={`gcd: ${cookieBannerResult.networkConsent.evidence.gcd.substring(0, 15)}...`} size="small" variant="outlined" />
                              )}
                              {cookieBannerResult.networkConsent.evidence.npa && (
                                <Chip label={`npa: ${cookieBannerResult.networkConsent.evidence.npa}`} size="small" variant="outlined" />
                              )}
                              {cookieBannerResult.networkConsent.evidence.event_name && (
                                <Chip label={`event: ${cookieBannerResult.networkConsent.evidence.event_name}`} size="small" variant="outlined" />
                              )}
                            </Stack>
                          </Box>
                        )}

                        {cookieBannerResult.networkConsent.reasons.length > 0 && (
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary">Analysis:</Typography>
                            <List dense disablePadding>
                              {cookieBannerResult.networkConsent.reasons.map((reason, i) => (
                                <ListItem key={i} dense disableGutters sx={{ py: 0.25 }}>
                                  <ListItemIcon sx={{ minWidth: 24 }}>
                                    {reason.toLowerCase().includes('critical') ? (
                                      <ErrorIcon color="error" sx={{ fontSize: 14 }} />
                                    ) : reason.toLowerCase().includes('no consent') ? (
                                      <WarningIcon color="error" sx={{ fontSize: 14 }} />
                                    ) : (
                                      <CheckCircleIcon color="success" sx={{ fontSize: 14 }} />
                                    )}
                                  </ListItemIcon>
                                  <ListItemText primary={reason} primaryTypographyProps={{ variant: "caption", component: "div" }} />
                                </ListItem>
                              ))}
                            </List>
                          </Box>
                        )}
                      </Paper>
                    )}

                    {cookieBannerResult.gtmGaLoadingBehavior && cookieBannerResult.gtmGaLoadingBehavior !== 'unknown' && (
                      <Typography variant="caption" color="text.secondary">
                        {cookieBannerResult.gtmGaLoadingBehavior === 'loaded_with_consent_mode' &&
                          'GTM/GA is loaded with Consent Mode (blocked until consent)'}
                        {cookieBannerResult.gtmGaLoadingBehavior === 'loaded_without_consent' &&
                          'GTM/GA is loaded without consent mechanism (potential privacy violation)'}
                        {cookieBannerResult.gtmGaLoadingBehavior === 'blocked' &&
                          'GTM/GA is blocked by consent banner'}
                      </Typography>
                    )}

                    {cookieBannerResult.detectedElements && cookieBannerResult.detectedElements.length > 0 && (
                      <Box>
                        <Typography variant="caption" fontWeight={600} color="text.secondary">
                          Detection Details:
                        </Typography>
                        <Box sx={{ mt: 0.5, pl: 1 }}>
                          {cookieBannerResult.detectedElements.map((el, i) => (
                            <Typography key={i} variant="caption" color="text.secondary" display="block">
                              {el}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {(cookieBannerResult.gtmCode || cookieBannerResult.gaCode || cookieBannerResult.consentModeCode || cookieBannerResult.bannerCode) && (
                      <Stack spacing={1}>
                        {[
                          { label: 'GTM Code', code: cookieBannerResult.gtmCode },
                          { label: 'GA Code', code: cookieBannerResult.gaCode },
                          { label: 'Consent Mode Code', code: cookieBannerResult.consentModeCode },
                          { label: 'Banner HTML', code: cookieBannerResult.bannerCode },
                        ].filter(s => s.code).map(({ label, code }) => (
                          <Box key={label}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary">{label}:</Typography>
                            <Paper variant="outlined" sx={{ p: 1, mt: 0.5, bgcolor: 'grey.50', maxHeight: 80, overflow: 'auto', borderRadius: 1 }}>
                              <Typography variant="caption" component="pre" sx={{ fontSize: '0.65rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}>
                                {code}
                              </Typography>
                            </Paper>
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Alert>
              </Box>
            )}
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={600}>
                Test Results
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <Select
                    value={resultFilter}
                    onChange={(e) => setResultFilter(e.target.value)}
                    displayEmpty
                    startAdornment={<FilterIcon sx={{ mr: 0.5, fontSize: 18, color: 'text.secondary' }} />}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="success">Successful</MenuItem>
                    <MenuItem value="warning">Warnings</MenuItem>
                    <MenuItem value="error">Errors</MenuItem>
                  </Select>
                </FormControl>
                <Tooltip title="Refresh">
                  <IconButton onClick={() => loadTestHistory()} size="small">
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            {filteredResults.length === 0 ? (
              <EmptyState
                icon={<AssessmentIcon sx={{ fontSize: 60 }} />}
                title={testResults.length === 0 ? 'No tests yet' : 'No results'}
                description={testResults.length === 0
                  ? 'Run your first test to see results.'
                  : 'No test result matches the current filter.'}
              />
            ) : (
              <Stack spacing={1.5}>
                {filteredResults.map((result) => (
                  <Paper
                    key={result.id}
                    variant="outlined"
                    onClick={() => loadEventDetails(result)}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      borderRadius: 2,
                      transition: 'all 0.15s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.02),
                        transform: 'translateY(-1px)',
                        boxShadow: 1,
                      },
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <StatusChip status={result.status} />
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {result.testType.charAt(0).toUpperCase() + result.testType.slice(1)} Test
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(result.startDate), 'dd.MM.yy')} - {format(new Date(result.endDate), 'dd.MM.yy')}
                          </Typography>
                        </Box>
                      </Stack>
                      <Stack alignItems="flex-end">
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <TimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(result.createdAt), 'dd.MM.yy HH:mm')}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Grid container spacing={2}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Events</Typography>
                        <Typography variant="body1" fontWeight={600}>{result.totalEvents.toLocaleString()}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Comparison</Typography>
                        <Typography variant="body1" fontWeight={600}>{result.comparisonTotalEvents.toLocaleString()}</Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Change</Typography>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {result.percentChange >= 0 ? (
                            <TrendingUpIcon color="success" sx={{ fontSize: 18 }} />
                          ) : (
                            <TrendingDownIcon color="error" sx={{ fontSize: 18 }} />
                          )}
                          <Typography variant="body1" fontWeight={600} color={result.percentChange >= 0 ? 'success.main' : 'error.main'}>
                            {result.percentChange >= 0 ? '+' : ''}{result.percentChange.toFixed(1)}%
                          </Typography>
                        </Stack>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Anomalies</Typography>
                        <Typography variant="body1" fontWeight={600} color={result.anomalyCount > 0 ? 'warning.main' : 'text.primary'}>
                          {result.anomalyCount}
                        </Typography>
                      </Grid>
                    </Grid>

                    {result.errorMessage && (
                      <Alert severity="error" sx={{ mt: 1.5, py: 0 }} variant="outlined">
                        <Typography variant="caption">{result.errorMessage}</Typography>
                      </Alert>
                    )}
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      )}

      {currentTab === 1 && (
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <EventMonitor key={selectedProperty} propertyId={selectedProperty} />
        </Paper>
      )}

      {currentTab === 2 && (
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <AccountManager onAccountSwitched={loadProperties} />
        </Paper>
      )}

      <Dialog
        open={eventDetailsDialog.open}
        onClose={() => setEventDetailsDialog(prev => ({ ...prev, open: false }))}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <EventIcon color="primary" />
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Event Details
              </Typography>
              {eventDetailsDialog.testResult && (
                <Typography variant="caption" color="text.secondary">
                  {eventDetailsDialog.testResult.testType.charAt(0).toUpperCase() + eventDetailsDialog.testResult.testType.slice(1)} Test
                  {' | '}
                  {format(new Date(eventDetailsDialog.testResult.startDate), 'dd.MM.yy')} - {format(new Date(eventDetailsDialog.testResult.endDate), 'dd.MM.yy')}
                  {' | '}
                  Run #{eventDetailsDialog.testResult.id}
                </Typography>
              )}
            </Box>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {eventDetailsDialog.loading ? (
            <Stack spacing={1.5} sx={{ py: 2 }}>
              {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="rounded" height={50} />)}
            </Stack>
          ) : (
            <Stack spacing={2.5}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">Total Events</Typography>
                    <Typography variant="h6" fontWeight={600}>{eventDetailsDialog.eventDetails.length}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">Anomalies</Typography>
                    <Typography variant="h6" fontWeight={600} color="warning.main">
                      {eventDetailsDialog.eventDetails.filter(d => d.isAnomaly).length}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="caption" color="text.secondary">Missing Events</Typography>
                    <Typography variant="h6" fontWeight={600} color="error.main">
                      {eventDetailsDialog.eventDetails.filter(d => d.eventCount === 0 && d.comparisonCount > 0).length}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              {eventDetailsDialog.eventDetails.filter(d => d.isAnomaly).length > 0 && (
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                    Anomalies ({eventDetailsDialog.eventDetails.filter(d => d.isAnomaly).length})
                  </Typography>
                  <List disablePadding>
                    {eventDetailsDialog.eventDetails.filter(d => d.isAnomaly).map((detail) => (
                      <ListItem
                        key={detail.id}
                        sx={{ bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08), borderRadius: 2, mb: 0.5, border: 1, borderColor: 'warning.light' }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <WarningIcon color="warning" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={detail.eventName}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 600, component: 'div' }}
                          secondary={
                            <Box>
                              <Typography variant="caption">
                                {detail.eventCount} events (previous: {detail.comparisonCount}) = {detail.percentChange >= 0 ? '+' : ''}{detail.percentChange.toFixed(1)}%
                              </Typography>
                              {detail.anomalyReason && (
                                <Typography variant="caption" display="block" color="text.secondary">
                                  {detail.anomalyReason}
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {eventDetailsDialog.eventDetails.filter(d => d.eventCount === 0 && d.comparisonCount > 0).length > 0 && (
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                    Missing Events ({eventDetailsDialog.eventDetails.filter(d => d.eventCount === 0 && d.comparisonCount > 0).length})
                  </Typography>
                  <List disablePadding>
                    {eventDetailsDialog.eventDetails.filter(d => d.eventCount === 0 && d.comparisonCount > 0).map((detail) => (
                      <ListItem
                        key={detail.id}
                        sx={{ bgcolor: (theme) => alpha(theme.palette.error.main, 0.06), borderRadius: 2, mb: 0.5, border: 1, borderColor: 'error.light' }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <ErrorIcon color="error" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={detail.eventName}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 600, component: 'div' }}
                          secondary={`No longer triggered (previously: ${detail.comparisonCount} events)`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {eventDetailsDialog.eventDetails.filter(d => !d.isAnomaly && d.eventCount > 0).length > 0 && (
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                    Normal Events ({eventDetailsDialog.eventDetails.filter(d => !d.isAnomaly && d.eventCount > 0).length})
                  </Typography>
                  <List disablePadding sx={{ maxHeight: 300, overflow: 'auto' }}>
                    {eventDetailsDialog.eventDetails.filter(d => !d.isAnomaly && d.eventCount > 0).map((detail) => (
                      <ListItem key={detail.id} dense sx={{ py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={detail.eventName}
                          primaryTypographyProps={{ variant: 'body2', component: 'div' }}
                          secondary={`${detail.eventCount.toLocaleString()} events (${detail.percentChange >= 0 ? '+' : ''}${detail.percentChange.toFixed(1)}%)`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {eventDetailsDialog.eventDetails.length === 0 && (
                <EmptyState
                  icon={<InfoIcon sx={{ fontSize: 48 }} />}
                  title="No Event Details"
                  description="No event details available for this test."
                />
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEventDetailsDialog(prev => ({ ...prev, open: false }))} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
