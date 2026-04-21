import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Chip,
  Grid,
  InputAdornment,
  Tabs,
  Tab,
  Divider,
  Card,
  CardContent,
  Collapse,
  IconButton
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import api from '../../lib/api';

const RangeAnalyzerPage = () => {
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  // State for eBay models
  const [activeTab, setActiveTab] = useState(0);
  const [ebayModels, setEbayModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelSearchTerm, setModelSearchTerm] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  
  // State for device models (phones/tablets)
  const [deviceModels, setDeviceModels] = useState([]);
  const [deviceModelsLoading, setDeviceModelsLoading] = useState(false);
  const [deviceSyncLoading, setDeviceSyncLoading] = useState(false);
  const [deviceSyncMessage, setDeviceSyncMessage] = useState('');
  
  // Search type for analyzer
  const [searchType, setSearchType] = useState('vehicles'); // 'vehicles' or 'devices'

  // Toggle row expansion
  const toggleRowExpand = (modelName) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(modelName)) {
        newSet.delete(modelName);
      } else {
        newSet.add(modelName);
      }
      return newSet;
    });
  };

  // Fetch eBay vehicle models on mount
  useEffect(() => {
    fetchEbayModels();
    fetchDeviceModels();
  }, []);

  const fetchEbayModels = async () => {
    setModelsLoading(true);
    try {
      const res = await api.get('/range-analysis/ebay-models');
      setEbayModels(res.data.models || []);
    } catch (err) {
      console.error('Failed to fetch eBay models:', err);
    } finally {
      setModelsLoading(false);
    }
  };
  
  const fetchDeviceModels = async () => {
    setDeviceModelsLoading(true);
    try {
      const res = await api.get('/range-analysis/device-models');
      setDeviceModels(res.data.models || []);
    } catch (err) {
      console.error('Failed to fetch device models:', err);
    } finally {
      setDeviceModelsLoading(false);
    }
  };

  const handleSyncModels = async () => {
    setSyncLoading(true);
    setSyncMessage('Syncing from eBay API... This may take a few minutes (fetching ALL makes and models)...');
    try {
      const res = await api.post('/range-analysis/sync-ebay-models');
      setSyncMessage(res.data.message);
      await fetchEbayModels(); // Refresh the list
    } catch (err) {
      setSyncMessage('Failed to sync: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncLoading(false);
    }
  };
  
  const handleSyncDeviceModels = async () => {
    setDeviceSyncLoading(true);
    setDeviceSyncMessage('Syncing Cell Phones & Tablets from eBay API...');
    try {
      const res = await api.post('/range-analysis/sync-device-models');
      setDeviceSyncMessage(res.data.message);
      await fetchDeviceModels(); // Refresh the list
    } catch (err) {
      setDeviceSyncMessage('Failed to sync: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeviceSyncLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;

    setLoading(true);
    setError('');
    setResults(null);
    setExpandedRows(new Set()); // Clear expanded rows

    try {
      const response = await api.post('/range-analysis/analyze', { 
        textToAnalyze: inputText,
        searchType: searchType 
      });
      setResults(response.data);
    } catch (err) {
      if (err.response?.data?.needsSync) {
        const syncTypeMsg = err.response?.data?.syncType === 'devices' 
          ? 'No device models in database. Click "Sync Device Models" first!'
          : 'No vehicle models in database. Click "Sync eBay Models" first!';
        setError(syncTypeMsg);
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to analyze');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter models based on search term
  const filteredModels = ebayModels.filter(model =>
    model.fullName.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
    model.make.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
    model.model.toLowerCase().includes(modelSearchTerm.toLowerCase())
  );
  
  // Filter device models based on search term
  const filteredDeviceModels = deviceModels.filter(model =>
    model.fullName.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
    (model.brand && model.brand.toLowerCase().includes(modelSearchTerm.toLowerCase()))
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon color="primary" />
        eBay Model Analyzer
      </Typography>
      
      <Typography variant="body1" sx={{ mb: 2, color: 'text.secondary' }}>
        Analyze text against eBay models database. Supports Vehicle models (eBay Motors) and Device models (Cell Phones & Tablets).
      </Typography>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab label="🤖 AI Analyzer" />
          <Tab label={`🚗 Vehicle Models (${ebayModels.length})`} />
          <Tab label={`📱 Device Models (${deviceModels.length})`} />
        </Tabs>
      </Paper>

      {/* Tab 0: AI Analyzer */}
      {activeTab === 0 && (
        <>
          {/* Search Type Toggle */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Search In:</Typography>
            <Button
              variant={searchType === 'vehicles' ? 'contained' : 'outlined'}
              onClick={() => setSearchType('vehicles')}
              sx={{ mr: 1 }}
            >
              🚗 Vehicles ({ebayModels.length})
            </Button>
            <Button
              variant={searchType === 'devices' ? 'contained' : 'outlined'}
              onClick={() => setSearchType('devices')}
            >
              📱 Phones & Tablets ({deviceModels.length})
            </Button>
          </Box>
          
          {/* Sync Buttons */}
          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={syncLoading ? <CircularProgress size={16} /> : <SyncIcon />}
              onClick={handleSyncModels}
              disabled={syncLoading}
              sx={{ mr: 2 }}
            >
              {syncLoading ? 'Syncing...' : 'Sync Vehicle Models'}
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={deviceSyncLoading ? <CircularProgress size={16} /> : <SyncIcon />}
              onClick={handleSyncDeviceModels}
              disabled={deviceSyncLoading}
              sx={{ mr: 2 }}
            >
              {deviceSyncLoading ? 'Syncing...' : 'Sync Device Models'}
            </Button>
            {syncMessage && (
              <Alert severity="info" sx={{ mt: 1 }}>{syncMessage}</Alert>
            )}
            {deviceSyncMessage && (
              <Alert severity="info" sx={{ mt: 1 }}>{deviceSyncMessage}</Alert>
            )}
          </Box>
          
          {/* Warning if no models */}
          {searchType === 'vehicles' && ebayModels.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No vehicle models in database. Click "Sync Vehicle Models" first.
            </Alert>
          )}
          {searchType === 'devices' && deviceModels.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No device models in database. Click "Sync Device Models" first.
            </Alert>
          )}

          <Paper sx={{ p: 3, mb: 3 }}>
            <TextField
              fullWidth
              multiline
              minRows={6}
              label="Paste Text Here"
              variant="outlined"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={searchType === 'devices' 
                ? "Paste product listings to analyze for phone/tablet models...\nExample: Screen Protector for iPhone 15 Pro Max\nCase for Samsung Galaxy S24 Ultra"
                : "Paste product listings to analyze for vehicle models...\nExample: Brake Pads for Honda Accord 2018-2022"
              }
              sx={{ mb: 2 }}
            />
            <Button 
              variant="contained" 
              size="large" 
              onClick={handleAnalyze} 
              disabled={loading || !inputText || (searchType === 'vehicles' ? ebayModels.length === 0 : deviceModels.length === 0)}
              startIcon={loading ? <CircularProgress size={20} color="inherit"/> : <AutoAwesomeIcon />}
            >
              {loading ? 'Analyzing...' : `Identify ${searchType === 'vehicles' ? 'Vehicle' : 'Device'} Models`}
            </Button>
          </Paper>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {results && (
            <Box>
              {/* Summary Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} md={3}>
                  <Card sx={{ bgcolor: '#e8f5e9' }}>
                    <CardContent>
                      <Typography variant="h4" color="success.main">
                        {results.uniqueModelsFound || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Unique Models Found
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Card sx={{ bgcolor: '#e3f2fd' }}>
                    <CardContent>
                      <Typography variant="h4" color="primary.main">
                        {results.totalMatchCount || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Matches
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h4" color="text.secondary">
                        {results.totalLinesAnalyzed || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Lines Analyzed
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h4" color="text.secondary">
                        {results.totalModelsInDatabase?.toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Models in Database
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Found in Database Table */}
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon color="success" />
                Found in Database
              </Typography>
              
              <TableContainer component={Paper} sx={{ mb: 4 }}>
                <Table>
                  <TableHead sx={{ bgcolor: '#e8f5e9' }}>
                    <TableRow>
                      <TableCell width={50}></TableCell>
                      <TableCell><strong>Model Name</strong></TableCell>
                      <TableCell align="right"><strong>Count</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(results.foundInDatabase || []).length > 0 ? (
                      (results.foundInDatabase || []).map((item, index) => (
                        <>
                          <TableRow 
                            key={index} 
                            hover 
                            sx={{ cursor: item.matchedRows?.length > 0 ? 'pointer' : 'default' }}
                            onClick={() => item.matchedRows?.length > 0 && toggleRowExpand(item.modelName)}
                          >
                            <TableCell>
                              {item.matchedRows?.length > 0 && (
                                <IconButton size="small">
                                  {expandedRows.has(item.modelName) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                </IconButton>
                              )}
                            </TableCell>
                            <TableCell>{item.modelName || item.rangeName}</TableCell>
                            <TableCell align="right">
                              <Chip label={item.count} color="success" size="small" />
                            </TableCell>
                          </TableRow>
                          {/* Expanded rows showing matched lines */}
                          {item.matchedRows?.length > 0 && (
                            <TableRow key={`${index}-expanded`}>
                              <TableCell colSpan={3} sx={{ py: 0, bgcolor: '#f5f5f5' }}>
                                <Collapse in={expandedRows.has(item.modelName)} timeout="auto" unmountOnExit>
                                  <Box sx={{ py: 2, px: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                      Matched Lines ({item.matchedRows.length}):
                                    </Typography>
                                    <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                      {item.matchedRows.map((row, rowIdx) => (
                                        <Box 
                                          component="li" 
                                          key={rowIdx} 
                                          sx={{ 
                                            mb: 1, 
                                            fontSize: '0.85rem',
                                            fontFamily: 'monospace',
                                            bgcolor: '#fff',
                                            p: 1,
                                            borderRadius: 1,
                                            border: '1px solid #e0e0e0'
                                          }}
                                        >
                                          <Chip 
                                            label={`Line ${row.lineNumber}`} 
                                            size="small" 
                                            sx={{ mr: 1, fontSize: '0.7rem' }} 
                                          />
                                          {row.text}
                                        </Box>
                                      ))}
                                    </Box>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          No matching models found in the text.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </>
      )}

      {/* Tab 1: eBay Models List */}
      {activeTab === 1 && (
        <Paper sx={{ p: 3 }}>
          <Grid container spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search models..."
                value={modelSearchTerm}
                onChange={(e) => setModelSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                variant="outlined"
                startIcon={modelsLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={fetchEbayModels}
                disabled={modelsLoading}
              >
                Refresh
              </Button>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={syncLoading ? <CircularProgress size={16} /> : <SyncIcon />}
                onClick={handleSyncModels}
                disabled={syncLoading}
              >
                Sync eBay
              </Button>
            </Grid>
          </Grid>

          {syncMessage && <Alert severity="info" sx={{ mb: 2 }}>{syncMessage}</Alert>}

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ mb: 2 }}>
            <Chip label={`Total: ${ebayModels.length} models`} color="primary" sx={{ mr: 1 }} />
            {modelSearchTerm && (
              <Chip label={`Showing: ${filteredModels.length} results`} color="secondary" />
            )}
          </Box>

          {modelsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>#</strong></TableCell>
                    <TableCell><strong>Make</strong></TableCell>
                    <TableCell><strong>Model</strong></TableCell>
                    <TableCell><strong>Full Name</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredModels.map((model, index) => (
                    <TableRow key={model._id} hover>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{model.make}</TableCell>
                      <TableCell>{model.model}</TableCell>
                      <TableCell>{model.fullName}</TableCell>
                    </TableRow>
                  ))}
                  {filteredModels.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        {ebayModels.length === 0 
                          ? 'No models in database. Click "Sync eBay" to load models.'
                          : 'No models found matching your search.'
                        }
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Tab 2: Device Models List */}
      {activeTab === 2 && (
        <Paper sx={{ p: 3 }}>
          <Grid container spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search device models..."
                value={modelSearchTerm}
                onChange={(e) => setModelSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                variant="outlined"
                startIcon={deviceModelsLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={fetchDeviceModels}
                disabled={deviceModelsLoading}
              >
                Refresh
              </Button>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button
                variant="contained"
                color="primary"
                startIcon={deviceSyncLoading ? <CircularProgress size={16} /> : <SyncIcon />}
                onClick={handleSyncDeviceModels}
                disabled={deviceSyncLoading}
              >
                Sync Devices
              </Button>
            </Grid>
          </Grid>

          {deviceSyncMessage && <Alert severity="info" sx={{ mb: 2 }}>{deviceSyncMessage}</Alert>}

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ mb: 2 }}>
            <Chip label={`Total: ${deviceModels.length} devices`} color="primary" sx={{ mr: 1 }} />
            <Chip 
              label={`Phones: ${deviceModels.filter(m => m.deviceType === 'cellphone').length}`} 
              color="secondary" 
              sx={{ mr: 1 }} 
            />
            <Chip 
              label={`Tablets: ${deviceModels.filter(m => m.deviceType === 'tablet').length}`} 
              color="info" 
              sx={{ mr: 1 }}
            />
            {modelSearchTerm && (
              <Chip label={`Showing: ${filteredDeviceModels.length} results`} color="warning" />
            )}
          </Box>

          {deviceModelsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>#</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>Brand</strong></TableCell>
                    <TableCell><strong>Full Name</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDeviceModels.map((model, index) => (
                    <TableRow key={model._id} hover>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <Chip 
                          label={model.deviceType === 'cellphone' ? '📱 Phone' : '📱 Tablet'} 
                          size="small"
                          color={model.deviceType === 'cellphone' ? 'secondary' : 'info'}
                        />
                      </TableCell>
                      <TableCell>{model.brand || '-'}</TableCell>
                      <TableCell>{model.fullName}</TableCell>
                    </TableRow>
                  ))}
                  {filteredDeviceModels.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        {deviceModels.length === 0 
                          ? 'No device models in database. Click "Sync Devices" to load models.'
                          : 'No models found matching your search.'
                        }
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default RangeAnalyzerPage;