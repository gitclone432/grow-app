import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  Paper,
  Stack
} from '@mui/material';
import {
  Person as PersonIcon,
  Search as SearchIcon,
  ArrowForward as ArrowForwardIcon
} from '@mui/icons-material';
import api from '../../lib/api';

export default function SelectSellerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const templateId = searchParams.get('templateId');

  const [sellers, setSellers] = useState([]);
  const [filteredSellers, setFilteredSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchSellers();
  }, []);

  useEffect(() => {
    // Filter sellers based on search query
    if (searchQuery.trim() === '') {
      setFilteredSellers(sellers);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = sellers.filter(seller => {
        const username = seller.user?.username?.toLowerCase() || '';
        const email = seller.user?.email?.toLowerCase() || '';
        return username.includes(query) || email.includes(query);
      });
      setFilteredSellers(filtered);
    }
  }, [searchQuery, sellers]);

  const fetchSellers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/sellers/all');
      setSellers(data || []);
      setFilteredSellers(data || []);
    } catch (err) {
      console.error('Error fetching sellers:', err);
      setError('Failed to fetch sellers');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSeller = (sellerId) => {
    if (returnTo === 'template-listings' && templateId) {
      // Direct navigation if coming from template management
      navigate(`/admin/template-listings?templateId=${templateId}&sellerId=${sellerId}`);
    } else {
      // Normal flow - go to seller's templates
      navigate(`/admin/seller-templates?sellerId=${sellerId}`);
    }
  };

  const getSellerDisplayName = (seller) => {
    return seller.user?.username || seller.user?.email || 'Unknown Seller';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Select Seller
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Search Bar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search sellers by username or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {filteredSellers.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <PersonIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {searchQuery ? 'No sellers found matching your search' : 'No sellers available'}
          </Typography>
          {searchQuery && (
            <Button onClick={() => setSearchQuery('')} sx={{ mt: 2 }}>
              Clear Search
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredSellers.map((seller) => (
            <Grid item xs={12} sm={6} md={4} key={seller._id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                      }}
                    >
                      {getSellerDisplayName(seller).charAt(0).toUpperCase()}
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography
                        variant="h6"
                        noWrap
                        sx={{ fontWeight: 'bold' }}
                      >
                        {getSellerDisplayName(seller)}
                      </Typography>
                      {seller.user?.email && seller.user?.username && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ display: 'block' }}
                        >
                          {seller.user.email}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                  
                  <Typography variant="body2" color="text.secondary">
                    {seller.ebayMarketplaces?.length || 0} eBay Marketplace{seller.ebayMarketplaces?.length !== 1 ? 's' : ''}
                  </Typography>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => handleSelectSeller(seller._id)}
                  >
                    View Templates
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
