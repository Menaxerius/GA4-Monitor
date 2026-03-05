import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1565c0',
      light: '#42a5f5',
      dark: '#0d47a1',
    },
    secondary: {
      main: '#7c4dff',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
    },
    info: {
      main: '#0288d1',
    },
    background: {
      default: '#f8f9fc',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a2027',
      secondary: '#637381',
    },
    divider: '#e3e8ef',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    subtitle1: {
      fontWeight: 600,
    },
    subtitle2: {
      fontWeight: 600,
    },
    body2: {
      fontSize: '0.875rem',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.5,
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.04)',
    '0 2px 6px 0 rgba(0,0,0,0.06), 0 1px 3px -1px rgba(0,0,0,0.04)',
    '0 4px 12px 0 rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.04)',
    '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -3px rgba(0,0,0,0.04)',
    '0 8px 24px 0 rgba(0,0,0,0.09), 0 4px 8px -4px rgba(0,0,0,0.04)',
    // keep remaining slots with default-ish values
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 10px 30px rgba(0,0,0,0.1)',
    '0 20px 40px rgba(0,0,0,0.12)',
  ],
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
          border: '1px solid #e3e8ef',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        },
        outlined: {
          boxShadow: 'none',
          borderColor: '#e3e8ef',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          padding: '8px 20px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderRadius: 8,
        },
        sizeSmall: {
          height: 24,
          fontSize: '0.75rem',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 48,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: '#f8f9fc',
          color: '#637381',
          fontSize: '0.8rem',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid #e3e8ef',
          boxShadow: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        },
      },
    },
  },
});
