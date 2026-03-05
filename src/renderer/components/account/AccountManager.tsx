import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  AccountCircle as AccountIcon,
  Check as CheckIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface Account {
  email: string;
  createdAt: string;
  lastUsed: string;
}

interface AccountManagerProps {
  onAccountSwitched?: () => void;
}

const AccountManager: React.FC<AccountManagerProps> = ({ onAccountSwitched }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccountEmail, setCurrentAccountEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.auth.getState();

      if (response.success) {
        setAccounts(response.data.accounts || []);
        setCurrentAccountEmail(response.data.currentAccountEmail || null);
      } else {
        setError(response.error || 'Failed to load accounts');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleAddAccount = async () => {
    setError(null);

    try {
      const response = await window.electronAPI.auth.login();

      if (response.success) {
        // The auth.service automatically opens the system default browser
        // No need to use window.open() which would open inside Electron

        // Poll for account addition
        const checkInterval = setInterval(async () => {
          const stateResponse = await window.electronAPI.auth.getState();
          if (stateResponse.success) {
            const newCount = stateResponse.data.accounts?.length || 0;
            if (newCount > accounts.length) {
              clearInterval(checkInterval);
              await loadAccounts();
              if (onAccountSwitched) {
                onAccountSwitched();
              }
            }
          }
        }, 2000);

        // Stop polling after 2 minutes
        setTimeout(() => clearInterval(checkInterval), 120000);
      } else {
        setError(response.error || 'Failed to start login process');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start login process');
    }
  };

  const handleSwitchAccount = async (email: string) => {
    if (email === currentAccountEmail) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.accounts.switch(email);

      if (response.success) {
        await loadAccounts();
        if (onAccountSwitched) {
          onAccountSwitched();
        }
      } else {
        setError(response.error || 'Failed to switch account');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to switch account');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (email: string) => {
    setAccountToDelete(email);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) {
      return;
    }

    setDeleteDialogOpen(false);
    setLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.accounts.remove(accountToDelete);

      if (response.success) {
        await loadAccounts();
        if (onAccountSwitched) {
          onAccountSwitched();
        }
      } else {
        setError(response.error || 'Failed to delete account');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
    } finally {
      setLoading(false);
      setAccountToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setAccountToDelete(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Manage Google Accounts</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={loadAccounts}
            disabled={loading}
            size="small"
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddAccount}
            disabled={loading}
            size="small"
          >
            Add Account
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper>
        {loading && accounts.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : accounts.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <AccountIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              No accounts available. Add your first Google account.
            </Typography>
          </Box>
        ) : (
          <List>
            {accounts.map((account, index) => {
              const isCurrent = account.email === currentAccountEmail;

              return (
                <React.Fragment key={account.email}>
                  <ListItem
                    disablePadding
                    secondaryAction={
                      <IconButton
                        edge="end"
                        onClick={() => handleDeleteClick(account.email)}
                        disabled={loading || accounts.length === 1}
                        title="Delete account"
                      >
                        <DeleteIcon />
                      </IconButton>
                    }
                  >
                    <ListItemButton
                      onClick={() => handleSwitchAccount(account.email)}
                      disabled={loading || isCurrent}
                      selected={isCurrent}
                    >
                      <ListItemIcon>
                        <AccountIcon color={isCurrent ? 'primary' : 'inherit'} />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: isCurrent ? 'bold' : 'normal' }}>
                              {account.email}
                            </Typography>
                            {isCurrent && (
                              <Chip
                                label="Active"
                                color="primary"
                                size="small"
                                icon={<CheckIcon />}
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography variant="body2" color="text.secondary">
                            Last used: {formatDate(account.lastUsed)}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                  {index < accounts.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete Account?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the account <strong>{accountToDelete}</strong>?
            {accountToDelete === currentAccountEmail && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                You are deleting the current account. It will automatically switch to another account.
              </Alert>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            disabled={loading}
            autoFocus
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Info Alert */}
      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          After adding a new account, a browser window will open. Sign in with the
          desired Google account and grant the permissions. The application will automatically
          update.
        </Typography>
      </Alert>
    </Box>
  );
};

export default AccountManager;
