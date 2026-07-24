// src/pages/admin/UserPerformancePage.jsx
import React2, { useState, useEffect, useMemo, useRef } from "react";
import {
  Chip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  Alert,
  Box,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import { alpha as alpha4 } from "@mui/material/styles";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import api from "../../lib/api";

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

// src/pages/admin/UserPerformancePage.jsx
var chartColors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#06b6d4", "#ec4899", "#0f766e"];
var remarkOptions = ["", "Good", "Average", "Need for improvement"];
function getCurrentDateString() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function getDateDaysAgo(days) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
var UserPerformancePage = () => {
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const userRole = user?.role || "";
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("user");
  const [dateMode, setDateMode] = useState("range");
  const [selectedDate, setSelectedDate] = useState(() => getCurrentDateString());
  const [startDate, setStartDate] = useState(() => getDateDaysAgo(30));
  const [endDate, setEndDate] = useState(() => getCurrentDateString());
  const didAutoDateRef = useRef(false);
  const canManageRemarks = ["superadmin", "hr", "hradmin"].includes(userRole);
  useEffect(() => {
    fetchPerformance();
  }, []);
  const fetchPerformance = async () => {
    try {
      const { data } = await api.get("/user-sellers/performance");
      setRecords(data);
    } catch (err) {
      console.error("Failed to fetch performance records:", err);
      setError("Failed to load performance data");
    }
  };
  useEffect(() => {
    if (didAutoDateRef.current || !records.length) return;
    const dates = [...new Set(records.map((r) => r.dateString).filter(Boolean))].sort();
    if (!dates.length) return;
    if (dateMode === "single") {
      const hasSelected = records.some((r) => r.dateString === selectedDate);
      if (!hasSelected) {
        setSelectedDate(dates[dates.length - 1]);
      }
    } else {
      const hasInRange = records.some((r) => {
        if (startDate && r.dateString < startDate) return false;
        if (endDate && r.dateString > endDate) return false;
        return true;
      });
      if (!hasInRange) {
        setStartDate(dates[0]);
        setEndDate(dates[dates.length - 1]);
      }
    }
    didAutoDateRef.current = true;
  }, [records, dateMode, selectedDate, startDate, endDate]);
  const handleRemarkChange = async (id, newRemark) => {
    try {
      await api.patch(`/user-sellers/performance/${id}/remarks`, { remarks: newRemark });
      setRecords(
        (prev) => prev.map((r) => r._id === id ? { ...r, remarks: newRemark } : r)
      );
    } catch (err) {
      console.error("Failed to update remark:", err);
      alert("Failed to update remark");
    }
  };
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (!record.dateString) return false;
      if (dateMode === "single") {
        return record.dateString === selectedDate;
      }
      if (startDate && record.dateString < startDate) return false;
      if (endDate && record.dateString > endDate) return false;
      return true;
    });
  }, [records, dateMode, selectedDate, startDate, endDate]);
  const groupRowsByUser = (sourceRecords) => {
    const grouped = /* @__PURE__ */ new Map();
    sourceRecords.forEach((record) => {
      const userId = record.user?._id || record.user?.username || "unknown";
      const key = `${record.dateString}::${userId}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += Number(record.quantity) || 0;
        existing.targetQuantity += Number(record.targetQuantity) || 0;
        existing.sellerNames.add(record.seller?.user?.username || record.seller?.storeName || record.seller?._id || "Unknown");
      } else {
        grouped.set(key, {
          _id: key,
          dateString: record.dateString,
          user: record.user,
          sellerNames: /* @__PURE__ */ new Set([record.seller?.user?.username || record.seller?.storeName || record.seller?._id || "Unknown"]),
          quantity: Number(record.quantity) || 0,
          targetQuantity: Number(record.targetQuantity) || 0,
          remarks: ""
        });
      }
    });
    return Array.from(grouped.values()).map((row) => ({
      ...row,
      sellerDisplay: Array.from(row.sellerNames).join(", ")
    })).sort((a, b) => b.dateString.localeCompare(a.dateString) || String(a.user?.username || "").localeCompare(String(b.user?.username || "")));
  };
  const displayRows = useMemo(() => {
    if (viewMode === "seller") {
      return filteredRecords;
    }
    return groupRowsByUser(filteredRecords);
  }, [filteredRecords, viewMode]);
  const chartRows = useMemo(() => {
    if (viewMode === "seller") {
      return records;
    }
    return groupRowsByUser(records);
  }, [records, viewMode]);
  const chartSeries = useMemo(() => {
    const seriesMap = {};
    chartRows.forEach((row) => {
      const key = row.dateString;
      if (!seriesMap[key]) {
        seriesMap[key] = { date: key };
      }
      const label = viewMode === "seller" ? row.seller?.user?.username || row.seller?.storeName || row.seller?._id || "Unknown" : row.user?.username || "Unknown";
      if (!seriesMap[key][label]) {
        seriesMap[key][label] = 0;
      }
      seriesMap[key][label] += Number(row.quantity) || 0;
    });
    return Object.values(seriesMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [chartRows, viewMode]);
  const chartKeys = useMemo(() => {
    const keys = /* @__PURE__ */ new Set();
    chartRows.forEach((row) => {
      const label = viewMode === "seller" ? row.seller?.user?.username || row.seller?.storeName || row.seller?._id || "Unknown" : row.user?.username || "Unknown";
      keys.add(label);
    });
    return Array.from(keys);
  }, [chartRows, viewMode]);
  const sellerCount = new Set(records.map((record) => record.seller?._id).filter(Boolean)).size;
  const getRemarkChipSx = (remark) => {
    if (remark === "Good") {
      return {
        color: "#166534",
        bgcolor: alpha4("#16a34a", 0.12),
        border: `1px solid ${alpha4("#16a34a", 0.2)}`
      };
    }
    if (remark === "Average") {
      return {
        color: "#92400e",
        bgcolor: alpha4("#f59e0b", 0.14),
        border: `1px solid ${alpha4("#f59e0b", 0.22)}`
      };
    }
    if (remark === "Need for improvement") {
      return {
        color: "#b91c1c",
        bgcolor: alpha4("#ef4444", 0.12),
        border: `1px solid ${alpha4("#ef4444", 0.2)}`
      };
    }
    return {
      color: alpha4(BRAND_DARK, 0.76),
      bgcolor: alpha4(BRAND_DARK, 0.05),
      border: `1px solid ${alpha4(BRAND_DARK, 0.1)}`
    };
  };
  return /* @__PURE__ */ React2.createElement(Box, { sx: { maxWidth: 1600, mx: "auto" } }, /* @__PURE__ */ React2.createElement(
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
    /* @__PURE__ */ React2.createElement(Box, { sx: { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" } }, /* @__PURE__ */ React2.createElement(Box, { sx: { position: "absolute", top: -96, right: -68, width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle, ${alpha4(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` } }), /* @__PURE__ */ React2.createElement(Box, { sx: { position: "absolute", bottom: -88, left: "24%", width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, transparent 70%)" } })),
    /* @__PURE__ */ React2.createElement(Box, { sx: { position: "relative", p: { xs: 3, md: 4 }, display: "flex", gap: 3, flexDirection: { xs: "column", md: "row" }, justifyContent: "space-between" } }, /* @__PURE__ */ React2.createElement(Box, { sx: { maxWidth: 840 } }, /* @__PURE__ */ React2.createElement(
      Chip,
      {
        label: "Performance Analytics",
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
    ), /* @__PURE__ */ React2.createElement(Typography, { variant: "h4", component: "h1", sx: { fontWeight: 900, lineHeight: 1.1, mb: 1 } }, "User Daily Performance"), /* @__PURE__ */ React2.createElement(Typography, { sx: { color: "rgba(255, 253, 240, 0.76)", maxWidth: 720 } }, "Review completed quantities over time, compare contributor output, and manage performance remarks from the updated admin dashboard layout.")), /* @__PURE__ */ React2.createElement(Box, { sx: { display: "flex", gap: 1.25, flexDirection: { xs: "row", md: "column" }, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement(Chip, { label: `${displayRows.length} Visible Rows`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React2.createElement(Chip, { label: `${chartKeys.length} ${viewMode === "seller" ? "Seller Accounts" : "Users"}`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React2.createElement(Chip, { label: `${sellerCount} Sellers`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } })))
  ), error && /* @__PURE__ */ React2.createElement(Alert, { severity: "error", sx: { mb: 2 } }, error), !error && records.length === 0 && /* @__PURE__ */ React2.createElement(Alert, { severity: "info", sx: { mb: 2 } }, "No performance rows yet. Stores appear here only after they are assigned under", " ", /* @__PURE__ */ React2.createElement("strong", null, "User-Seller Assignments"), " with a ", /* @__PURE__ */ React2.createElement("strong", null, "Daily Target > 0"), "."), /* @__PURE__ */ React2.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 }, mb: 3 } }, /* @__PURE__ */ React2.createElement(Box, { sx: { mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha4(BRAND_DARK, 0.08)}`, background: "linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(37,99,235,0.04) 100%)" } }, /* @__PURE__ */ React2.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK, mb: 0.5 } }, "View Controls"), /* @__PURE__ */ React2.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, "Switch between user and seller-account views, and filter the logs by a single date or a date range.")), /* @__PURE__ */ React2.createElement(Stack, { direction: { xs: "column", lg: "row" }, spacing: 2, justifyContent: "space-between" }, /* @__PURE__ */ React2.createElement(Stack, { direction: { xs: "column", md: "row" }, spacing: 2 }, /* @__PURE__ */ React2.createElement(Box, null, /* @__PURE__ */ React2.createElement(Typography, { variant: "caption", sx: { display: "block", mb: 0.75, color: alpha4(BRAND_DARK, 0.64), fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" } }, "Group By"), /* @__PURE__ */ React2.createElement(
    ToggleButtonGroup,
    {
      exclusive: true,
      value: viewMode,
      onChange: (_, nextValue) => nextValue && setViewMode(nextValue),
      size: "small"
    },
    /* @__PURE__ */ React2.createElement(ToggleButton, { value: "user" }, "User"),
    /* @__PURE__ */ React2.createElement(ToggleButton, { value: "seller" }, "Seller Account")
  )), /* @__PURE__ */ React2.createElement(Box, null, /* @__PURE__ */ React2.createElement(Typography, { variant: "caption", sx: { display: "block", mb: 0.75, color: alpha4(BRAND_DARK, 0.64), fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" } }, "Date Mode"), /* @__PURE__ */ React2.createElement(
    ToggleButtonGroup,
    {
      exclusive: true,
      value: dateMode,
      onChange: (_, nextValue) => nextValue && setDateMode(nextValue),
      size: "small"
    },
    /* @__PURE__ */ React2.createElement(ToggleButton, { value: "single" }, "Single Date"),
    /* @__PURE__ */ React2.createElement(ToggleButton, { value: "range" }, "Date Range")
  ))), /* @__PURE__ */ React2.createElement(Stack, { direction: { xs: "column", sm: "row" }, spacing: 1.5 }, dateMode === "single" ? /* @__PURE__ */ React2.createElement(
    TextField,
    {
      label: "Date",
      type: "date",
      size: "small",
      value: selectedDate,
      onChange: (e) => setSelectedDate(e.target.value),
      InputLabelProps: { shrink: true },
      sx: { minWidth: 180, "& .MuiOutlinedInput-root": { backgroundColor: "#fff" } }
    }
  ) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
    TextField,
    {
      label: "Start Date",
      type: "date",
      size: "small",
      value: startDate,
      onChange: (e) => setStartDate(e.target.value),
      InputLabelProps: { shrink: true },
      sx: { minWidth: 180, "& .MuiOutlinedInput-root": { backgroundColor: "#fff" } }
    }
  ), /* @__PURE__ */ React2.createElement(
    TextField,
    {
      label: "End Date",
      type: "date",
      size: "small",
      value: endDate,
      onChange: (e) => setEndDate(e.target.value),
      InputLabelProps: { shrink: true },
      sx: { minWidth: 180, "& .MuiOutlinedInput-root": { backgroundColor: "#fff" } }
    }
  ))))), chartSeries.length > 0 ? /* @__PURE__ */ React2.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 }, mb: 3 } }, /* @__PURE__ */ React2.createElement(Box, { sx: { mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha4("#2563eb", 0.14)}`, background: `linear-gradient(135deg, ${alpha4("#2563eb", 0.1)} 0%, ${alpha4("#10b981", 0.04)} 100%)` } }, /* @__PURE__ */ React2.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK, mb: 0.5 } }, "Quantity Traced Over Time"), /* @__PURE__ */ React2.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, "Stacked bars show each ", viewMode === "seller" ? "seller account" : "user", "'s completed quantity contribution by day.")), /* @__PURE__ */ React2.createElement(Box, { sx: { height: 400 } }, /* @__PURE__ */ React2.createElement(ResponsiveContainer, { width: "100%", height: "100%" }, /* @__PURE__ */ React2.createElement(BarChart, { data: chartSeries, margin: { top: 12, right: 18, left: 0, bottom: 0 } }, /* @__PURE__ */ React2.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: alpha4(BRAND_DARK, 0.12), vertical: false }), /* @__PURE__ */ React2.createElement(XAxis, { dataKey: "date", tick: { fill: alpha4(BRAND_DARK, 0.68), fontSize: 12 }, axisLine: false, tickLine: false }), /* @__PURE__ */ React2.createElement(YAxis, { tick: { fill: alpha4(BRAND_DARK, 0.68), fontSize: 12 }, axisLine: false, tickLine: false }), /* @__PURE__ */ React2.createElement(
    Tooltip,
    {
      contentStyle: { borderRadius: 16, border: `1px solid ${alpha4(BRAND_DARK, 0.08)}`, boxShadow: "0 18px 34px rgba(15, 23, 42, 0.14)" },
      cursor: { fill: alpha4("#2563eb", 0.06) }
    }
  ), /* @__PURE__ */ React2.createElement(Legend, null), chartKeys.map((seriesKey, index) => /* @__PURE__ */ React2.createElement(
    Bar,
    {
      key: seriesKey,
      dataKey: seriesKey,
      stackId: "a",
      fill: chartColors[index % chartColors.length],
      radius: index === chartKeys.length - 1 ? [6, 6, 0, 0] : 0
    }
  )))))) : null, /* @__PURE__ */ React2.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 } } }, /* @__PURE__ */ React2.createElement(Box, { sx: { mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha4(BRAND_DARK, 0.08)}`, background: "linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(37,99,235,0.04) 100%)" } }, /* @__PURE__ */ React2.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK, mb: 0.5 } }, "Performance Records"), /* @__PURE__ */ React2.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, "Review daily targets, completed quantities, sellers, and remarks for each ", viewMode === "seller" ? "seller-account entry" : "user summary", ".")), /* @__PURE__ */ React2.createElement(TableContainer, { sx: tableContainerSx }, /* @__PURE__ */ React2.createElement(Table, null, /* @__PURE__ */ React2.createElement(TableHead, null, /* @__PURE__ */ React2.createElement(TableRow, null, /* @__PURE__ */ React2.createElement(TableCell, { sx: tableHeaderCellSx }, "Date"), /* @__PURE__ */ React2.createElement(TableCell, { sx: tableHeaderCellSx }, "User"), /* @__PURE__ */ React2.createElement(TableCell, { sx: tableHeaderCellSx }, "Seller"), /* @__PURE__ */ React2.createElement(TableCell, { align: "center", sx: tableHeaderCellSx }, "Target Quantity"), /* @__PURE__ */ React2.createElement(TableCell, { align: "center", sx: tableHeaderCellSx }, "Completed Quantity"), /* @__PURE__ */ React2.createElement(TableCell, { sx: tableHeaderCellSx }, "Remarks"))), /* @__PURE__ */ React2.createElement(TableBody, null, displayRows.length === 0 ? /* @__PURE__ */ React2.createElement(TableRow, { sx: tableBodyRowSx }, /* @__PURE__ */ React2.createElement(TableCell, { colSpan: 6, align: "center", sx: { ...tableBodyCellSx, py: 3 } }, records.length === 0 ? "No performance records found" : "No records in the selected date filter \u2014 widen the date range or switch date mode")) : displayRows.map((r) => /* @__PURE__ */ React2.createElement(TableRow, { key: r._id, sx: tableBodyRowSx }, /* @__PURE__ */ React2.createElement(TableCell, { sx: tableBodyCellSx }, r.dateString), /* @__PURE__ */ React2.createElement(TableCell, { sx: tableBodyCellSx }, r.user?.username), /* @__PURE__ */ React2.createElement(TableCell, { sx: tableBodyCellSx }, viewMode === "seller" ? r.seller?.user?.username || r.seller?.storeName || r.seller?._id : r.sellerDisplay || "Multiple"), /* @__PURE__ */ React2.createElement(TableCell, { align: "center", sx: tableBodyCellSx }, r.targetQuantity || 0), /* @__PURE__ */ React2.createElement(TableCell, { align: "center", sx: tableBodyCellSx }, r.quantity), /* @__PURE__ */ React2.createElement(TableCell, { sx: tableBodyCellSx }, canManageRemarks && viewMode === "seller" ? /* @__PURE__ */ React2.createElement(
    Select,
    {
      size: "small",
      value: r.remarks || "",
      onChange: (e) => handleRemarkChange(r._id, e.target.value),
      displayEmpty: true,
      sx: {
        minWidth: 170,
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: alpha4(BRAND_DARK, 0.14)
        },
        "& .MuiOutlinedInput-root": {
          backgroundColor: "#fff"
        }
      }
    },
    remarkOptions.map((option) => /* @__PURE__ */ React2.createElement(MenuItem, { key: option || "none", value: option }, option || "None"))
  ) : /* @__PURE__ */ React2.createElement(Chip, { label: r.remarks || "None", size: "small", sx: getRemarkChipSx(r.remarks) })))))))));
};
var UserPerformancePage_default = UserPerformancePage;
export {
  UserPerformancePage_default as default
};
