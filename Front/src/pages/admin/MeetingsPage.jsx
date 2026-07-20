import { useEffect, useMemo, useRef, useState } from 'react';
import useDebounce from '../../hooks/useDebounce';
import {
    Alert,
    alpha,
    Autocomplete,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Collapse,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Fade,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EastIcon from '@mui/icons-material/East';
import EventNoteIcon from '@mui/icons-material/EventNote';
import Groups2Icon from '@mui/icons-material/Groups2';
import PlaceIcon from '@mui/icons-material/Place';
import TuneIcon from '@mui/icons-material/Tune';
import api from '../../lib/api';
import { dashboardSignatureTokens } from '../../theme/appTheme';

const STATUS_LABELS = {
    planned: 'Planned',
    'in-progress': 'Ongoing',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

const EMPTY_FORM = {
    title: '',
    scheduledFor: '',
    organizerId: '',
    attendeeIds: [],
    status: 'planned',
    location: '',
    agenda: '',
    discussionSummary: '',
    decisions: '',
    futureScope: '',
    actionItems: [],
};

function createActionItemDraft(overrides = {}) {
    return {
        _localId: overrides._localId || crypto.randomUUID(),
        text: '',
        assigneeId: '',
        dueDate: '',
        status: 'pending',
        ...overrides,
    };
}

const sharedModalPaperSx = (tokens, width) => ({
    width: width || { xs: 'calc(100vw - 24px)', sm: '760px' },
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: '78vh',
    borderRadius: `${tokens.radius.card + 12}px`,
    background: tokens.surfaces.pageCard,
    mt: { xs: 1.5, sm: 3 },
    mb: { xs: 1.5, sm: 3 },
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
});

const formFieldSx = {
    '& .MuiInputLabel-root': {
        color: '#111111',
    },
    '& .MuiInputLabel-root.Mui-focused': {
        color: '#111111',
    },
    '& .MuiInputBase-input': {
        color: '#111111',
    },
    '& .MuiOutlinedInput-root': {
        color: '#111111',
    },
    '& .MuiSelect-select': {
        color: '#111111',
    },
};

const modalSecondaryButtonSx = {
    bgcolor: '#FFF7C7',
    color: '#111111',
    borderColor: 'transparent',
    '&:hover': {
        bgcolor: '#FFF1A8',
        borderColor: 'transparent',
    },
};

const modalPrimaryButtonSx = {
    bgcolor: '#FFEE8C',
    color: '#111111',
    boxShadow: 'none',
    '&:hover': {
        bgcolor: '#F8E47A',
        boxShadow: 'none',
    },
};

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString();
}

function formatCardDateTime(value) {
    if (!value) return '-';

    const date = new Date(value);
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(date);
}

function formatRelativeTime(value) {
    if (!value) return 'just now';

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return 'just now';

    const diffMinutes = Math.round((Date.now() - timestamp) / (1000 * 60));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    const diffWeeks = Math.round(diffDays / 7);
    if (diffWeeks < 5) return `${diffWeeks} wk${diffWeeks === 1 ? '' : 's'} ago`;

    const diffMonths = Math.round(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} mo${diffMonths === 1 ? '' : 's'} ago`;

    const diffYears = Math.round(diffDays / 365);
    return `${diffYears} yr${diffYears === 1 ? '' : 's'} ago`;
}

function toBulletPoints(value) {
    const text = String(value || '').trim();
    if (!text) return [];

    const lines = text
        .split(/\r?\n+/)
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean);

    if (lines.length > 1) return lines;

    return text
        .split(/(?:\.\s+|;\s+)/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (text.includes('.') && !/[.!?]$/.test(part) ? `${part}.` : part));
}

function getDisplayFirstName(value) {
    const username = String(value || '').trim();
    if (!username) return '';

    const beforeAt = username.split('@')[0]?.trim() || username;
    const firstName = beforeAt.split(/[._\s-]+/).find(Boolean);
    return firstName || beforeAt;
}

function summarizeAttendees(attendees = []) {
    if (!attendees.length) return '-';

    const firstNames = attendees.map((attendee) => getDisplayFirstName(attendee?.username)).filter(Boolean);

    if (firstNames.length === 1) {
        return firstNames[0];
    }

    return `${firstNames[0]} +${firstNames.length - 1}`;
}

function toLocalInputValue(value) {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    const adjusted = new Date(date.getTime() - offset * 60 * 1000);
    return adjusted.toISOString().slice(0, 16);
}

function getStatusTone(tokens, status) {
    if (status === 'completed') return tokens.tones.success;
    if (status === 'in-progress') return tokens.tones.warning;
    if (status === 'cancelled') return tokens.tones.danger;
    return tokens.tones.info;
}

function getStatusDotColor(status) {
    if (status === 'completed') return '#3FA56A';
    if (status === 'in-progress') return '#F0A100';
    if (status === 'cancelled') return '#D85C57';
    return '#5B7CFA';
}

function StatusDot({ status, size = 10 }) {
    return (
        <Tooltip title={STATUS_LABELS[status] || status}>
            <Box
                component="span"
                aria-label={STATUS_LABELS[status] || status}
                sx={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: getStatusDotColor(status),
                    boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.28)',
                }}
            />
        </Tooltip>
    );
}

function SummaryBlock({ eyebrow, text }) {
    const bullets = toBulletPoints(text);
    const hasText = bullets.length > 0;

    return (
        <Box>
            <Typography
                variant="body2"
                sx={{
                    display: 'block',
                    mb: 0.6,
                    color: 'rgba(17, 17, 17, 0.76)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.9,
                    fontWeight: 700,
                }}
            >
                {eyebrow}
            </Typography>
            {hasText ? (
                <Box
                    component="ul"
                    sx={{
                        m: 0,
                        pl: 2.4,
                        minHeight: 48,
                        color: '#111111',
                        display: 'grid',
                        gap: 0.75,
                    }}
                >
                    {bullets.slice(0, 3).map((bullet) => (
                        <Typography
                            key={bullet}
                            component="li"
                            variant="body2"
                            sx={{
                                color: '#111111',
                                lineHeight: 1.55,
                                pr: 0.5,
                            }}
                        >
                            {bullet}
                        </Typography>
                    ))}
                </Box>
            ) : (
                <Typography
                    variant="body2"
                    sx={{
                        color: 'rgba(17, 17, 17, 0.48)',
                        lineHeight: 1.7,
                        minHeight: 48,
                        fontStyle: 'italic',
                    }}
                >
                    No notes added yet.
                </Typography>
            )}
        </Box>
    );
}

function DetailBulletBlock({ label, text, emptyText }) {
    const bullets = toBulletPoints(text);

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            {bullets.length === 0 ? (
                <Typography variant="body1" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{emptyText}</Typography>
            ) : (
                <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5, display: 'grid', gap: 0.9 }}>
                    {bullets.map((bullet) => (
                        <Typography key={bullet} component="li" variant="body1" sx={{ lineHeight: 1.65 }}>
                            {bullet}
                        </Typography>
                    ))}
                </Box>
            )}
        </Paper>
    );
}

function MeetingCard({ meeting, index, onOpen, onEdit, onDelete, canEdit, tokens }) {
    const theme = useTheme();
    const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
    const metadataIconSx = { fontSize: 18, color: 'rgba(17, 17, 17, 0.56)' };
    const attendeeSummary = summarizeAttendees(attendees);
    const organizerSummary = getDisplayFirstName(meeting.organizer?.username) || '-';

    return (
        <Fade in timeout={320 + index * 70}>
            <Card
                elevation={0}
                sx={{
                    height: '100%',
                    borderRadius: `${tokens.radius.card + 6}px`,
                    backgroundColor: '#F5F5F7',
                    boxShadow: `${tokens.shadows.card}, 0 18px 36px rgba(17, 17, 17, 0.08)`,
                    overflow: 'hidden',
                }}
            >
                <CardContent sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Stack spacing={3} sx={{ flexGrow: 1, height: '100%' }}>
                        <Stack spacing={1}>
                            <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flexWrap: 'wrap' }}>
                                        <Typography
                                            variant="h5"
                                            sx={{
                                                fontWeight: 900,
                                                color: '#111111',
                                                lineHeight: 1.15,
                                                letterSpacing: '-0.01em',
                                            }}
                                        >
                                            {meeting.title}
                                        </Typography>
                                        <StatusDot status={meeting.status} size={12} />
                                    </Stack>
                                </Box>
                                {canEdit ? (
                                    <Tooltip title="Delete meeting">
                                        <IconButton
                                            size="small"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onDelete(meeting);
                                            }}
                                            sx={{
                                                mt: -0.25,
                                                mr: -0.5,
                                                color: alpha(theme.palette.error.main, 0.72),
                                                '&:hover': {
                                                    bgcolor: alpha(theme.palette.error.main, 0.08),
                                                    color: theme.palette.error.main,
                                                },
                                            }}
                                        >
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                ) : null}
                            </Stack>

                            <Box
                                sx={{
                                    px: 2,
                                    py: 1.5,
                                    borderRadius: 3,
                                    bgcolor: 'rgba(255, 255, 255, 0.4)',
                                }}
                            >
                                <Grid container spacing={2} alignItems="flex-start">
                                    <Grid item xs={12} sm={4}>
                                        <Stack direction="row" spacing={1} alignItems="flex-start">
                                            <CalendarMonthIcon sx={metadataIconSx} />
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(17, 17, 17, 0.5)', mb: 0.35 }}>
                                                    Scheduled
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: 'rgba(17, 17, 17, 0.8)', fontWeight: 500, lineHeight: 1.45 }}>
                                                    {formatCardDateTime(meeting.scheduledFor)}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Stack direction="row" spacing={1} alignItems="flex-start">
                                            <EventNoteIcon sx={metadataIconSx} />
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(17, 17, 17, 0.5)', mb: 0.35 }}>
                                                    Organizer
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: 'rgba(17, 17, 17, 0.8)',
                                                        fontWeight: 500,
                                                        lineHeight: 1.45,
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                    }}
                                                >
                                                    {organizerSummary}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Stack direction="row" spacing={1} alignItems="flex-start">
                                            <Groups2Icon sx={metadataIconSx} />
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(17, 17, 17, 0.5)', mb: 0.35 }}>
                                                    Attendees
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: 'rgba(17, 17, 17, 0.8)',
                                                        fontWeight: 500,
                                                        lineHeight: 1.45,
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                    }}
                                                >
                                                    {attendeeSummary}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </Grid>
                                    {meeting.location ? (
                                        <Grid item xs={12}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <PlaceIcon sx={metadataIconSx} />
                                                <Typography variant="body2" sx={{ color: 'rgba(17, 17, 17, 0.62)' }}>
                                                    {meeting.location}
                                                </Typography>
                                            </Stack>
                                        </Grid>
                                    ) : null}
                                </Grid>
                            </Box>
                        </Stack>

                        <Stack spacing={0} sx={{ flexGrow: 1 }}>
                            <Box sx={{ pt: 0.25, pb: 2.25 }}>
                                <SummaryBlock eyebrow="Discussed" text={meeting.discussionSummary} />
                            </Box>
                            <Box sx={{ pt: 2.25, pb: 0.25 }}>
                                <SummaryBlock eyebrow="Future Scope" text={meeting.futureScope} />
                            </Box>
                        </Stack>

                        <Divider sx={{ borderColor: 'rgba(17, 17, 17, 0.1)' }} />

                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2.5} alignItems={{ xs: 'stretch', sm: 'flex-end' }}>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip
                                    size="small"
                                    label={`${meeting.actionItems?.length || 0} action items`}
                                    sx={{ bgcolor: alpha(theme.palette.warning.main, 0.12), color: theme.palette.warning.main, fontWeight: 600 }}
                                />
                                <Chip
                                    size="small"
                                    label={meeting.decisions ? 'Decisions noted' : 'No decisions yet'}
                                    sx={{ bgcolor: alpha(theme.palette.success.main, 0.12), color: theme.palette.success.main, fontWeight: 600 }}
                                />
                            </Stack>

                            <Stack spacing={1.25} alignItems={{ xs: 'flex-start', sm: 'flex-end' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(17, 17, 17, 0.52)' }}>
                                    Updated {formatRelativeTime(meeting.updatedAt)}
                                </Typography>
                                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                                    {canEdit ? (
                                        <Button
                                            size="small"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onEdit(meeting);
                                            }}
                                            sx={{
                                                color: 'rgba(17, 17, 17, 0.68)',
                                                '&:hover': {
                                                    bgcolor: 'rgba(17,17,17,0.06)',
                                                    color: '#111111',
                                                },
                                            }}
                                        >
                                            Edit
                                        </Button>
                                    ) : null}
                                    <Button
                                        size="small"
                                        variant="contained"
                                        endIcon={<EastIcon />}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onOpen(meeting);
                                        }}
                                        sx={{
                                            bgcolor: '#111111',
                                            color: '#FFEE8C',
                                            px: 1.5,
                                            '&:hover': {
                                                bgcolor: '#000000',
                                            },
                                        }}
                                    >
                                        Open Brief
                                    </Button>
                                </Stack>
                            </Stack>
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>
        </Fade>
    );
}

export default function MeetingsPage() {
    const theme = useTheme();
    const tokens = theme.customTokens?.dashboardSignature || dashboardSignatureTokens;
    const currentUser = useMemo(() => {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    }, []);

    const [meetings, setMeetings] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showFilters, setShowFilters] = useState(true);
    const [detailMeeting, setDetailMeeting] = useState(null);
    const [editingMeeting, setEditingMeeting] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [filters, setFilters] = useState({ search: '', status: 'all', organizerId: '' });
    const debouncedSearch = useDebounce(filters.search, 400);
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) { isFirstRender.current = false; return; }
        fetchMeetings({ ...filters, search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch]);
    const [form, setForm] = useState(EMPTY_FORM);

    const userMap = useMemo(() => new Map(users.map((user) => [user._id, user])), [users]);

    const canEditMeeting = (meeting) => {
        if (!currentUser || !meeting) return false;
        if (['superadmin', 'hradmin', 'operationhead'].includes(currentUser.role)) return true;

        return meeting.organizer?._id === currentUser.id || meeting.createdBy?._id === currentUser.id;
    };

    const fetchMeetings = async (activeFilters = filters) => {
        try {
            setLoading(true);
            const params = {};
            if (activeFilters.search.trim()) params.search = activeFilters.search.trim();
            if (activeFilters.status && activeFilters.status !== 'all') params.status = activeFilters.status;
            if (activeFilters.organizerId) params.organizerId = activeFilters.organizerId;

            const { data } = await api.get('/meetings', { params });
            setMeetings(Array.isArray(data) ? data : []);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Failed to load meetings');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const { data } = await api.get('/meetings/users');
            setUsers(Array.isArray(data) ? data : []);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Failed to load meeting users');
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchMeetings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const organizerOptions = users;
    const selectedAttendees = form.attendeeIds.map((id) => userMap.get(id)).filter(Boolean);
    const selectedOrganizer = userMap.get(form.organizerId) || null;

    const openCreateDialog = () => {
        const defaultOrganizerId = currentUser?.id || '';
        setEditingMeeting(null);
        setForm({ ...EMPTY_FORM, organizerId: defaultOrganizerId });
        setFormOpen(true);
        setError('');
    };

    const openEditDialog = (meeting) => {
        setDetailMeeting(null);
        setEditingMeeting(meeting);
        setForm({
            title: meeting.title || '',
            scheduledFor: toLocalInputValue(meeting.scheduledFor),
            organizerId: meeting.organizer?._id || '',
            attendeeIds: (meeting.attendees || []).map((attendee) => attendee._id),
            status: meeting.status || 'planned',
            location: meeting.location || '',
            agenda: meeting.agenda || '',
            discussionSummary: meeting.discussionSummary || '',
            decisions: meeting.decisions || '',
            futureScope: meeting.futureScope || '',
            actionItems: (meeting.actionItems || []).map((item) => createActionItemDraft({
                _localId: item._id || crypto.randomUUID(),
                text: item.text || '',
                assigneeId: item.assignee?._id || '',
                dueDate: toLocalInputValue(item.dueDate),
                status: item.status || 'pending',
            })),
        });
        setFormOpen(true);
        setError('');
    };

    const closeDialog = () => {
        setFormOpen(false);
        setEditingMeeting(null);
        setForm(EMPTY_FORM);
    };

    const handleFilterChange = (field, value) => {
        const nextFilters = { ...filters, [field]: value };
        setFilters(nextFilters);
        if (field !== 'search') {
            fetchMeetings(nextFilters);
        }
    };

    const handleActionItemChange = (index, field, value) => {
        setForm((current) => ({
            ...current,
            actionItems: current.actionItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
        }));
    };

    const addActionItem = () => {
        setForm((current) => ({
            ...current,
            actionItems: [...current.actionItems, createActionItemDraft()],
        }));
    };

    const removeActionItem = (index) => {
        setForm((current) => ({
            ...current,
            actionItems: current.actionItems.filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const handleSubmit = async () => {
        if (!form.title.trim() || !form.scheduledFor || !form.organizerId || form.attendeeIds.length === 0) {
            setError('Title, date, organizer, and at least one attendee are required');
            return;
        }

        try {
            setSaving(true);
            setError('');
            const payload = {
                ...form,
                title: form.title.trim(),
                actionItems: form.actionItems.filter((item) => item.text.trim()).map((item) => ({
                    text: item.text.trim(),
                    assigneeId: item.assigneeId || undefined,
                    dueDate: item.dueDate || undefined,
                    status: item.status,
                })),
            };

            if (editingMeeting?._id) {
                await api.put(`/meetings/${editingMeeting._id}`, payload);
                setSuccess('Meeting updated');
            } else {
                await api.post('/meetings', payload);
                setSuccess('Meeting created');
            }

            closeDialog();
            fetchMeetings();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Failed to save meeting');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (meeting) => {
        if (!window.confirm(`Delete "${meeting.title}"?`)) return;

        try {
            await api.delete(`/meetings/${meeting._id}`);
            setSuccess('Meeting deleted');
            if (detailMeeting?._id === meeting._id) {
                setDetailMeeting(null);
            }
            fetchMeetings();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Failed to delete meeting');
        }
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 2, mb: 5 }}>
            <Box
                sx={{
                    p: { xs: 2.5, md: 3 },
                    borderRadius: `${tokens.radius.card + 8}px`,
                    backgroundColor: theme.palette.background.paper,
                    mb: 3,
                }}
            >
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 900, color: '#111111' }}>
                            Meetings
                        </Typography>
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <Button
                            variant="outlined"
                            startIcon={<TuneIcon />}
                            onClick={() => setShowFilters((current) => !current)}
                            sx={{
                                bgcolor: '#FFF7C7',
                                color: '#111111',
                                borderColor: 'transparent',
                                '&:hover': {
                                    bgcolor: '#FFF1A8',
                                    borderColor: 'transparent',
                                },
                            }}
                        >
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={openCreateDialog}
                            sx={{
                                bgcolor: '#111111',
                                color: '#FFEE8C',
                                '&:hover': {
                                    bgcolor: '#000000',
                                },
                            }}
                        >
                            New Meeting
                        </Button>
                    </Stack>
                </Stack>
            </Box>

            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert> : null}
            {success ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert> : null}

            <Collapse in={showFilters} timeout={220}>
                <Paper
                    sx={{
                        p: 2,
                        mb: 3,
                        borderRadius: `${tokens.radius.card}px`,
                        background: tokens.surfaces.pageCard,
                        boxShadow: tokens.shadows.card,
                    }}
                >
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={5}>
                            <TextField
                                fullWidth
                                label="Search meetings"
                                value={filters.search}
                                onChange={(event) => handleFilterChange('search', event.target.value)}
                                placeholder="Search by title, discussion, or future scope"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <TextField
                                select
                                fullWidth
                                label="Status"
                                value={filters.status}
                                onChange={(event) => handleFilterChange('status', event.target.value)}
                            >
                                <MenuItem value="all">All statuses</MenuItem>
                                <MenuItem value="planned">Planned</MenuItem>
                                <MenuItem value="in-progress">In Progress</MenuItem>
                                <MenuItem value="completed">Completed</MenuItem>
                                <MenuItem value="cancelled">Cancelled</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6} md={4}>
                            <TextField
                                select
                                fullWidth
                                label="Organizer"
                                value={filters.organizerId}
                                onChange={(event) => handleFilterChange('organizerId', event.target.value)}
                            >
                                <MenuItem value="">All organizers</MenuItem>
                                {organizerOptions.map((user) => (
                                    <MenuItem key={user._id} value={user._id}>{user.username}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                    </Grid>
                </Paper>
            </Collapse>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
                    <CircularProgress />
                </Box>
            ) : meetings.length === 0 ? (
                <Paper
                    sx={{
                        p: 5,
                        textAlign: 'center',
                        borderRadius: `${tokens.radius.card + 4}px`,
                        backgroundColor: '#FFFBE3',
                        boxShadow: tokens.shadows.card,
                    }}
                >
                    <Typography variant="h6" sx={{ color: '#111111', fontWeight: 800, mb: 1 }}>No meetings yet</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(17, 17, 17, 0.68)', mb: 3 }}>
                        Start with a meeting brief so organizers, attendees, decisions, and future scope all live in one place.
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={openCreateDialog}
                        sx={{
                            bgcolor: '#111111',
                            color: '#FFEE8C',
                            '&:hover': {
                                bgcolor: '#000000',
                            },
                        }}
                    >
                        Create First Meeting
                    </Button>
                </Paper>
            ) : (
                <Grid container spacing={2.5}>
                    {meetings.map((meeting, index) => (
                        <Grid item xs={12} md={6} xl={4} key={meeting._id}>
                            <MeetingCard
                                meeting={meeting}
                                index={index}
                                onOpen={setDetailMeeting}
                                onEdit={openEditDialog}
                                onDelete={handleDelete}
                                canEdit={canEditMeeting(meeting)}
                                tokens={tokens}
                            />
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog
                open={formOpen}
                onClose={closeDialog}
                maxWidth={false}
                scroll="paper"
                PaperProps={{
                    sx: sharedModalPaperSx(tokens, { xs: 'calc(100vw - 24px)', sm: '780px', md: '840px' }),
                }}
            >
                <DialogTitle sx={{ px: 3, pt: 3, pb: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="h6" sx={{ color: '#111111', fontWeight: 800 }}>
                                {editingMeeting ? 'Edit Meeting' : 'Create Meeting'}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#111111' }}>
                                Capture the meeting brief, attendees, and future scope.
                            </Typography>
                        </Box>
                        <IconButton onClick={closeDialog}><CloseIcon /></IconButton>
                    </Stack>
                </DialogTitle>
                <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
                    <Grid container spacing={2} sx={{ mt: 0.25 }}>
                        <Grid item xs={12} md={8}>
                            <TextField fullWidth label="Meeting Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} sx={formFieldSx} />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                type="datetime-local"
                                label="Scheduled For"
                                value={form.scheduledFor}
                                onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })}
                                InputLabelProps={{ shrink: true }}
                                sx={formFieldSx}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Autocomplete
                                options={users}
                                value={selectedOrganizer}
                                onChange={(_, value) => setForm({ ...form, organizerId: value?._id || '' })}
                                getOptionLabel={(option) => option?.username ? `${option.username} (${option.role})` : ''}
                                isOptionEqualToValue={(option, value) => option._id === value._id}
                                renderInput={(params) => <TextField {...params} label="Organizer" sx={formFieldSx} />}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth label="Location / Link" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} sx={formFieldSx} />
                        </Grid>
                        <Grid item xs={12}>
                            <Autocomplete
                                multiple
                                options={users}
                                value={selectedAttendees}
                                onChange={(_, value) => setForm({ ...form, attendeeIds: value.map((item) => item._id) })}
                                getOptionLabel={(option) => option?.username ? `${option.username} (${option.role})` : ''}
                                isOptionEqualToValue={(option, value) => option._id === value._id}
                                renderInput={(params) => <TextField {...params} label="Attendees" placeholder="Select users" sx={formFieldSx} />}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                select
                                fullWidth
                                label="Status"
                                value={form.status}
                                onChange={(event) => setForm({ ...form, status: event.target.value })}
                                sx={formFieldSx}
                            >
                                <MenuItem value="planned">Planned</MenuItem>
                                <MenuItem value="in-progress">In Progress</MenuItem>
                                <MenuItem value="completed">Completed</MenuItem>
                                <MenuItem value="cancelled">Cancelled</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField fullWidth multiline minRows={3} label="Agenda" value={form.agenda} onChange={(event) => setForm({ ...form, agenda: event.target.value })} sx={formFieldSx} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField fullWidth multiline minRows={4} label="Discussed" value={form.discussionSummary} onChange={(event) => setForm({ ...form, discussionSummary: event.target.value })} sx={formFieldSx} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField fullWidth multiline minRows={3} label="Decisions" value={form.decisions} onChange={(event) => setForm({ ...form, decisions: event.target.value })} sx={formFieldSx} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField fullWidth multiline minRows={4} label="Future Scope" value={form.futureScope} onChange={(event) => setForm({ ...form, futureScope: event.target.value })} sx={formFieldSx} />
                        </Grid>
                        <Grid item xs={12}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#111111' }}>Action Items</Typography>
                                <Button size="small" startIcon={<AddIcon />} onClick={addActionItem} sx={modalSecondaryButtonSx}>Add Item</Button>
                            </Stack>
                            <Stack spacing={1.5}>
                                {form.actionItems.length === 0 ? (
                                    <Paper variant="outlined" sx={{ p: 2, borderStyle: 'dashed' }}>
                                        <Typography variant="body2" sx={{ color: '#111111' }}>No action items yet.</Typography>
                                    </Paper>
                                ) : form.actionItems.map((item, index) => (
                                    <Paper key={item._localId || item._id || index} variant="outlined" sx={{ p: 2 }}>
                                        <Grid container spacing={1.5} alignItems="center">
                                            <Grid item xs={12} md={4}>
                                                <TextField fullWidth label="Item" value={item.text} onChange={(event) => handleActionItemChange(index, 'text', event.target.value)} sx={formFieldSx} />
                                            </Grid>
                                            <Grid item xs={12} md={3}>
                                                <Autocomplete
                                                    options={users}
                                                    value={userMap.get(item.assigneeId) || null}
                                                    onChange={(_, value) => handleActionItemChange(index, 'assigneeId', value?._id || '')}
                                                    getOptionLabel={(option) => option?.username || ''}
                                                    isOptionEqualToValue={(option, value) => option._id === value._id}
                                                    renderInput={(params) => <TextField {...params} label="Assignee" sx={formFieldSx} />}
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={2.5}>
                                                <TextField
                                                    fullWidth
                                                    type="datetime-local"
                                                    label="Due Date"
                                                    value={item.dueDate}
                                                    onChange={(event) => handleActionItemChange(index, 'dueDate', event.target.value)}
                                                    InputLabelProps={{ shrink: true }}
                                                    sx={formFieldSx}
                                                />
                                            </Grid>
                                            <Grid item xs={10} md={2}>
                                                <Select fullWidth value={item.status} onChange={(event) => handleActionItemChange(index, 'status', event.target.value)} sx={{ color: '#111111' }}>
                                                    <MenuItem value="pending">Pending</MenuItem>
                                                    <MenuItem value="in-progress">In Progress</MenuItem>
                                                    <MenuItem value="done">Done</MenuItem>
                                                </Select>
                                            </Grid>
                                            <Grid item xs={2} md={0.5}>
                                                <IconButton color="error" onClick={() => removeActionItem(index)}>
                                                    <DeleteOutlineIcon />
                                                </IconButton>
                                            </Grid>
                                        </Grid>
                                    </Paper>
                                ))}
                            </Stack>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={closeDialog} sx={modalSecondaryButtonSx}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmit} disabled={saving} sx={modalPrimaryButtonSx}>
                        {saving ? 'Saving...' : editingMeeting ? 'Save Changes' : 'Create Meeting'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={Boolean(detailMeeting)}
                onClose={() => setDetailMeeting(null)}
                maxWidth={false}
                scroll="paper"
                PaperProps={{
                    sx: sharedModalPaperSx(tokens, { xs: 'calc(100vw - 24px)', sm: '740px', md: '780px' }),
                }}
            >
                {detailMeeting ? (
                    <>
                        <DialogTitle sx={{ px: 3, pt: 3, pb: 2 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                                <Box>
                                    <Typography variant="h5" sx={{ fontWeight: 900, color: '#111111' }}>{detailMeeting.title}</Typography>
                                </Box>
                                <IconButton onClick={() => setDetailMeeting(null)}><CloseIcon /></IconButton>
                            </Stack>
                        </DialogTitle>
                        <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
                            <Stack spacing={2.5}>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Box
                                        sx={{
                                            px: 1.4,
                                            py: 0.75,
                                            borderRadius: 999,
                                            bgcolor: 'rgba(17, 17, 17, 0.05)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <StatusDot status={detailMeeting.status} size={12} />
                                    </Box>
                                    <Chip label={formatDateTime(detailMeeting.scheduledFor)} />
                                    <Chip label={`Organizer: ${detailMeeting.organizer?.username || '-'}`} />
                                </Stack>

                                {detailMeeting.location ? (
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Typography variant="caption" color="text.secondary">Location / Link</Typography>
                                        <Typography variant="body1" sx={{ mt: 0.5 }}>{detailMeeting.location}</Typography>
                                    </Paper>
                                ) : null}

                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="caption" color="text.secondary">Attendees</Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                        {(detailMeeting.attendees || []).map((attendee) => (
                                            <Chip key={attendee._id} label={attendee.username} />
                                        ))}
                                    </Stack>
                                </Paper>

                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="caption" color="text.secondary">Agenda</Typography>
                                    <Typography variant="body1" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{detailMeeting.agenda || 'No agenda added.'}</Typography>
                                </Paper>

                                <DetailBulletBlock label="Discussed" text={detailMeeting.discussionSummary} emptyText="No discussion notes yet." />

                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="caption" color="text.secondary">Decisions</Typography>
                                    <Typography variant="body1" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{detailMeeting.decisions || 'No decisions noted yet.'}</Typography>
                                </Paper>

                                <DetailBulletBlock label="Future Scope" text={detailMeeting.futureScope} emptyText="No future scope added yet." />

                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="caption" color="text.secondary">Action Items</Typography>
                                    <Stack spacing={1.25} sx={{ mt: 1 }}>
                                        {(detailMeeting.actionItems || []).length === 0 ? (
                                            <Typography variant="body2" color="text.secondary">No action items.</Typography>
                                        ) : detailMeeting.actionItems.map((item) => (
                                            <Box key={item._id} sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.text}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {item.assignee?.username ? `Assigned to ${item.assignee.username}` : 'No assignee'}
                                                    {item.dueDate ? ` • Due ${formatDateTime(item.dueDate)}` : ''}
                                                    {item.status ? ` • ${STATUS_LABELS[item.status] || item.status}` : ''}
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Stack>
                                </Paper>
                            </Stack>
                        </DialogContent>
                        {canEditMeeting(detailMeeting) ? (
                            <DialogActions sx={{ px: 3, py: 2 }}>
                                <Button variant="contained" onClick={() => openEditDialog(detailMeeting)} sx={modalPrimaryButtonSx}>
                                    Edit Meeting
                                </Button>
                            </DialogActions>
                        ) : null}
                    </>
                ) : null}
            </Dialog>
        </Container>
    );
}
