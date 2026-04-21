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
        pageCard: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
        metricCard: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(248,250,252,0.92) 100%)',
        emptyState: 'linear-gradient(180deg, #ffffff 0%, #fafcff 100%)'
    },
    shadows: {
        card: '0 14px 36px rgba(15, 23, 42, 0.06)',
        table: '0 18px 40px rgba(15, 23, 42, 0.06)'
    },
    table: {
        headerBackground: '#123b63',
        headerForeground: '#ffffff',
        rowStripe: 'rgba(248, 250, 252, 0.7)',
        rowHover: 'rgba(37, 99, 235, 0.04)',
        rowBorder: 'rgba(15, 23, 42, 0.08)',
        indexBadgeBackground: 'rgba(18, 59, 99, 0.08)',
        indexBadgeForeground: '#123b63'
    },
    tones: {
        neutral: { background: 'rgba(15, 23, 42, 0.05)', border: 'rgba(15, 23, 42, 0.08)', color: '#0f172a' },
        info: { background: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.18)', color: '#075985' },
        success: { background: 'rgba(22, 163, 74, 0.12)', border: 'rgba(22, 163, 74, 0.18)', color: '#166534' },
        warning: { background: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.2)', color: '#92400e' },
        danger: { background: 'rgba(220, 38, 38, 0.1)', border: 'rgba(220, 38, 38, 0.15)', color: '#b91c1c' },
        amazon: { background: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.18)', color: '#9a3412' },
        shipping: { background: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.18)', color: '#1d4ed8' }
    }
};

export const dashboardSignatureThemeOptions = {
    palette: {
        mode: 'light',
        primary: {
            main: '#123b63'
        },
        secondary: {
            main: '#2563eb'
        },
        success: {
            main: '#166534'
        },
        warning: {
            main: '#92400e'
        },
        error: {
            main: '#b91c1c'
        },
        info: {
            main: '#075985'
        },
        background: {
            default: '#f8fbff',
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
