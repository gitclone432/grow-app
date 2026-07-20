import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Box,
  Card,
  Chip,
  Grid,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import TaskIcon from '@mui/icons-material/Task';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import StoreIcon from '@mui/icons-material/Store';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import AppsIcon from '@mui/icons-material/Apps';
import PersonIcon from '@mui/icons-material/Person';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ChatIcon from '@mui/icons-material/Chat';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LayersIcon from '@mui/icons-material/Layers';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import StorefrontIcon from '@mui/icons-material/Storefront';
import SettingsIcon from '@mui/icons-material/Settings';
import usePageAccess from '../../hooks/usePageAccess';
import { PAGE_CATEGORIES, PAGE_REGISTRY, SUBMENUS } from '../../constants/pages';
import {
  BRAND_DARK,
  BRAND_DARK_ALT,
  BRAND_YELLOW,
  BRAND_YELLOW_DARK,
} from '../../constants/brandTheme';

const CATEGORY_STYLES = {
  storeListings:   { accent: '#0ea5e9', accentLight: '#e0f2fe', border: '#bae6fd', iconBg: 'linear-gradient(135deg,#0ea5e9,#0284c7)', shadow: 'rgba(14,165,233,0.22)' },
  orderFulfilment: { accent: '#f59e0b', accentLight: '#fef3c7', border: '#fde68a', iconBg: 'linear-gradient(135deg,#f59e0b,#d97706)', shadow: 'rgba(245,158,11,0.25)' },
  compatibility:   { accent: '#10b981', accentLight: '#d1fae5', border: '#a7f3d0', iconBg: 'linear-gradient(135deg,#10b981,#059669)', shadow: 'rgba(16,185,129,0.22)' },
  listingResearch: { accent: '#3b82f6', accentLight: '#dbeafe', border: '#bfdbfe', iconBg: 'linear-gradient(135deg,#3b82f6,#2563eb)', shadow: 'rgba(59,130,246,0.22)' },
  finance:         { accent: '#ec4899', accentLight: '#fce7f3', border: '#fbcfe8', iconBg: 'linear-gradient(135deg,#ec4899,#db2777)', shadow: 'rgba(236,72,153,0.22)' },
  compliance:      { accent: '#8b5cf6', accentLight: '#ede9fe', border: '#ddd6fe', iconBg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', shadow: 'rgba(139,92,246,0.22)' },
  ebayParams:      { accent: '#06b6d4', accentLight: '#cffafe', border: '#a5f3fc', iconBg: 'linear-gradient(135deg,#06b6d4,#0891b2)', shadow: 'rgba(6,182,212,0.22)' },
  hrManagement:    { accent: '#f97316', accentLight: '#ffedd5', border: '#fed7aa', iconBg: 'linear-gradient(135deg,#f97316,#ea580c)', shadow: 'rgba(249,115,22,0.22)' },
  others:          { accent: '#64748b', accentLight: '#f1f5f9', border: '#e2e8f0', iconBg: 'linear-gradient(135deg,#64748b,#475569)', shadow: 'rgba(100,116,139,0.18)' },
  etsy:            { accent: '#f1641e', accentLight: '#ffedd5', border: '#fed7aa', iconBg: 'linear-gradient(135deg,#f1641e,#c2410c)', shadow: 'rgba(241,100,30,0.22)' },
  settingsSection: { accent: '#475569', accentLight: '#f1f5f9', border: '#e2e8f0', iconBg: 'linear-gradient(135deg,#475569,#334155)', shadow: 'rgba(71,85,105,0.18)' },
};

const CATEGORY_ICONS = {
  storeListings:   Inventory2Icon,
  orderFulfilment: LocalShippingIcon,
  compatibility:   TaskIcon,
  listingResearch: ListAltIcon,
  finance:         AttachMoneyIcon,
  compliance:      AdminPanelSettingsIcon,
  ebayParams:      StoreIcon,
  hrManagement:    SupervisorAccountIcon,
  others:          AppsIcon,
  etsy:            StorefrontIcon,
  settingsSection: SettingsIcon,
};

const ROLE_LABELS = {
  superadmin:          'Super Admin',
  productadmin:        'Product Admin',
  listingadmin:        'Listing Admin',
  compatibilityadmin:  'Compatibility Admin',
  compatibilityeditor: 'Compatibility Editor',
  fulfillmentadmin:    'Fulfillment Admin',
  hradmin:             'HR Admin',
  hr:                  'HR',
  operationhead:       'Operation Head',
  hoc:                 'Head of Compliance',
  compliancemanager:   'Compliance Manager',
  lister:              'Lister',
  advancelister:       'Advance Lister',
  trainee:             'Trainee',
  seller:              'Seller',
};

const QUICK_LINKS = [
  { label: 'About Me',      path: '/admin/about-me',           icon: PersonIcon,         color: '#8b5cf6' },
  { label: 'My Leaves',     path: '/admin/my-leaves',          icon: EventAvailableIcon,  color: '#10b981' },
  { label: 'Team Chat',     path: '/admin/internal-messages',  icon: ChatIcon,            color: '#3b82f6' },
  { label: 'Ideas & Issues',path: '/admin/ideas',              icon: LightbulbIcon,       color: '#f59e0b' },
];

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function WelcomePage({ user }) {
  const {
    hasAccess,
    accessibleCategories,
    getAccessiblePages,
    getSubmenuPages,
    hasSubmenuAccess,
    isSuper,
  } = usePageAccess(user);

  const totalPageCount = useMemo(
    () => PAGE_REGISTRY.filter(p => hasAccess(p.id)).length,
    [hasAccess],
  );

  const initials = (user?.username || 'U').slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[user?.role] || user?.role;
  const greeting = getTimeGreeting();

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>

      {/* ─── HERO ────────────────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          mb: 4,
          borderRadius: 4,
          background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #1e1e3a 50%, ${BRAND_DARK_ALT} 100%)`,
          border: '1px solid rgba(245,200,66,0.18)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* decorative glows */}
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${BRAND_YELLOW}22 0%, transparent 70%)` }} />
          <Box sx={{ position: 'absolute', bottom: -60, left: '30%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
          <Box sx={{ position: 'absolute', top: '20%', left: -40, width: 180, height: 180, borderRadius: '50%', background: `radial-gradient(circle, ${BRAND_YELLOW}11 0%, transparent 70%)` }} />
        </Box>

        <Box sx={{ position: 'relative', p: { xs: 3, md: 4.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5, flexWrap: 'wrap', mb: 3 }}>
            {/* Avatar */}
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              <Avatar
                sx={{
                  width: 68,
                  height: 68,
                  background: `linear-gradient(135deg, ${BRAND_YELLOW} 0%, ${BRAND_YELLOW_DARK} 100%)`,
                  color: BRAND_DARK,
                  fontWeight: 900,
                  fontSize: '1.5rem',
                  boxShadow: `0 8px 28px ${BRAND_YELLOW}55`,
                  border: '3px solid rgba(245,200,66,0.35)',
                }}
              >
                {initials}
              </Avatar>
              {/* Online dot */}
              <Box sx={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', bgcolor: '#22c55e', border: '2px solid #1a1a2e' }} />
            </Box>

            {/* Text */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{ color: `${BRAND_YELLOW}aa`, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', mb: 0.4 }}
              >
                {greeting}
              </Typography>
              <Typography
                variant="h4"
                sx={{ fontWeight: 900, color: '#fffdf0', lineHeight: 1.15, mb: 0.8, fontSize: { xs: '1.6rem', md: '2rem' } }}
              >
                {user?.username}
              </Typography>
              <Chip
                label={roleLabel}
                size="small"
                sx={{
                  background: `linear-gradient(135deg, ${BRAND_YELLOW}28, ${BRAND_YELLOW}14)`,
                  color: BRAND_YELLOW,
                  border: `1px solid ${BRAND_YELLOW}44`,
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  letterSpacing: '0.04em',
                  height: 24,
                }}
              />
            </Box>
          </Box>

          {/* Stats row */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <StatPill value={totalPageCount} label={totalPageCount === 1 ? 'Page' : 'Pages'} />
            <StatPill value={accessibleCategories.length} label={accessibleCategories.length === 1 ? 'Category' : 'Categories'} />
            <StatPill value={new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} label="Today" />
          </Box>
        </Box>
      </Paper>

      {/* ─── QUICK LINKS (non-superadmin) ────────────────────────────────── */}
      {!isSuper && (
        <Box sx={{ mb: 4 }}>
          <SectionLabel>Quick Links</SectionLabel>
          <Grid container spacing={1.5}>
            {QUICK_LINKS.map(item => {
              const Icon = item.icon;
              return (
                <Grid item xs={6} sm={3} key={item.label}>
                  <Box
                    component={Link}
                    to={item.path}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.8,
                      borderRadius: 3,
                      textDecoration: 'none',
                      border: '1px solid',
                      borderColor: `${item.color}33`,
                      bgcolor: `${item.color}0d`,
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: `${item.color}1a`,
                        borderColor: `${item.color}66`,
                        transform: 'translateY(-2px)',
                        boxShadow: `0 6px 20px ${item.color}22`,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        bgcolor: `${item.color}22`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon sx={{ fontSize: '1.1rem', color: item.color }} />
                    </Box>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: BRAND_DARK, lineHeight: 1.3 }}>
                      {item.label}
                    </Typography>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* ─── CATEGORY CARDS ──────────────────────────────────────────────── */}
      {accessibleCategories.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 4,
            bgcolor: '#f8fafc',
            border: '1px dashed #cbd5e1',
          }}
        >
          <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
            <LayersIcon sx={{ fontSize: '2rem', color: '#94a3b8' }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#475569', mb: 0.5 }}>
            No pages assigned yet
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            Contact your administrator to request page access.
          </Typography>
        </Paper>
      ) : (
        <>
          <SectionLabel>Your Pages</SectionLabel>
          <Grid container spacing={2.5}>
            {accessibleCategories.map(catId => {
              const category = PAGE_CATEGORIES[catId];
              const IconComponent = CATEGORY_ICONS[catId] || AppsIcon;
              const c = CATEGORY_STYLES[catId] || CATEGORY_STYLES.others;
              const pages = getAccessiblePages(catId);
              const directPages = pages.filter(p => !p.submenu);
              const submenuIds = [...new Set(pages.filter(p => p.submenu).map(p => p.submenu))];

              return (
                <Grid item xs={12} sm={6} lg={4} key={catId}>
                  <Card
                    elevation={0}
                    sx={{
                      height: '100%',
                      borderRadius: 3,
                      border: `1px solid ${c.border}`,
                      bgcolor: '#fff',
                      overflow: 'hidden',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-3px)',
                        boxShadow: `0 12px 32px ${c.shadow}`,
                      },
                    }}
                  >
                    {/* Coloured header strip */}
                    <Box
                      sx={{
                        p: 2,
                        background: c.accentLight,
                        borderBottom: `1px solid ${c.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 42,
                          height: 42,
                          borderRadius: 2.5,
                          background: c.iconBg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: `0 4px 14px ${c.shadow}`,
                          flexShrink: 0,
                        }}
                      >
                        <IconComponent sx={{ fontSize: '1.25rem', color: '#fff' }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: BRAND_DARK, lineHeight: 1.2 }}>
                          {category.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
                          {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                        </Typography>
                      </Box>
                      <Chip
                        label={pages.length}
                        size="small"
                        sx={{ bgcolor: c.accent + '22', color: c.accent, fontWeight: 800, fontSize: '0.78rem', height: 22, border: `1px solid ${c.accent}33` }}
                      />
                    </Box>

                    {/* Page list */}
                    <Box sx={{ p: 1.5, pt: 1.2 }}>
                      {directPages.map(page => (
                        <PageLink key={page.id} page={page} accent={c.accent} />
                      ))}

                      {submenuIds.map(smId => {
                        if (!hasSubmenuAccess(smId)) return null;
                        const sm = SUBMENUS[smId];
                        const smPages = getSubmenuPages(smId);
                        return (
                          <Box key={smId} sx={{ mt: 0.8 }}>
                            <Typography
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                px: 1.2,
                                mb: 0.4,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color: '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                              }}
                            >
                              <LayersIcon sx={{ fontSize: '0.8rem' }} />
                              {sm.name}
                            </Typography>
                            {smPages.map(page => (
                              <PageLink key={page.id} page={page} accent={c.accent} />
                            ))}
                          </Box>
                        );
                      })}
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </Box>
  );
}

function StatPill({ value, label }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.9,
        borderRadius: 2.5,
        bgcolor: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(245,200,66,0.2)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Typography sx={{ fontWeight: 800, color: BRAND_YELLOW, fontSize: '1rem', lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography sx={{ color: 'rgba(255,253,240,0.5)', fontSize: '0.75rem', fontWeight: 500 }}>
        {label}
      </Typography>
    </Box>
  );
}

function SectionLabel({ children }) {
  return (
    <Typography
      sx={{
        display: 'block',
        fontWeight: 800,
        fontSize: '0.7rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#94a3b8',
        mb: 1.5,
      }}
    >
      {children}
    </Typography>
  );
}

function PageLink({ page, accent }) {
  return (
    <Tooltip title={`Go to ${page.name}`} placement="right" enterDelay={600}>
      <Box
        component={Link}
        to={`/admin${page.path}`}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.4,
          py: 0.75,
          mb: 0.25,
          borderRadius: 2,
          textDecoration: 'none',
          color: '#334155',
          fontSize: '0.85rem',
          fontWeight: 500,
          transition: 'all 0.15s',
          '& .arrow': { opacity: 0, transform: 'translateX(-4px)', transition: 'all 0.15s', color: accent },
          '&:hover': {
            bgcolor: accent + '15',
            color: accent,
            fontWeight: 600,
            '& .arrow': { opacity: 1, transform: 'translateX(0)' },
          },
        }}
      >
        <span>{page.name}</span>
        <ChevronRightIcon className="arrow" sx={{ fontSize: '0.95rem' }} />
      </Box>
    </Tooltip>
  );
}
