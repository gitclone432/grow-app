import { Paper, Typography } from '@mui/material';
import AddUserForm from '../../components/AddUserForm.jsx';

export default function AddUserPage() {
  return (
    <Paper sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Add User</Typography>
      <AddUserForm compact />
    </Paper>
  );
}
