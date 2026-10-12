import { Box } from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';

// Fixed 48px listing thumbnail, falling back to a neutral placeholder so rows
// keep their alignment while images are still loading (or are absent).
export default function ListingThumb({ url, title }) {
  if (!url) {
    return (
      <Box
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 1,
          bgcolor: '#f1f5f9',
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <ImageIcon sx={{ fontSize: 18, color: '#cbd5e1' }} />
      </Box>
    );
  }
  return (
    <Box component="a" href={url} target="_blank" rel="noopener noreferrer" sx={{ flexShrink: 0, lineHeight: 0 }}>
      <Box
        component="img"
        src={url}
        alt={title || 'listing image'}
        loading="lazy"
        sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #e5e7eb' }}
      />
    </Box>
  );
}
