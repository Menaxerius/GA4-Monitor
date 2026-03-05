import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import LoginScreen from './components/auth/LoginScreen';
import Dashboard from './components/dashboard/Dashboard';
import Layout from './components/layout/Layout';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await window.electronAPI.auth.getState();
      setIsAuthenticated(response.data?.isAuthenticated || false);
    } catch (error) {
      console.error('Failed to check auth:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 3 }}>
          GA4 Monitor wird geladen...
        </Typography>
      </Box>
    );
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />
            )
          }
        />
        <Route
          path="/*"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" replace />
            ) : (
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
