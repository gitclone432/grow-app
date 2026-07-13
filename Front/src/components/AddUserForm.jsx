import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import api from '../lib/api.js';

const ROLE_NAMES = {
  productadmin: 'Product Admin',
  listingadmin: 'Listing Admin',
  compatibilityadmin: 'Compatibility Admin',
  compatibilityeditor: 'Compatibility Editor',
  fulfillmentadmin: 'Fulfillment Admin',
  lister: 'Lister',
  advancelister: 'Advance Lister',
  seller: 'Seller',
  hradmin: 'HR Admin',
  hr: 'HR',
  operationhead: 'Operation Head',
  trainee: 'Trainee',
  hoc: 'HOC',
  compliancemanager: 'Compliance Manager',
};

export default function AddUserForm({ onCreated, compact = false }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('lister');
  const [department, setDepartment] = useState('');
  const [errors, setErrors] = useState({ username: '' });
  const [msg, setMsg] = useState('');
  const [showCreds, setShowCreds] = useState(false);
  const [creds, setCreds] = useState({ username: '', password: '', role: 'lister', department: '' });
  const [submitting, setSubmitting] = useState(false);

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const userRole = currentUser?.role || '';
  const isSuper = userRole === 'superadmin';
  const isListingAdmin = userRole === 'listingadmin';
  const isCompatibilityAdmin = userRole === 'compatibilityadmin';
  const isHRAdmin = userRole === 'hradmin';
  const isOperationHead = userRole === 'operationhead';
  const isSuperLike = isSuper || isHRAdmin || isOperationHead;

  const clearFieldError = (field) => setErrors((prev) => ({ ...prev, [field]: '' }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setMsg('');
    setErrors({ username: '' });
    setSubmitting(true);

    try {
      let newRole = 'lister';
      let newDepartment = department;
      if (isSuperLike) {
        newRole = role;
        if (role === 'compatibilityadmin' || role === 'compatibilityeditor') {
          newDepartment = 'Compatibility';
        }
      } else if (isListingAdmin) {
        newRole = 'lister';
        newDepartment = 'Listing';
      } else if (isCompatibilityAdmin) {
        newRole = 'compatibilityeditor';
        newDepartment = 'Compatibility';
      }

      const needsDepartment = (
        isSuperLike || isListingAdmin || isCompatibilityAdmin ||
        ['lister', 'listingadmin', 'compatibilityadmin', 'compatibilityeditor', 'hoc', 'compliancemanager'].includes(newRole)
      );
      if (needsDepartment && !newDepartment) {
        setMsg('Department is required');
        setSubmitting(false);
        return;
      }

      await api.post('/users', {
        username,
        password,
        newUserRole: newRole,
        department: newDepartment,
      });

      setMsg(`${ROLE_NAMES[newRole] || newRole} created`);

      const saved = localStorage.getItem('userCredentials');
      const list = saved ? JSON.parse(saved) : [];
      list.push({ username, password, role: newRole, department: newDepartment, createdAt: new Date() });
      localStorage.setItem('userCredentials', JSON.stringify(list));

      setCreds({ username, password, role: newRole, department: newDepartment });
      setShowCreds(true);
      setUsername('');
      setPassword('');
      setRole('lister');
      setDepartment('');
      onCreated?.({ username, role: newRole, department: newDepartment });
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || 'Failed to create user';
      if (status === 409 && /username/i.test(message)) {
        setErrors((prev) => ({ ...prev, username: message }));
      } else {
        setMsg(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack spacing={2} component="form" onSubmit={handleCreate}>
        {!compact ? (
          <Typography variant="body2" color="text.secondary">
            Creates a login and employee profile. Seller accounts should be added from Seller Management instead.
          </Typography>
        ) : null}

        <TextField
          label="Username"
          value={username}
          onChange={(e) => { setUsername(e.target.value); clearFieldError('username'); }}
          required
          size="small"
          error={!!errors.username}
          helperText={errors.username || ' '}
          disabled={submitting}
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          size="small"
          disabled={submitting}
          fullWidth
        />

        {isSuperLike ? (
          <FormControl size="small" fullWidth disabled={submitting}>
            <InputLabel>Role</InputLabel>
            <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              <MenuItem value="productadmin">Product Research Admin</MenuItem>
              <MenuItem value="listingadmin">Listing Admin</MenuItem>
              <MenuItem value="compatibilityadmin">Compatibility Admin</MenuItem>
              <MenuItem value="compatibilityeditor">Compatibility Editor</MenuItem>
              <MenuItem value="fulfillmentadmin">Fulfillment Admin</MenuItem>
              <MenuItem value="hradmin">HR Admin</MenuItem>
              <MenuItem value="hr">HR</MenuItem>
              <MenuItem value="operationhead">Operation Head</MenuItem>
              <MenuItem value="lister">Lister</MenuItem>
              <MenuItem value="advancelister">Advance Lister</MenuItem>
              <MenuItem value="trainee">Trainee</MenuItem>
              <MenuItem value="hoc">HOC</MenuItem>
              <MenuItem value="compliancemanager">Compliance Manager</MenuItem>
            </Select>
          </FormControl>
        ) : isListingAdmin ? (
          <Typography variant="body2" color="text.secondary">Creating Lister (Department: Listing)</Typography>
        ) : isCompatibilityAdmin ? (
          <Typography variant="body2" color="text.secondary">Creating Compatibility Editor (Department: Compatibility)</Typography>
        ) : null}

        {isSuperLike ? (
          <FormControl
            size="small"
            fullWidth
            disabled={submitting || role === 'compatibilityadmin' || role === 'compatibilityeditor'}
          >
            <InputLabel>Department</InputLabel>
            <Select
              label="Department"
              value={role === 'compatibilityadmin' || role === 'compatibilityeditor' ? 'Compatibility' : department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <MenuItem value="">Select Department</MenuItem>
              <MenuItem value="Product Research">Product Research Department</MenuItem>
              <MenuItem value="Listing">Listing Department</MenuItem>
              <MenuItem value="Compatibility">Compatibility Department</MenuItem>
              <MenuItem value="Fulfillment">Fulfillment Department</MenuItem>
              <MenuItem value="HR">HR Department</MenuItem>
              <MenuItem value="Operations">Operations Department</MenuItem>
              <MenuItem value="Executives">Executives Department</MenuItem>
              <MenuItem value="Compliance">Compliance Department</MenuItem>
            </Select>
          </FormControl>
        ) : null}

        <Box>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <AddIcon />}
          >
            {submitting ? 'Creating...' : 'Create User'}
          </Button>
        </Box>

        {msg ? (
          <Alert severity={/created/i.test(msg) ? 'success' : 'error'} sx={{ borderRadius: 1.5 }}>
            {msg}
          </Alert>
        ) : null}
      </Stack>

      <Snackbar
        open={showCreds}
        autoHideDuration={10000}
        onClose={() => setShowCreds(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowCreds(false)} severity="info" sx={{ width: '100%' }}>
          Share credentials securely:
          <br />Username: {creds.username}
          <br />Password: {creds.password}
          <br />Role: {creds.role}
          {creds.department ? <><br />Department: {creds.department}</> : null}
        </Alert>
      </Snackbar>
    </>
  );
}
