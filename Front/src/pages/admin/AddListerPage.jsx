// Compatibility editor creation — reuses shared Add User form
import { Paper, Typography } from '@mui/material';
import AddUserForm from '../../components/AddUserForm.jsx';

export default function AddListerPage() {
  return (
    <Paper sx={{ p: 3, maxWidth: 520 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Add Compatibility Editor</Typography>
      <AddUserForm compact />
    </Paper>
  );
}
