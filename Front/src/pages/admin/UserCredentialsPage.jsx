import { useEffect, useState } from 'react';
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
  Chip
} from '@mui/material';

export default function UserCredentialsPage() {
  const [credentials, setCredentials] = useState(() => {
    const saved = localStorage.getItem('userCredentials');
    return saved ? JSON.parse(saved) : [];
  });

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>User Credentials</Typography>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Password</TableCell>
              <TableCell>Created At</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {credentials.map((cred, index) => (
              <TableRow key={index}>
                <TableCell>{cred.email}</TableCell>
                <TableCell>{cred.username}</TableCell>
                <TableCell>
                  <Chip 
                    label={cred.role}
                    color={
                      cred.role === 'superadmin' ? 'error' :
                      cred.role === 'listingadmin' ? 'primary' :
                      cred.role === 'productadmin' ? 'secondary' :
                      'default'
                    }
                    size="small"
                  />
                </TableCell>
                <TableCell>{cred.password}</TableCell>
                <TableCell>{new Date(cred.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {credentials.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          No user credentials saved yet. They will appear here when new users are created.
        </Typography>
      )}
    </Box>
  );
}