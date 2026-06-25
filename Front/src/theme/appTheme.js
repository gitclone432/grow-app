import { createTheme, alpha } from '@mui/material/styles';

function getButtonPalette(theme, color) {
    if (color && color !== 'inherit' && theme.palette[color]) {
        return theme.palette[color];
    }

    return theme.palette.primary;
}

export const dashboardSignatureTokens = {
    radius: {
        card: 16,
        pill: 999,
        control: 8
    },
    surfaces: {
        pageCard: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
        metricCard: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(240,249,255,0.95) 100%)',
        emptyState: 'linear-gradient(135deg, #ffffff 0%, #ecf0f1 100%)'
    },
    shadows: {
        card: '0 8px 24px rgba(0, 0, 0, 0.08)',
        table: '0 12px 32px rgba(0, 0, 0, 0.1)'
    },
    table: {
        headerBackground: '#0f766e',
        headerForeground: '#ffffff',
        rowStripe: 'rgba(240, 249, 255, 0.8)',
        rowHover: 'rgba(20, 184, 166, 0.08)',
        rowBorder: 'rgba(0, 0, 0, 0.06)',
        indexBadgeBackground: 'rgba(20, 184, 166, 0.1)',
        indexBadgeForeground: '#0f766e'
    },
    tones: {
        neutral: { background: 'rgba(15, 23, 42, 0.05)', border: 'rgba(15, 23, 42, 0.08)', color: '#0f172a' },
        info: { background: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.2)', color: '#0891b2' },
        success: { background: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.2)', color: '#047857' },
        warning: { background: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.18)', color: '#d97706' },
        danger: { background: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.18)', color: '#dc2626' },
        amazon: { background: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.18)', color: '#c2410c' },
        shipping: { background: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.18)', color: '#2563eb' }
    }
};

export const dashboardSignatureThemeOptions = {
    palette: {
        mode: 'light',
        primary: {
            main: '#0f766e'
        },
        secondary: {
            main: '#06b6d4'
        },
        success: {
            main: '#10b981'
        },
        warning: {
            main: '#f59e0b'
        },
        error: {
            main: '#ef4444'
        },
        info: {
            main: '#0891b2'
        },
        background: {
            default: '#f0f9ff',
            paper: '#ffffff'
        }
    },
    shape: {
        borderRadius: dashboardSignatureTokens.radius.control
    },
    customTokens: {
        dashboardSignature: dashboardSignatureTokens
    }
};

export function createAppTheme() {
    return createTheme({
        palette: { mode: 'light' },
        typography: { fontFamily: "'Inter', sans-serif" },
        components: {
            MuiButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 8,
                        textTransform: 'none',
                        fontWeight: 500,
                        letterSpacing: 0.2,
                        transition: theme.transitions.create(['background-color', 'border-color', 'box-shadow'], {
                            duration: theme.transitions.duration.shorter,
                        }),
                    }),
                    outlined: ({ theme, ownerState }) => {
                        if (ownerState.color === 'inherit') {
                            return {};
                        }

                        const paletteColor = getButtonPalette(theme, ownerState.color);

                        return {
                            '&:hover': {
                                borderColor: paletteColor.main,
                                backgroundColor: alpha(paletteColor.main, 0.06),
                            },
                        };
                    },
                    contained: ({ theme }) => ({
                        boxShadow: 'none',
                        '&:hover': {
                            boxShadow: theme.shadows[2],
                        },
                    }),
                },
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: {
                        borderRadius: 8,
                    },
                },
            },
            MuiChip: {
                styleOverrides: {
                    root: {
                        fontWeight: 500,
                    },
                },
            },
            MuiToggleButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 8,
                        textTransform: 'none',
                        fontWeight: 500,
                        transition: theme.transitions.create(['background-color', 'border-color', 'box-shadow'], {
                            duration: theme.transitions.duration.shorter,
                        }),
                        '&:hover': {
                            borderColor: alpha(theme.palette.primary.main, 0.4),
                            backgroundColor: alpha(theme.palette.primary.main, 0.06),
                        },
                        '&.Mui-selected': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.12),
                            color: theme.palette.primary.main,
                        },
                        '&.Mui-selected:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.18),
                        },
                    }),
                },
            },
            MuiToggleButtonGroup: {
                styleOverrides: {
                    grouped: {
                        '&:first-of-type': {
                            borderRadius: '8px 0 0 8px',
                        },
                        '&:last-of-type': {
                            borderRadius: '0 8px 8px 0',
                        },
                    },
                },
            },
            MuiSwitch: {
                styleOverrides: {
                    root: {
                        width: 46,
                        height: 28,
                        padding: 0,
                    },
                    switchBase: {
                        padding: 0,
                        margin: 2,
                        transitionDuration: '200ms',
                        '&.Mui-checked': {
                            transform: 'translateX(18px)',
                            color: '#fff',
                            '& + .MuiSwitch-track': {
                                backgroundColor: '#34C759',
                                opacity: 1,
                                border: 0,
                            },
                        },
                    },
                    thumb: {
                        width: 24,
                        height: 24,
                        backgroundColor: '#fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    },
                    track: {
                        borderRadius: 14,
                        backgroundColor: '#c0c0c8',
                        opacity: 1,
                    },
                },
            },
        },
    });
}
