import { useEffect, useState, useCallback } from 'react';
import { Badge, Button } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { onSocketEvent } from '../lib/socket';
import { BRAND_YELLOW } from '../constants/brandTheme';

/**
 * Navbar "Team Chat" button with a live unread-message badge.
 * Mirrors DiscountAlertsBell's self-contained fetch-on-mount pattern, but
 * refreshes the count from Socket.IO `new_message`/`conversation_updated`
 * events instead of polling, so it stays correct across tabs/devices.
 */
export default function TeamChatButton() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/internal-messages/unread-count');
      setUnreadCount(data.count || 0);
    } catch (err) {
      console.error('Failed to load unread message count:', err);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    const offNewMessage = onSocketEvent('new_message', () => fetchUnreadCount());
    const offConversationUpdated = onSocketEvent('conversation_updated', () => fetchUnreadCount());
    return () => {
      offNewMessage();
      offConversationUpdated();
    };
  }, [fetchUnreadCount]);

  return (
    <Badge
      badgeContent={unreadCount}
      color="error"
      max={99}
      overlap="rectangular"
      sx={{
        mr: 1,
        '& .MuiBadge-badge': {
          fontWeight: 700,
          top: 4,
          right: 14,
        },
      }}
    >
      <Button
        startIcon={<ChatIcon />}
        onClick={() => navigate('/admin/internal-messages')}
        sx={{
          px: 1.8,
          minHeight: 40,
          borderRadius: 2.5,
          fontSize: '0.875rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: BRAND_YELLOW,
          border: '1px solid rgba(245, 200, 66, 0.22)',
          backgroundColor: 'rgba(245, 200, 66, 0.08)',
          '&:hover': {
            backgroundColor: 'rgba(245, 200, 66, 0.16)',
            borderColor: 'rgba(245, 200, 66, 0.34)'
          }
        }}
      >
        Team Chat
      </Button>
    </Badge>
  );
}
