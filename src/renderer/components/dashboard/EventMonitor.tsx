import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Tooltip,
  TablePagination,
  TableSortLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Star as StarIcon,
  MonetizationOn as MonetizationOnIcon,
} from '@mui/icons-material';
import { format, subDays, subYears } from 'date-fns';

const formatGA4Date = (dateString: string): string => {
  if (!dateString) return 'N/A';

  if (dateString.length === 8 && !dateString.includes('-')) {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6));
    const day = parseInt(dateString.substring(6, 8));
    const date = new Date(year, month - 1, day);
    return format(date, 'dd.MM.yyyy');
  }

  try {
    return format(new Date(dateString), 'dd.MM.yyyy');
  } catch {
    return dateString;
  }
};

type EventImportance = 'conversion' | 'key_event' | 'standard';

const KNOWN_GA4_KEY_EVENTS = [
  'add_payment_info',
  'add_shipping_info',
  'add_to_cart',
  'add_to_wishlist',
  'begin_checkout',
  'generate_lead',
  'login',
  'purchase',
  'refund',
  'remove_from_cart',
  'search',
  'select_content',
  'select_item',
  'select_promotion',
  'share',
  'sign_up',
  'view_cart',
  'view_item',
  'view_item_list',
  'view_promotion',
];

const getEventImportance = (eventName: string, conversionEventsList: string[]): EventImportance => {
  if (conversionEventsList.includes(eventName)) {
    return 'conversion';
  }

  if (KNOWN_GA4_KEY_EVENTS.includes(eventName)) {
    return 'key_event';
  }

  return 'standard';
};

const getImportanceColor = (importance: EventImportance): string => {
  switch (importance) {
    case 'conversion':
      return '#d32f2f';
    case 'key_event':
      return '#f57c00';
    default:
      return '#757575';
  }
};

const getImportanceIcon = (importance: EventImportance) => {
  switch (importance) {
    case 'conversion':
      return <MonetizationOnIcon sx={{ fontSize: 16, color: '#d32f2f' }} />;
    case 'key_event':
      return <StarIcon sx={{ fontSize: 16, color: '#f57c00' }} />;
    default:
      return null;
  }
};

interface DetailedEvent {
  eventName: string;
  eventCount: number;
  lastEventDate: string;
  lastEventDateTime: Date;
  lastEventDaysAgo: number;
  isInactive: boolean;
  trend: 'up' | 'down' | 'stable';
  percentChange: number;
  previousCount: number;
  status: 'active' | 'inactive' | 'warning';
}

interface EventMonitorProps {
  propertyId: string;
}

type Order = 'asc' | 'desc';
type DateRange = '7d' | '30d' | '90d' | '1y';

const EventMonitor: React.FC<EventMonitorProps> = ({ propertyId }) => {
  const [events, setEvents] = useState<DetailedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order>('desc');
  const [orderBy, setOrderBy] = useState<keyof DetailedEvent>('lastEventDateTime');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [conversionEvents, setConversionEvents] = useState<string[]>([]);

  useEffect(() => {
    if (propertyId) {
      loadEvents();
      loadConversionEvents();
    }
  }, [propertyId, dateRange]);

  const loadConversionEvents = async () => {
    if (!propertyId) return;

    try {
      console.log('[EventMonitor] Loading conversion events for property:', propertyId);
      const response = await window.electronAPI.events.getConversionEvents(propertyId);
      console.log('[EventMonitor] Conversion events response:', response);
      if (response && Array.isArray(response)) {
        console.log('[EventMonitor] Found conversion events:', response);
        setConversionEvents(response);
      } else if (response && (response as any).success) {
        console.log('[EventMonitor] Found conversion events:', (response as any).data);
        setConversionEvents((response as any).data || []);
      } else {
        console.error('[EventMonitor] Failed to load conversion events');
      }
    } catch (err) {
      console.error('[EventMonitor] Error loading conversion events:', err);
    }
  };

  const loadEvents = async () => {
    if (!propertyId) return;

    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      let startDate: Date;

      switch (dateRange) {
        case '7d':
          startDate = subDays(endDate, 7);
          break;
        case '30d':
          startDate = subDays(endDate, 30);
          break;
        case '90d':
          startDate = subDays(endDate, 90);
          break;
        case '1y':
          startDate = subYears(endDate, 1);
          break;
        default:
          startDate = subDays(endDate, 30);
      }

      const previousStartDate = new Date(startDate);
      const previousEndDate = new Date(endDate);
      const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      previousStartDate.setDate(previousStartDate.getDate() - diffDays);
      previousEndDate.setDate(previousEndDate.getDate() - diffDays);

      const response = await window.electronAPI.events.getDetailed(
        propertyId,
        startDate.toISOString(),
        endDate.toISOString(),
        previousStartDate.toISOString(),
        previousEndDate.toISOString()
      );

      if (response.success) {
        setEvents(response.data.events || []);
      } else {
        setError(response.error || 'Failed to load events');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSort = (property: keyof DetailedEvent) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon color="success" fontSize="small" />;
      case 'warning':
        return <WarningIcon color="warning" fontSize="small" />;
      case 'inactive':
        return <ErrorIcon color="error" fontSize="small" />;
      default:
        return null;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUpIcon color="success" fontSize="small" />;
      case 'down':
        return <TrendingDownIcon color="error" fontSize="small" />;
      case 'stable':
        return <TrendingFlatIcon color="disabled" fontSize="small" />;
      default:
        return null;
    }
  };

  const sortedEvents = React.useMemo(() => {
    return [...events].sort((a, b) => {
      let comparison = 0;
      
      if (orderBy === 'lastEventDateTime') {
        comparison = new Date(a.lastEventDateTime).getTime() - new Date(b.lastEventDateTime).getTime();
      } else if (orderBy === 'eventCount' || orderBy === 'previousCount') {
        comparison = a[orderBy] - b[orderBy];
      } else if (orderBy === 'percentChange') {
        comparison = a.percentChange - b.percentChange;
      } else if (orderBy === 'lastEventDaysAgo') {
        comparison = a.lastEventDaysAgo - b.lastEventDaysAgo;
      } else {
        comparison = (a[orderBy] as string).localeCompare(b[orderBy] as string);
      }

      return order === 'asc' ? comparison : -comparison;
    });
  }, [events, order, orderBy]);

  const paginatedEvents = sortedEvents.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (!propertyId) {
    return (
      <Alert severity="info">
        Please select a property to view event details.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '200px',
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Event Details</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={dateRange}
              label="Period"
              onChange={(e) => setDateRange(e.target.value as DateRange)}
            >
              <MenuItem value="7d">7 Days</MenuItem>
              <MenuItem value="30d">30 Days</MenuItem>
              <MenuItem value="90d">90 Days</MenuItem>
              <MenuItem value="1y">1 Year</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={loadEvents} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'eventName'}
                    direction={orderBy === 'eventName' ? order : 'asc'}
                    onClick={() => handleRequestSort('eventName')}
                  >
                    Event Name
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'eventCount'}
                    direction={orderBy === 'eventCount' ? order : 'asc'}
                    onClick={() => handleRequestSort('eventCount')}
                  >
                    Events (Period)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'previousCount'}
                    direction={orderBy === 'previousCount' ? order : 'asc'}
                    onClick={() => handleRequestSort('previousCount')}
                  >
                    Comparison Period
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">Trend</TableCell>
                <TableCell align="right">Change</TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={orderBy === 'lastEventDateTime'}
                    direction={orderBy === 'lastEventDateTime' ? order : 'asc'}
                    onClick={() => handleRequestSort('lastEventDateTime')}
                  >
                    Last Event
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={orderBy === 'lastEventDaysAgo'}
                    direction={orderBy === 'lastEventDaysAgo' ? order : 'asc'}
                    onClick={() => handleRequestSort('lastEventDaysAgo')}
                  >
                    Days Ago
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedEvents.map((event) => {
                const importance = getEventImportance(event.eventName, conversionEvents);
                return (
                <TableRow
                  key={event.eventName}
                  hover
                  sx={{
                    '&:last-child td, &:last-child th': { border: 0 },
                    bgcolor: event.isInactive ? 'error.light' :
                              importance === 'conversion' ? 'rgba(211, 47, 47, 0.05)' :
                              importance === 'key_event' ? 'rgba(245, 124, 0, 0.05)' :
                              'inherit',
                  }}
                >
                  <TableCell>
                    <Tooltip title={event.status === 'inactive' ? 'Event no longer active' : event.status === 'warning' ? 'Event inactive for over 14 days' : 'Event active'}>
                      <Box>{getStatusIcon(event.status)}</Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={
                      importance === 'conversion' ? 'Conversion Event - Important business event' :
                      importance === 'key_event' ? 'Key Event - Important engagement event' :
                      'Standard Event'
                    }>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {getImportanceIcon(importance)}
                        {importance === 'conversion' && (
                          <Chip
                            label="Conversion"
                            size="small"
                            sx={{
                              bgcolor: '#d32f2f',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        )}
                        {importance === 'key_event' && (
                          <Chip
                            label="Key Event"
                            size="small"
                            sx={{
                              bgcolor: '#f57c00',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        )}
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell component="th" scope="row">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: importance === 'conversion' ? 'bold' : importance === 'key_event' ? '600' : 'normal',
                        color: importance === 'conversion' ? '#d32f2f' : importance === 'key_event' ? '#e65100' : 'inherit',
                      }}
                    >
                      {event.eventName}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {event.eventCount.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">
                      {event.previousCount.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {getTrendIcon(event.trend)}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        color: event.percentChange > 0 ? 'success.main' : event.percentChange < 0 ? 'error.main' : 'text.primary',
                        fontWeight: 'bold',
                      }}
                    >
                      {event.percentChange >= 0 ? '+' : ''}{event.percentChange.toFixed(1)}%
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {formatGA4Date(event.lastEventDate)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={
                        event.lastEventDaysAgo === 0
                          ? 'Today'
                          : event.lastEventDaysAgo === 1
                          ? 'Yesterday'
                          : `${event.lastEventDaysAgo} days`
                      }
                      size="small"
                      color={event.lastEventDaysAgo > 30 ? 'error' : event.lastEventDaysAgo > 14 ? 'warning' : 'success'}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={events.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage="Rows per page:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
        />
      </Paper>
    </Box>
  );
};

export default EventMonitor;
