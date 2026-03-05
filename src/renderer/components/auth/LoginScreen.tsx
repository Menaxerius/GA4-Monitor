import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Link,
} from '@mui/material';
import { Google } from '@mui/icons-material';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    // Check if already authenticated
    const checkAuth = async () => {
      try {
        const response = await window.electronAPI.auth.getState();
        if (response.data?.isAuthenticated) {
          onLoginSuccess();
        }
      } catch (error) {
        console.error('Failed to check auth status:', error);
      }
    };
    checkAuth();
  }, [onLoginSuccess]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.auth.login();

      if (response.success) {
        // Login initiated, browser should open
        // Poll for auth status change more frequently
        let pollAttempts = 0;
        const maxPollAttempts = 90; // 90 seconds = 1.5 minutes
        const pollInterval = setInterval(async () => {
          pollAttempts++;

          try {
            console.log(`Polling auth status... Attempt ${pollAttempts}/${maxPollAttempts}`);
            const authResponse = await window.electronAPI.auth.getState();

            console.log('Auth response:', authResponse);

            if (authResponse.data?.isAuthenticated) {
              console.log('User authenticated! Stopping polling.');
              clearInterval(pollInterval);
              setLoading(false);
              onLoginSuccess();
            } else if (pollAttempts >= maxPollAttempts) {
              console.log('Max polling attempts reached');
              clearInterval(pollInterval);
              setLoading(false);
              setError('Login timeout. Please try again.');
            }
          } catch (error) {
            console.error('Failed to poll auth status:', error);
          }
        }, 1000); // Poll every 1 second instead of 2
      } else {
        setError(response.error || 'Login failed');
        setLoading(false);
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={3}
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Typography component="h1" variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
            GA4 Monitor
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, textAlign: 'center' }}>
            Automated Monitoring for Google Analytics 4
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 3 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <CircularProgress size={60} />
              <Typography variant="body1" sx={{ mt: 3 }}>
                Please sign in in the opened browser...
              </Typography>
            </Box>
          ) : (
            <>
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<Google />}
                onClick={handleLogin}
                sx={{
                  py: 1.5,
                  mb: 2,
                  bgcolor: '#4285f4',
                  '&:hover': {
                    bgcolor: '#3367d6',
                  },
                }}
              >
                Sign in with Google
              </Button>

              <Divider sx={{ width: '100%', my: 3 }}>or</Divider>

              <Button
                variant="outlined"
                size="large"
                fullWidth
                onClick={() => setShowConfig(!showConfig)}
              >
                {showConfig ? 'Hide Configuration' : 'Show Configuration'}
              </Button>

              {showConfig && (
                <Box sx={{ width: '100%', mt: 3 }}>
                  <TextField
                    fullWidth
                    label="Google Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="your-client-id.apps.googleusercontent.com"
                    sx={{ mb: 2 }}
                    helperText="Required for development"
                  />
                  <Alert severity="info" sx={{ mt: 2 }}>
                    To use Google OAuth, you need to create a project in the Google Cloud Console
                    and configure OAuth2 credentials.
                  </Alert>
                </Box>
              )}

              <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  By signing in, you agree to our{' '}
                  <Link href="#" underline="hover">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="#" underline="hover">
                    Privacy Policy
                  </Link>
                  .
                </Typography>
              </Box>
            </>
          )}
        </Paper>

        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Version 1.0.0 • Built with ❤️
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default LoginScreen;
