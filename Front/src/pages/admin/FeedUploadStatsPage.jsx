import { useState, useEffect } from 'react';
import {
  Box, Typography, Container, Paper, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Select, MenuItem,
} from '@mui/material';
import api from '../../lib/api';

const todayStr = () => new Date().toISOString().slice(0, 10);
const currentMonthStr = () => new Date().toISOString().slice(0, 7);

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = String(new Date(y, m, 0).getDate()).padStart(2, '0');
  return { first: `${ym}-01`, last: `${ym}-${last}` };
}

// Sellers with a higher monthly quota (US only)
const HIGH_QUOTA_SELLERS = ['truxi', 'raveoli_cart', 'techmania'];

// Country-based quotas
const COUNTRY_QUOTAS = {
  US: { high: 25000, normal: 9000 },
  UK: { high: 100000, normal: 100000 },  // 1 lakh
  AU: { high: 250000, normal: 250000 },  // 2.5 lakh
  Canada: { high: null, normal: null },   // Not yet defined
};

const getQuota = (sellerName, country = 'US') => {
  const quotas = COUNTRY_QUOTAS[country] || COUNTRY_QUOTAS.US;
  const isHighQuota = HIGH_QUOTA_SELLERS.includes((sellerName || '').toLowerCase());
  return isHighQuota ? quotas.high : quotas.normal;
};

export default function FeedUploadStatsPage() {
  const [dayDate, setDayDate] = useState(todayStr);
  const [dayStats, setDayStats] = useState([]);
  const [dayLoading, setDayLoading] = useState(true);
  const [dayError, setDayError] = useState(null);
  const [dayCountry, setDayCountry] = useState('ALL');

  const [monthPicker, setMonthPicker] = useState(currentMonthStr);
  const [monthStats, setMonthStats] = useState([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState(null);
  const [monthCountry, setMonthCountry] = useState('US');

  const fetchDay = async (date, country) => {
    try {
      setDayLoading(true);
      setDayError(null);
      const params = { startDate: date, endDate: date };
      if (country !== 'ALL') params.country = country;
      const { data } = await api.get('/ebay/feed/upload-stats', { params });
      setDayStats([...data].sort((a, b) => (b.totalSuccess || 0) - (a.totalSuccess || 0)));
    } catch (err) {
      setDayError(err.response?.data?.error || 'Failed to fetch data');
    } finally {
      setDayLoading(false);
    }
  };

  const fetchMonth = async (ym, country) => {
    try {
      setMonthLoading(true);
      setMonthError(null);
      const { first, last } = monthBounds(ym);
      const params = { startDate: first, endDate: last };
      if (country !== 'ALL') params.country = country;
      const { data } = await api.get('/ebay/feed/upload-stats', { params });
      const map = {};
      data.forEach((r) => {
        // Group by sellerName to handle duplicate seller accounts
        if (!map[r.sellerName])
          map[r.sellerName] = { sellerId: r.sellerId, sellerName: r.sellerName, totalSuccess: 0 };
        map[r.sellerName].totalSuccess += r.totalSuccess || 0;
      });
      setMonthStats(
        Object.values(map)
          .sort((a, b) => b.totalSuccess - a.totalSuccess)
      );
    } catch (err) {
      setMonthError(err.response?.data?.error || 'Failed to fetch data');
    } finally {
      setMonthLoading(false);
    }
  };

  useEffect(() => { fetchDay(todayStr(), dayCountry); }, []);
  useEffect(() => { fetchMonth(currentMonthStr(), monthCountry); }, []);

  // Refetch when country filters change
  useEffect(() => {
    fetchDay(dayDate, dayCountry);
  }, [dayCountry]);

  useEffect(() => {
    fetchMonth(monthPicker, monthCountry);
  }, [monthCountry]);

  const dayTotal = dayStats.reduce((s, r) => s + (r.totalSuccess || 0), 0);
  const monthTotal = monthStats.reduce((s, r) => s + (r.totalSuccess || 0), 0);

  const headSx = {
    fontWeight: 700,
    bgcolor: '#f0f0f0',
    fontSize: '0.85rem',
    py: 1.8,
    borderBottom: '2px solid #d0d0d0',
  };
  const cellSx = { py: 1.6, fontSize: '0.9rem' };
  const numCellSx = { py: 1.6, fontSize: '0.9rem', fontWeight: 600, minWidth: 140 };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Feed Upload Success Stats
      </Typography>

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {/* ── Day-wise ─────────────────────────────────────────────────── */}
        <Paper sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} fontSize="1rem">Day-wise</Typography>
            <Select
              size="small"
              value={dayCountry}
              onChange={(e) => setDayCountry(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="ALL">All Countries</MenuItem>
              <MenuItem value="US">US</MenuItem>
              <MenuItem value="UK">UK</MenuItem>
              <MenuItem value="AU">AU</MenuItem>
              <MenuItem value="Canada">Canada</MenuItem>
            </Select>
            <TextField
              type="date"
              size="small"
              value={dayDate}
              onChange={(e) => { setDayDate(e.target.value); fetchDay(e.target.value, dayCountry); }}
              InputLabelProps={{ shrink: true }}
              sx={{ ml: 'auto', width: 170 }}
            />
          </Box>

          {dayLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : dayError ? (
            <Alert severity="error" sx={{ m: 2 }}>{dayError}</Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...headSx, width: 52, pl: 3 }}>#</TableCell>
                    <TableCell sx={headSx}>Seller</TableCell>
                    <TableCell sx={headSx}>Country</TableCell>
                    <TableCell sx={{ ...headSx, pr: 3 }} align="right">Successful Listings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dayStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary', fontSize: '0.9rem' }}>
                        No data for this date
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {dayStats.map((row, idx) => (
                        <TableRow
                          key={`d-${row.sellerId}-${idx}`}
                          hover
                          sx={{ bgcolor: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                        >
                          <TableCell sx={{ ...cellSx, color: 'text.disabled', width: 52, pl: 3 }}>{idx + 1}</TableCell>
                          <TableCell sx={cellSx}>{row.sellerName}</TableCell>
                          <TableCell sx={cellSx}>{row.country || 'US'}</TableCell>
                          <TableCell align="right" sx={{ ...numCellSx, pr: 3 }}>
                            {row.totalSuccess.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ bgcolor: '#f5f5f5', borderTop: '2px solid #e0e0e0' }}>
                        <TableCell colSpan={3} sx={{ fontWeight: 700, fontSize: '0.9rem', pl: 3, py: 1.6 }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.9rem', pr: 3, py: 1.6 }}>
                          {dayTotal.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>

        {/* ── Month-wise ───────────────────────────────────────────────── */}
        <Paper sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} fontSize="1rem">Month-wise</Typography>
            <Select
              size="small"
              value={monthCountry}
              onChange={(e) => setMonthCountry(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="US">US</MenuItem>
              <MenuItem value="UK">UK</MenuItem>
              <MenuItem value="AU">AU</MenuItem>
              <MenuItem value="Canada">Canada</MenuItem>
            </Select>
            <TextField
              type="month"
              size="small"
              value={monthPicker}
              onChange={(e) => { setMonthPicker(e.target.value); fetchMonth(e.target.value, monthCountry); }}
              InputLabelProps={{ shrink: true }}
              sx={{ ml: 'auto', width: 190 }}
            />
          </Box>

          {monthLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : monthError ? (
            <Alert severity="error" sx={{ m: 2 }}>{monthError}</Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...headSx, width: 52, pl: 3 }}>#</TableCell>
                    <TableCell sx={headSx}>Seller</TableCell>
                    <TableCell sx={{ ...headSx, pr: 3 }} align="right">Successful Listings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {monthStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary', fontSize: '0.9rem' }}>
                        No data for this month
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {monthStats.map((row, idx) => {
                        const quota = getQuota(row.sellerName, monthCountry);
                        return (
                          <TableRow
                            key={`m-${row.sellerId}-${idx}`}
                            hover
                            sx={{ bgcolor: idx % 2 === 0 ? '#fff' : '#fafafa' }}
                          >
                            <TableCell sx={{ ...cellSx, color: 'text.disabled', width: 52, pl: 3 }}>{idx + 1}</TableCell>
                            <TableCell sx={cellSx}>{row.sellerName}</TableCell>
                            <TableCell align="right" sx={{ ...numCellSx, pr: 3 }}>
                              {row.totalSuccess.toLocaleString()}
                              {quota && (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: 'text.secondary', ml: 0.5, fontWeight: 400 }}>
                                  / {quota.toLocaleString()}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow sx={{ bgcolor: '#f5f5f5', borderTop: '2px solid #e0e0e0' }}>
                        <TableCell colSpan={2} sx={{ fontWeight: 700, fontSize: '0.9rem', pl: 3, py: 1.6 }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.9rem', pr: 3, py: 1.6 }}>
                          {monthTotal.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </Container>
  );
}