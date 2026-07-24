// src/pages/admin/ManageStoresPage.jsx
import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { alpha as alpha4 } from "@mui/material/styles";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import api from "../../lib/api.js";

// src/components/SectionCard.jsx
import { Paper, useTheme } from "@mui/material";
import { alpha as alpha2 } from "@mui/material/styles";

// src/constants/brandTheme.js
var BRAND_YELLOW = "#f5c842";
var BRAND_YELLOW_DARK = "#f0b800";
var BRAND_DARK = "#1a1a2e";
var BRAND_DARK_ALT = "#252540";

// src/theme/appTheme.js
import { createTheme, alpha } from "@mui/material/styles";
var dashboardSignatureTokens = {
  radius: {
    card: 16,
    pill: 999,
    control: 8
  },
  surfaces: {
    pageCard: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
    metricCard: "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(240,249,255,0.95) 100%)",
    emptyState: "linear-gradient(135deg, #ffffff 0%, #ecf0f1 100%)"
  },
  shadows: {
    card: "0 8px 24px rgba(0, 0, 0, 0.08)",
    table: "0 12px 32px rgba(0, 0, 0, 0.1)"
  },
  table: {
    headerBackground: "#0f766e",
    headerForeground: "#ffffff",
    rowStripe: "rgba(240, 249, 255, 0.8)",
    rowHover: "rgba(20, 184, 166, 0.08)",
    rowBorder: "rgba(0, 0, 0, 0.06)",
    indexBadgeBackground: "rgba(20, 184, 166, 0.1)",
    indexBadgeForeground: "#0f766e"
  },
  tones: {
    neutral: { background: "rgba(15, 23, 42, 0.05)", border: "rgba(15, 23, 42, 0.08)", color: "#0f172a" },
    info: { background: "rgba(6, 182, 212, 0.12)", border: "rgba(6, 182, 212, 0.2)", color: "#0891b2" },
    success: { background: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.2)", color: "#047857" },
    warning: { background: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.18)", color: "#d97706" },
    danger: { background: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.18)", color: "#dc2626" },
    amazon: { background: "rgba(249, 115, 22, 0.12)", border: "rgba(249, 115, 22, 0.18)", color: "#c2410c" },
    shipping: { background: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.18)", color: "#2563eb" }
  }
};
var dashboardSignatureThemeOptions = {
  palette: {
    mode: "light",
    primary: {
      main: "#0f766e"
    },
    secondary: {
      main: "#06b6d4"
    },
    success: {
      main: "#10b981"
    },
    warning: {
      main: "#f59e0b"
    },
    error: {
      main: "#ef4444"
    },
    info: {
      main: "#0891b2"
    },
    background: {
      default: "#f0f9ff",
      paper: "#ffffff"
    }
  },
  shape: {
    borderRadius: dashboardSignatureTokens.radius.control
  },
  customTokens: {
    dashboardSignature: dashboardSignatureTokens
  }
};

// src/components/SectionCard.jsx
function SectionCard({ children, emphasized = false, sx, ...props }) {
  const theme = useTheme();
  const dashboardTheme = theme.customTokens?.dashboardSignature || dashboardSignatureTokens;
  return /* @__PURE__ */ React.createElement(
    Paper,
    {
      elevation: 0,
      sx: {
        borderRadius: `${dashboardTheme.radius.card}px`,
        border: "1px solid",
        borderColor: alpha2(BRAND_DARK, 0.08),
        backgroundColor: theme.palette.background.paper,
        boxShadow: emphasized ? dashboardTheme.shadows.table : dashboardTheme.shadows.card,
        ...sx
      },
      ...props
    },
    children
  );
}

// src/theme/tableStyles.js
import { alpha as alpha3 } from "@mui/material/styles";
var tableHeaderCellSx = {
  fontWeight: 700,
  fontSize: "0.74rem",
  letterSpacing: 0.55,
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.96)",
  backgroundColor: BRAND_DARK,
  borderBottom: "none",
  whiteSpace: "nowrap",
  py: 1.75,
  // Ensure TableSortLabel inherits the white colour
  "& .MuiTableSortLabel-root": { color: "inherit" },
  "& .MuiTableSortLabel-root:hover": { color: "rgba(255,255,255,0.8)" },
  "& .MuiTableSortLabel-root.Mui-active": { color: "inherit" },
  "& .MuiTableSortLabel-icon": { color: "rgba(255,255,255,0.55) !important" }
};
var tableBodyRowSx = {
  "& td": {
    borderBottomColor: dashboardSignatureTokens.table.rowBorder
  },
  "&:nth-of-type(even) td": {
    backgroundColor: dashboardSignatureTokens.table.rowStripe
  },
  "&:hover td": {
    backgroundColor: `${dashboardSignatureTokens.table.rowHover} !important`
  },
  "&.Mui-selected td": {
    backgroundColor: `${alpha3(BRAND_YELLOW, 0.16)} !important`
  }
};
var tableBodyCellSx = {
  py: 1.4,
  px: 1.5,
  borderBottom: `1px solid ${dashboardSignatureTokens.table.rowBorder}`,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums"
};
var tableContainerSx = {
  borderRadius: `${dashboardSignatureTokens.radius.card}px`,
  border: "1px solid",
  borderColor: alpha3(BRAND_DARK, 0.1),
  boxShadow: dashboardSignatureTokens.shadows.table,
  overflow: "hidden"
};
var tableIndexBadgeSx = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 32,
  height: 32,
  borderRadius: "50%",
  backgroundColor: dashboardSignatureTokens.table.indexBadgeBackground,
  color: dashboardSignatureTokens.table.indexBadgeForeground,
  fontWeight: 700,
  fontSize: "0.875rem"
};
var _actionButtonBase = {
  minHeight: 36,
  px: 1.5,
  borderRadius: 1.5,
  boxSizing: "border-box",
  whiteSpace: "nowrap"
};
var yellowOutlinedButtonSx = {
  ..._actionButtonBase,
  color: BRAND_DARK,
  borderColor: BRAND_YELLOW_DARK,
  backgroundColor: alpha3(BRAND_YELLOW, 0.08),
  "&:hover": {
    borderColor: BRAND_YELLOW_DARK,
    backgroundColor: alpha3(BRAND_YELLOW, 0.18),
    boxShadow: `0 8px 18px ${alpha3(BRAND_YELLOW_DARK, 0.18)}`
  },
  "&.Mui-disabled": {
    borderColor: alpha3(BRAND_DARK, 0.16),
    color: alpha3(BRAND_DARK, 0.35),
    backgroundColor: alpha3(BRAND_DARK, 0.03)
  }
};
var yellowFilledButtonSx = {
  ..._actionButtonBase,
  color: BRAND_DARK,
  backgroundColor: BRAND_YELLOW,
  boxShadow: `0 10px 20px ${alpha3(BRAND_YELLOW_DARK, 0.2)}`,
  "&:hover": {
    backgroundColor: BRAND_YELLOW_DARK,
    boxShadow: `0 12px 22px ${alpha3(BRAND_YELLOW_DARK, 0.26)}`
  },
  "&.Mui-disabled": {
    color: alpha3(BRAND_DARK, 0.35),
    backgroundColor: alpha3(BRAND_YELLOW, 0.38),
    boxShadow: "none"
  }
};

// src/pages/admin/ManageStoresPage.jsx
var inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#fff"
  }
};
function ManageStoresPage() {
  const [listingPlatforms, setListingPlatforms] = useState([]);
  const [platformId, setPlatformId] = useState("");
  const [name, setName] = useState("");
  const [stores, setStores] = useState([]);
  useEffect(() => {
    api.get("/platforms", { params: { type: "listing" } }).then(({ data }) => setListingPlatforms(data));
  }, []);
  useEffect(() => {
    if (platformId) {
      api.get("/stores", { params: { platformId } }).then(({ data }) => setStores(data));
    } else {
      setStores([]);
    }
  }, [platformId]);
  const add = async (e) => {
    e.preventDefault();
    if (!platformId) return;
    await api.post("/stores", { name, platformId });
    setName("");
    const { data } = await api.get("/stores", { params: { platformId } });
    setStores(data);
  };
  const selectedPlatform = listingPlatforms.find((platform) => platform._id === platformId);
  return /* @__PURE__ */ React.createElement(Box, { sx: { maxWidth: 1400, mx: "auto" } }, /* @__PURE__ */ React.createElement(
    SectionCard,
    {
      emphasized: true,
      sx: {
        mb: 3,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 55%, #31577d 100%)`,
        border: `1px solid ${alpha4(BRAND_YELLOW, 0.18)}`,
        color: "#fffdf0",
        position: "relative"
      }
    },
    /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", top: -92, right: -74, width: 260, height: 260, borderRadius: "50%", background: `radial-gradient(circle, ${alpha4(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` } }), /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", bottom: -88, left: "24%", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%)" } })),
    /* @__PURE__ */ React.createElement(
      Stack,
      {
        direction: { xs: "column", md: "row" },
        spacing: 3,
        justifyContent: "space-between",
        sx: { position: "relative", p: { xs: 3, md: 4 } }
      },
      /* @__PURE__ */ React.createElement(Box, { sx: { maxWidth: 760 } }, /* @__PURE__ */ React.createElement(
        Chip,
        {
          label: "Store Setup",
          size: "small",
          sx: {
            mb: 1.5,
            bgcolor: alpha4(BRAND_YELLOW, 0.14),
            color: BRAND_YELLOW,
            border: `1px solid ${alpha4(BRAND_YELLOW, 0.24)}`,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase"
          }
        }
      ), /* @__PURE__ */ React.createElement(Typography, { variant: "h4", sx: { fontWeight: 900, lineHeight: 1.1, mb: 1 } }, "Manage Stores"), /* @__PURE__ */ React.createElement(Typography, { sx: { color: "rgba(255, 253, 240, 0.76)", maxWidth: 640 } }, "Add and review stores for each listing platform using the newer admin dashboard styling and clearer platform context.")),
      /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "row", md: "column" }, spacing: 1.25 }, /* @__PURE__ */ React.createElement(Chip, { label: `${listingPlatforms.length} Platforms`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React.createElement(Chip, { label: `${stores.length} Stores`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React.createElement(Chip, { label: selectedPlatform?.name || "No platform selected", sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700, maxWidth: 220 } }))
    )
  ), /* @__PURE__ */ React.createElement(Stack, { spacing: 3 }, /* @__PURE__ */ React.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 } } }, /* @__PURE__ */ React.createElement(
    Box,
    {
      sx: {
        mb: 2.5,
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        border: `1px solid ${alpha4("#10b981", 0.18)}`,
        background: `linear-gradient(135deg, ${alpha4("#10b981", 0.12)} 0%, ${alpha4("#2563eb", 0.04)} 100%)`
      }
    },
    /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", sm: "row" }, spacing: 1.5, justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Stack, { direction: "row", spacing: 1.5, alignItems: "center" }, /* @__PURE__ */ React.createElement(Box, { sx: { width: 44, height: 44, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #10b981 0%, #2563eb 100%)", color: "#fff" } }, /* @__PURE__ */ React.createElement(StorefrontRoundedIcon, null)), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK } }, "Add Store"), /* @__PURE__ */ React.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, "Select a listing platform first, then attach the new store to that platform."))), /* @__PURE__ */ React.createElement(Chip, { label: selectedPlatform ? `${selectedPlatform.name} selected` : "Select a platform", sx: { alignSelf: { xs: "flex-start", sm: "center" }, bgcolor: alpha4(selectedPlatform ? "#10b981" : BRAND_DARK, 0.12), color: selectedPlatform ? "#10b981" : BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha4(selectedPlatform ? "#10b981" : BRAND_DARK, 0.18)}` } }))
  ), /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", md: "row" }, spacing: 1.5, component: "form", onSubmit: add }, /* @__PURE__ */ React.createElement(FormControl, { sx: { minWidth: 240, ...inputSx } }, /* @__PURE__ */ React.createElement(InputLabel, null, "Listing Platform"), /* @__PURE__ */ React.createElement(Select, { label: "Listing Platform", value: platformId, onChange: (e) => setPlatformId(e.target.value) }, listingPlatforms.map((platform) => /* @__PURE__ */ React.createElement(MenuItem, { key: platform._id, value: platform._id }, platform.name)))), /* @__PURE__ */ React.createElement(TextField, { label: "Store Name", value: name, onChange: (e) => setName(e.target.value), required: true, sx: { flex: 1, ...inputSx } }), /* @__PURE__ */ React.createElement(Button, { type: "submit", variant: "contained", disabled: !platformId, sx: yellowFilledButtonSx }, "Add Store"))), /* @__PURE__ */ React.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 } } }, /* @__PURE__ */ React.createElement(
    Box,
    {
      sx: {
        mb: 2.5,
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        border: `1px solid ${alpha4("#0f172a", 0.08)}`,
        background: "linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(16,185,129,0.04) 100%)"
      }
    },
    /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", sm: "row" }, spacing: 1.5, justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Stack, { direction: "row", spacing: 1.5, alignItems: "center" }, /* @__PURE__ */ React.createElement(Box, { sx: { width: 44, height: 44, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #31577d 100%)`, color: "#fff" } }, /* @__PURE__ */ React.createElement(Inventory2RoundedIcon, null)), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK } }, "Existing Stores"), /* @__PURE__ */ React.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, "Review the stores assigned to the currently selected listing platform."))), /* @__PURE__ */ React.createElement(Chip, { label: `${stores.length} visible`, sx: { alignSelf: { xs: "flex-start", sm: "center" }, bgcolor: alpha4(BRAND_DARK, 0.06), color: BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha4(BRAND_DARK, 0.1)}` } }))
  ), /* @__PURE__ */ React.createElement(TableContainer, { sx: tableContainerSx }, /* @__PURE__ */ React.createElement(Table, { size: "small" }, /* @__PURE__ */ React.createElement(TableHead, null, /* @__PURE__ */ React.createElement(TableRow, null, /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Store"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Platform"))), /* @__PURE__ */ React.createElement(TableBody, null, stores.length > 0 ? stores.map((store) => /* @__PURE__ */ React.createElement(TableRow, { key: store._id, sx: tableBodyRowSx }, /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, store.name), /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, store.platform?.name))) : /* @__PURE__ */ React.createElement(TableRow, { sx: tableBodyRowSx }, /* @__PURE__ */ React.createElement(TableCell, { colSpan: 2, sx: { ...tableBodyCellSx, py: 3, color: alpha4(BRAND_DARK, 0.62) } }, platformId ? "No stores found for the selected platform." : "Select a listing platform to view stores."))))))));
}
export {
  ManageStoresPage as default
};
