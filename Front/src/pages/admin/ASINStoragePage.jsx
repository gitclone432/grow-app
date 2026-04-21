import { useState, useEffect } from 'react';
import { Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Chip, Stack, IconButton, Link as MuiLink, useMediaQuery, useTheme } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from '../../lib/api';

export default function ASINStoragePage() {
  // Mobile responsiveness (same approach as FulfillmentDashboard)
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupedBySeller, setGroupedBySeller] = useState({});

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    // Group products by seller
    const grouped = {};
    products.forEach(product => {
      const sellerName = product.sellerId?.user?.username || product.sellerId?.user?.email || 'Unassigned';
      if (!grouped[sellerName]) {
        grouped[sellerName] = [];
      }
      grouped[sellerName].push(product);
    });
    setGroupedBySeller(grouped);
  }, [products]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/amazon-lookup');
      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate SKU: GRW25 + last 5 chars of ASIN
  const generateSKU = (asin) => {
    if (!asin || asin.length < 5) return '';
    return 'GRW25' + asin.slice(-5);
  };

  // Generate Amazon link
  const generateLink = (asin) => {
    if (!asin) return '';
    return `https://www.amazon.com/dp/${asin}`;
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', lg: 'center' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Typography variant="h6">ASIN Storage</Typography>
        <Chip
          label={`${products.length} Total Products`}
          color="primary"
          variant="outlined"
          sx={{ alignSelf: { xs: 'flex-start', lg: 'auto' } }}
        />
      </Stack>

      {loading ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography>Loading products...</Typography>
        </Paper>
      ) : Object.keys(groupedBySeller).length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No products found. Add products from Amazon Lookup page.</Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {Object.entries(groupedBySeller).map(([sellerName, sellerProducts]) => (
            <Box key={sellerName}>
              <Paper sx={{ p: 2, mb: 1, bgcolor: 'primary.main', color: 'white' }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  spacing={1}
                >
                  <Typography variant="h6" fontWeight="bold">
                    {sellerName}
                  </Typography>
                  <Chip
                    label={`${sellerProducts.length} products`}
                    size="small"
                    sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 'bold' }}
                  />
                </Stack>
              </Paper>

              {/* MOBILE: Card view */}
              <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                <Stack spacing={1.5}>
                  {sellerProducts.map((product, index) => {
                    const sku = generateSKU(product.asin);
                    const link = generateLink(product.asin);

                    return (
                      <Paper key={product._id} elevation={2} sx={{ p: 2, borderRadius: 2 }}>
                        <Stack spacing={1}>
                          <Typography variant="caption" color="text.secondary">
                            #{index + 1}
                          </Typography>

                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                color: 'primary.main'
                              }}
                            >
                              {product.asin}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => handleCopy(product.asin)}
                              title="Copy ASIN"
                              color="primary"
                            >
                              <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Stack>

                          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.85rem',
                                bgcolor: 'grey.100',
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                fontWeight: 'medium'
                              }}
                            >
                              {sku}
                            </Typography>
                            <IconButton size="small" onClick={() => handleCopy(sku)} title="Copy SKU">
                              <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Stack>

                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                            <MuiLink
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              underline="hover"
                              sx={{
                                fontSize: '0.8rem',
                                fontFamily: 'monospace',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.5,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%'
                              }}
                            >
                              {link}
                              <OpenInNewIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                            </MuiLink>
                            <IconButton size="small" onClick={() => handleCopy(link)} title="Copy Link">
                              <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Stack>

                          <Typography
                            variant="body2"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: 1.3,
                              fontSize: '0.85rem'
                            }}
                          >
                            {product.title}
                          </Typography>

                          <Chip
                            label={product.productUmbrellaId?.name || 'N/A'}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.75rem', alignSelf: 'flex-start' }}
                          />
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>

              {/* DESKTOP: Table view (md+) */}
              <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                <Table size="small" sx={{ '& .MuiTableCell-root': { py: 1.5 } }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell sx={{ fontWeight: 'bold', width: 50 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: 120 }}>ASIN</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: 140 }}>SKU</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 300 }}>Link</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', minWidth: 200 }}>Product Title</TableCell>
                      <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Umbrella</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold', width: 100 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sellerProducts.map((product, index) => {
                      const sku = generateSKU(product.asin);
                      const link = generateLink(product.asin);
                      
                      return (
                        <TableRow key={product._id} hover sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" fontWeight="medium">
                              {index + 1}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontFamily: 'monospace', 
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                color: 'primary.main'
                              }}
                            >
                              {product.asin}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontFamily: 'monospace',
                                  fontSize: '0.85rem',
                                  bgcolor: 'grey.100',
                                  px: 1,
                                  py: 0.5,
                                  borderRadius: 1,
                                  fontWeight: 'medium'
                                }}
                              >
                                {sku}
                              </Typography>
                              <IconButton 
                                size="small" 
                                onClick={() => handleCopy(sku)}
                                title="Copy SKU"
                              >
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <MuiLink
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                underline="hover"
                                sx={{ 
                                  fontSize: '0.8rem',
                                  fontFamily: 'monospace',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5
                                }}
                              >
                                {link}
                                <OpenInNewIcon sx={{ fontSize: 14 }} />
                              </MuiLink>
                              <IconButton 
                                size="small" 
                                onClick={() => handleCopy(link)}
                                title="Copy Link"
                              >
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: 1.3,
                                fontSize: '0.85rem'
                              }}
                            >
                              {product.title}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={product.productUmbrellaId?.name || 'N/A'} 
                              size="small" 
                              variant="outlined"
                              sx={{ fontSize: '0.75rem' }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton 
                                size="small" 
                                onClick={() => handleCopy(product.asin)}
                                title="Copy ASIN"
                                color="primary"
                              >
                                <ContentCopyIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
