import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyIcon from '@mui/icons-material/Key';
import ShieldIcon from '@mui/icons-material/Shield';

// ---------- TOTP engine (RFC 6238 / RFC 4226), pure Web Crypto, no deps ----------

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!clean) throw new Error('empty secret');
  let bits = '';
  for (const ch of clean) {
    const val = alphabet.indexOf(ch);
    if (val === -1) throw new Error('invalid base32 character');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  if (bytes.length === 0) throw new Error('secret too short');
  return new Uint8Array(bytes);
}

async function hotp(keyBytes, counter) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const high = Math.floor(counter / 2 ** 32);
  const low = counter >>> 0;
  view.setUint32(0, high);
  view.setUint32(4, low);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = sig[sig.length - 1] & 0xf;
  const code =
    ((sig[offset] & 0x7f) << 24)
    | ((sig[offset + 1] & 0xff) << 16)
    | ((sig[offset + 2] & 0xff) << 8)
    | (sig[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

async function totp(secretBase32, stepSeconds = 30) {
  const keyBytes = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  return hotp(keyBytes, counter);
}

// ---------- storage (browser localStorage — per device) ----------

const STORAGE_KEY = 'gm_authenticator_accounts';

function loadAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // best effort
  }
}

// ---------- UI pieces ----------

const STEP = 30;

function Digits({ code }) {
  const digits = (code || '------').split('');
  return (
    <Box sx={styles.digitRow}>
      {digits.map((d, i) => (
        <Box component="span" key={`${i}-${d}`} sx={styles.digit}>
          {d}
        </Box>
      ))}
    </Box>
  );
}

function Ring({ progress, urgent }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const color = urgent ? '#D9584A' : '#C9A46A';
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="19" cy="19" r={r} stroke="#2A3140" strokeWidth="3" fill="none" />
      <circle
        cx="19"
        cy="19"
        r={r}
        stroke={color}
        strokeWidth="3"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
      />
    </svg>
  );
}

export default function AuthenticatorPage() {
  const [accounts, setAccounts] = useState([]);
  const [codes, setCodes] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(STEP - (Math.floor(Date.now() / 1000) % STEP));
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [formError, setFormError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const counterRef = useRef(-1);

  useEffect(() => {
    setAccounts(loadAccounts());
    setLoaded(true);
  }, []);

  const recomputeCodes = useCallback(async (accs) => {
    const entries = await Promise.all(
      accs.map(async (a) => {
        try {
          const code = await totp(a.secret);
          return [a.id, code];
        } catch {
          return [a.id, 'ERROR'];
        }
      })
    );
    setCodes(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    recomputeCodes(accounts);
    const interval = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const left = STEP - (nowSec % STEP);
      setTimeLeft(left);
      const counter = Math.floor(nowSec / STEP);
      if (counter !== counterRef.current) {
        counterRef.current = counter;
        recomputeCodes(accounts);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [loaded, accounts, recomputeCodes]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Enter a name for this account.');
      return;
    }
    try {
      await totp(secret);
    } catch {
      setFormError("That secret key doesn't look valid. Check it and try again.");
      return;
    }
    const newAccount = {
      id: crypto.randomUUID(),
      name: name.trim(),
      secret: secret.replace(/\s/g, ''),
    };
    const next = [...accounts, newAccount];
    setAccounts(next);
    saveAccounts(next);
    setName('');
    setSecret('');
    setShowAdd(false);
  };

  const handleDelete = (id) => {
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    saveAccounts(next);
    setDeleteConfirm(null);
  };

  const handleCopy = (id, code) => {
    if (!code || code === 'ERROR') return;
    navigator.clipboard?.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  };

  const closeAdd = () => {
    setShowAdd(false);
    setFormError('');
    setName('');
    setSecret('');
  };

  const progress = timeLeft / STEP;
  const urgent = timeLeft <= 5;

  return (
    <Box sx={{ pb: 4 }}>
      <Breadcrumbs sx={{ mb: 1.5, fontSize: '0.875rem' }}>
        <Typography color="text.secondary">Settings</Typography>
        <Typography color="text.primary" fontWeight={600}>Authenticator</Typography>
      </Breadcrumbs>

      <Alert severity="warning" sx={{ mb: 2 }}>
        Codes are generated locally in your browser and stored only on this device (localStorage).
        Do not rely on this as your only authenticator for critical accounts.
      </Alert>

      <Box sx={styles.page}>
        <Box sx={styles.header}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={styles.logoMark}>
              <KeyIcon sx={{ fontSize: 18, color: '#12151B' }} />
            </Box>
            <Box>
              <Typography sx={styles.title}>Authenticator</Typography>
              <Typography sx={styles.subtitle}>Codes regenerate every 30 seconds</Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowAdd(true)}
            sx={styles.addBtn}
          >
            Add account
          </Button>
        </Box>

        {loaded && accounts.length === 0 && !showAdd && (
          <Box sx={styles.empty}>
            <ShieldIcon sx={{ fontSize: 28, color: '#5C6376', mb: 1.25 }} />
            <Typography sx={styles.emptyTitle}>No accounts yet</Typography>
            <Typography sx={styles.emptyBody}>Add one to generate your first code.</Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setShowAdd(true)}
              sx={{ ...styles.addBtn, mt: 2 }}
            >
              Add account
            </Button>
          </Box>
        )}

        <Stack spacing={1.25}>
          {accounts.map((a) => (
            <Box key={a.id} sx={styles.card}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Typography sx={styles.accountName}>{a.name}</Typography>
                <IconButton
                  size="small"
                  onClick={() => setDeleteConfirm(a.id)}
                  aria-label={`Delete ${a.name}`}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 18, color: '#6B7280' }} />
                </IconButton>
              </Stack>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Button
                  onClick={() => handleCopy(a.id, codes[a.id])}
                  aria-label="Copy code"
                  sx={styles.codeBtn}
                >
                  <Digits code={codes[a.id]} />
                  {copiedId === a.id ? (
                    <CheckIcon sx={{ fontSize: 16, color: '#6FBF8B', ml: 1.25 }} />
                  ) : (
                    <ContentCopyIcon sx={{ fontSize: 15, color: '#5C6376', ml: 1.25 }} />
                  )}
                </Button>
                <Ring progress={progress} urgent={urgent} />
              </Stack>

              {deleteConfirm === a.id && (
                <Stack direction="row" alignItems="center" spacing={1.25} sx={styles.confirmRow}>
                  <Typography sx={styles.confirmText}>Delete this account?</Typography>
                  <Button size="small" onClick={() => handleDelete(a.id)} sx={styles.confirmDelete}>
                    Delete
                  </Button>
                  <Button size="small" onClick={() => setDeleteConfirm(null)} sx={styles.confirmCancel}>
                    Cancel
                  </Button>
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      </Box>

      <Dialog open={showAdd} onClose={closeAdd} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          Add account
          <IconButton size="small" onClick={closeAdd} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Box component="form" onSubmit={handleAdd}>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={2}>
              <TextField
                label="Account name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GitHub, Gmail"
                autoFocus
                fullWidth
                size="small"
              />
              <TextField
                label="Secret key"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Base32 key from the site's 2FA setup"
                fullWidth
                size="small"
              />
              {formError ? <Alert severity="error">{formError}</Alert> : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closeAdd}>Cancel</Button>
            <Button type="submit" variant="contained">Save account</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

const styles = {
  page: {
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    background: '#12151B',
    borderRadius: 2,
    p: { xs: 2, sm: 3 },
    color: '#E8E4D8',
    maxWidth: 480,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    mb: 3,
    gap: 1.5,
    flexWrap: 'wrap',
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 1,
    background: '#C9A46A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 600, letterSpacing: 0.2, color: '#E8E4D8' },
  subtitle: { fontSize: 12, color: '#6B7280', mt: 0.25 },
  addBtn: {
    borderColor: '#3A4254',
    color: '#E8E4D8',
    textTransform: 'none',
    '&:hover': { borderColor: '#C9A46A', backgroundColor: 'rgba(201,164,106,0.08)' },
  },
  card: {
    background: '#1A1F28',
    border: '1px solid #262C38',
    borderRadius: 2,
    p: '14px 16px',
  },
  accountName: { fontSize: 13, color: '#8B93A3', fontWeight: 500 },
  codeBtn: {
    display: 'flex',
    alignItems: 'center',
    background: 'transparent',
    border: 'none',
    p: 0,
    minWidth: 0,
    textTransform: 'none',
    '&:hover': { background: 'transparent' },
  },
  digitRow: { display: 'flex', gap: '4px' },
  digit: {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: 26,
    fontWeight: 600,
    color: '#ECE8DE',
    letterSpacing: '1px',
    minWidth: 16,
    textAlign: 'center',
  },
  confirmRow: {
    mt: 1.5,
    pt: 1.5,
    borderTop: '1px solid #262C38',
  },
  confirmText: { fontSize: 12.5, color: '#8B93A3', flex: 1 },
  confirmDelete: {
    background: '#D9584A',
    color: '#1A1000',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'none',
    '&:hover': { background: '#c44a3d' },
  },
  confirmCancel: {
    border: '1px solid #3A4254',
    color: '#8B93A3',
    fontSize: 12,
    textTransform: 'none',
  },
  empty: {
    background: '#1A1F28',
    border: '1px dashed #2A3140',
    borderRadius: 2,
    p: '36px 20px',
    textAlign: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, mb: 0.5, color: '#E8E4D8' },
  emptyBody: { fontSize: 13, color: '#6B7280' },
};
