// src/pages/admin/AddListerPage.jsx
import { useMemo, useState } from 'react';
import {
  Box, Button, Paper, Stack, TextField, Typography,
  FormControl, InputLabel, Select, MenuItem, Snackbar, Alert
} from '@mui/material';
import api from '../../lib/api.js';


export default function AddListerPage() {
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
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  }, []);
  const isSuper = currentUser?.role === 'superadmin';
  const isListingAdmin = currentUser?.role === 'listingadmin';
  const isCompatibilityAdmin = currentUser?.role === 'compatibilityadmin';
  const isHRAdmin = currentUser?.role === 'hradmin';
  const isOperationHead = currentUser?.role === 'operationhead';
  const isSuperLike = isSuper || isHRAdmin || isOperationHead;

  const clearFieldError = (field) =>
    setErrors(prev => ({ ...prev, [field]: '' }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setMsg('');
    setErrors({ username: '' });
    setSubmitting(true);

    try {
      // Determine role and department logic
      let newRole = 'lister';
      let newDepartment = department;
      if (isSuperLike) {
        newRole = role;
        // For compatibilityadmin/compatibilityeditor, department is always Compatibility
        if (role === 'compatibilityadmin' || role === 'compatibilityeditor') {
          newDepartment = 'Compatibility';
        }
      } else if (isCompatibilityAdmin) {
        newRole = 'compatibilityeditor';
        newDepartment = 'Compatibility';
      } else if (isListingAdmin) {
        newRole = 'lister';
        newDepartment = 'Listing';
      }

      // Department required check
      const needsDepartment = (
        isSuperLike || isListingAdmin || isCompatibilityAdmin ||
        ['lister', 'listingadmin', 'compatibilityadmin', 'compatibilityeditor', 'hoc', 'compliancemanager'].includes(newRole)
      );
      if (needsDepartment && !newDepartment) {
        setMsg('Department is required');
        setSubmitting(false);
        return;
      }

      const res = await api.post('/users', {
        username, password, newUserRole: newRole, department: newDepartment
      });

      const roleNames = {
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
        compliancemanager: 'Compliance Manager'
      };
      setMsg(`${roleNames[newRole]} created`);

      // Save credentials to localStorage for superadmin record-keeping (UserCredentialsPage)
      const saved = localStorage.getItem('userCredentials');
      const list = saved ? JSON.parse(saved) : [];
      list.push({ username, password, role: newRole, department: newDepartment, createdAt: new Date() });
      localStorage.setItem('userCredentials', JSON.stringify(list));

      setCreds({ username, password, role: newRole, department: newDepartment });
      setShowCreds(true);

      // reset form
      setUsername('');
      setPassword('');
      setRole('lister');
      setDepartment('');
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || 'Failed to create user';

      if (status === 409) {
        // Backend sends "Username already in use"
        if (/username/i.test(message)) {
          setErrors(prev => ({ ...prev, username: message }));
        } else {
          setMsg(message);
        }
      } else {
        setMsg(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Add User</Typography>
      <Stack spacing={2} component="form" onSubmit={handleCreate}>
        <TextField
          label="Username"
          value={username}
          onChange={(e) => { setUsername(e.target.value); clearFieldError('username'); }}
          required
          error={!!errors.username}
          helperText={errors.username || ' '}
          disabled={submitting}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={submitting}
        />
        {isSuperLike ? (
          <FormControl disabled={submitting}>
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
              <MenuItem value="seller">Seller</MenuItem>
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
          <FormControl disabled={submitting || (isSuperLike && (role === 'compatibilityadmin' || role === 'compatibilityeditor'))}>
            <InputLabel>Department</InputLabel>
            <Select
              label="Department"
              value={isSuperLike && (role === 'compatibilityadmin' || role === 'compatibilityeditor') ? 'Compatibility' : department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={isSuperLike && (role === 'compatibilityadmin' || role === 'compatibilityeditor')}
            >
              <MenuItem value="">Select Department</MenuItem>
              <MenuItem value="Product Research">Product Research Department</MenuItem>
              <MenuItem value="Listing">Listing Department</MenuItem>
              <MenuItem value="Compatibility">Compatibility Department</MenuItem>
              <MenuItem value="HR">HR Department</MenuItem>
              <MenuItem value="Operations">Operations Department</MenuItem>
              <MenuItem value="Executives">Executives Department</MenuItem>
              <MenuItem value="Compliance">Compliance Department</MenuItem>
            </Select>
          </FormControl>
        ) : null}
        <Box>
          <Button type="submit" variant="contained" disabled={submitting}>Create</Button>
        </Box>
        {msg ? <Typography color={/created/i.test(msg) ? 'success.main' : 'error'}>{msg}</Typography> : null}
      </Stack>

      <Snackbar
        open={showCreds}
        autoHideDuration={10000}
        onClose={() => setShowCreds(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowCreds(false)} severity="info" sx={{ width: '100%' }}>
          Share these credentials securely:
          <br />Username: {creds.username}
          <br />Password: {creds.password}
          <br />Role: {creds.role}
          {creds.department && <><br />Department: {creds.department}</>}
        </Alert>
      </Snackbar>
    </Paper>
  );
}