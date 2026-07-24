// src/pages/admin/ListingManagementPage.jsx
import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Paper as Paper2,
  Checkbox,
  Typography,
  Alert,
  Divider,
  Grid,
  CircularProgress,
  useMediaQuery,
  useTheme as useTheme2,
  Chip
} from "@mui/material";
import { alpha as alpha4 } from "@mui/material/styles";
import AssignmentIcon from "@mui/icons-material/Assignment";
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

// src/pages/admin/ListingManagementPage.jsx
var inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#fff"
  }
};
var dialogPaperSx = {
  borderRadius: 4,
  border: `1px solid ${alpha4(BRAND_DARK, 0.08)}`,
  boxShadow: "0 24px 48px rgba(15, 23, 42, 0.16)",
  overflow: "hidden"
};
var compactChipSx = {
  fontWeight: 600,
  border: `1px solid ${alpha4(BRAND_DARK, 0.08)}`,
  backgroundColor: alpha4(BRAND_DARK, 0.04)
};
function ListingManagementPage() {
  const theme = useTheme2();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState({});
  const [listers, setListers] = useState([]);
  const [listingPlatforms, setListingPlatforms] = useState([]);
  const [stores, setStores] = useState([]);
  const [assignForm, setAssignForm] = useState({
    listerId: "",
    quantity: "",
    // Used for Single only
    listingPlatformId: "",
    storeId: "",
    // Used for Single only, or as a "helper" for Bulk
    notes: "",
    scheduledDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  });
  const load = async () => {
    try {
      setLoading(true);
      const [{ data: tasks }, { data: l }, { data: lp }] = await Promise.all([
        api.get("/tasks"),
        api.get("/users/listers"),
        api.get("/platforms", { params: { type: "listing" } })
      ]);
      setRows(tasks.tasks ?? tasks);
      setListers(l);
      setListingPlatforms(lp);
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (assignForm.listingPlatformId) {
      api.get("/stores", { params: { platformId: assignForm.listingPlatformId } }).then(({ data }) => setStores(data));
    } else {
      setStores([]);
    }
  }, [assignForm.listingPlatformId]);
  const openAssign = (row) => {
    setAssigning(row);
    setAssignForm({
      listerId: "",
      quantity: row.quantity || "",
      listingPlatformId: "",
      storeId: "",
      notes: "",
      scheduledDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    });
    setAssignOpen(true);
  };
  const handleAssign = async () => {
    const { listerId, quantity, listingPlatformId, storeId, notes, scheduledDate } = assignForm;
    if (!listerId || !quantity || !listingPlatformId || !storeId) {
      alert("All fields are required");
      return;
    }
    try {
      await api.post("/assignments", {
        taskId: assigning._id,
        listerId,
        quantity: Number(quantity),
        listingPlatformId,
        storeId,
        notes,
        scheduledDate
      });
      setAssignOpen(false);
      setAssigning(null);
      alert("Task scheduled successfully!");
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.message || "Failed to assign task");
    }
  };
  const handleSelectAllClick = (event) => {
    if (event.target.checked) {
      const newSelected = rows.map((n) => n._id);
      setSelectedTaskIds(newSelected);
      return;
    }
    setSelectedTaskIds([]);
  };
  const handleClick = (event, id) => {
    const selectedIndex = selectedTaskIds.indexOf(id);
    let newSelected = [];
    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedTaskIds, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedTaskIds.slice(1));
    } else if (selectedIndex === selectedTaskIds.length - 1) {
      newSelected = newSelected.concat(selectedTaskIds.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedTaskIds.slice(0, selectedIndex),
        selectedTaskIds.slice(selectedIndex + 1)
      );
    }
    setSelectedTaskIds(newSelected);
  };
  const openBulkAssign = () => {
    if (selectedTaskIds.length === 0) return;
    const initialItems = {};
    selectedTaskIds.forEach((id) => {
      const task = rows.find((r) => r._id === id);
      initialItems[id] = {
        quantity: task?.quantity || "",
        storeId: ""
        // Start empty, user selects store
      };
    });
    setBulkItems(initialItems);
    setAssignForm({
      listerId: "",
      quantity: "",
      listingPlatformId: "",
      storeId: "",
      // Acts as "Set All Stores" helper
      notes: "",
      scheduledDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    });
    setBulkAssignOpen(true);
  };
  const handleBulkItemChange = (taskId, field, val) => {
    setBulkItems((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [field]: val
      }
    }));
  };
  const applyToAll = (field, val) => {
    setBulkItems((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        next[key] = { ...next[key], [field]: val };
      });
      return next;
    });
    if (field === "storeId") {
      setAssignForm((prev) => ({ ...prev, storeId: val }));
    }
  };
  const handleBulkAssignSubmit = async () => {
    const { listerId, listingPlatformId, notes, scheduledDate } = assignForm;
    if (!listerId || !listingPlatformId) {
      alert("Please select a Lister and Listing Platform.");
      return;
    }
    const assignmentsPayload = [];
    for (const id of selectedTaskIds) {
      const item = bulkItems[id];
      if (!item.quantity || Number(item.quantity) <= 0) {
        alert("Please ensure all tasks have a valid quantity greater than 0.");
        return;
      }
      if (!item.storeId) {
        alert("Please ensure all tasks have a Store assigned.");
        return;
      }
      assignmentsPayload.push({
        taskId: id,
        quantity: Number(item.quantity),
        storeId: item.storeId
      });
    }
    try {
      const res = await api.post("/assignments/bulk", {
        listerId,
        listingPlatformId,
        notes,
        scheduledDate,
        assignments: assignmentsPayload
      });
      if (res.data.success) {
        alert(`Successfully assigned ${res.data.count} tasks!`);
        if (res.data.errors) {
          alert("Some tasks failed: \n" + res.data.errors.join("\n"));
        }
        setBulkAssignOpen(false);
        setSelectedTaskIds([]);
        load();
      }
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.message || "Failed to process bulk assignments");
    }
  };
  const isSelected = (id) => selectedTaskIds.indexOf(id) !== -1;
  const formatMarketplace = (m) => m ? m.replace("EBAY_", "eBay ").replace("_", " ") : "-";
  if (loading) {
    return /* @__PURE__ */ React.createElement(Box, { display: "flex", justifyContent: "center", p: 6 }, /* @__PURE__ */ React.createElement(CircularProgress, { sx: { color: BRAND_YELLOW_DARK } }));
  }
  return /* @__PURE__ */ React.createElement(Box, { sx: { maxWidth: 1600, mx: "auto" } }, /* @__PURE__ */ React.createElement(
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
    /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", top: -96, right: -68, width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle, ${alpha4(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` } }), /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", bottom: -88, left: "24%", width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, transparent 70%)" } })),
    /* @__PURE__ */ React.createElement(
      Stack,
      {
        direction: { xs: "column", md: "row" },
        spacing: 3,
        justifyContent: "space-between",
        sx: { position: "relative", p: { xs: 3, md: 4 } }
      },
      /* @__PURE__ */ React.createElement(Box, { sx: { maxWidth: 840 } }, /* @__PURE__ */ React.createElement(
        Chip,
        {
          label: "Task Assignment",
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
      ), /* @__PURE__ */ React.createElement(Typography, { variant: "h4", sx: { fontWeight: 900, lineHeight: 1.1, mb: 1 } }, "Listing Management"), /* @__PURE__ */ React.createElement(Typography, { sx: { color: "rgba(255, 253, 240, 0.76)", maxWidth: 700 } }, "Review pending listing tasks, assign them individually or in bulk, and keep platform and store routing consistent inside the refreshed admin dashboard layout.")),
      /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "row", md: "column" }, spacing: 1.25, flexWrap: "wrap", useFlexGap: true }, /* @__PURE__ */ React.createElement(Chip, { label: `${rows.length} Tasks`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React.createElement(Chip, { label: `${selectedTaskIds.length} Selected`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React.createElement(Chip, { label: `${listingPlatforms.length} Listing Platforms`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }))
    )
  ), /* @__PURE__ */ React.createElement(SectionCard, { sx: { p: { xs: 2, md: 2.5 }, mb: 3 } }, /* @__PURE__ */ React.createElement(
    Stack,
    {
      direction: { xs: "column", lg: "row" },
      justifyContent: "space-between",
      alignItems: { xs: "stretch", lg: "center" },
      spacing: 1.5
    },
    /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK, mb: 0.5 } }, "Assignment Queue"), /* @__PURE__ */ React.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, "Select one or more tasks to share with listers and assign the correct listing store.")),
    selectedTaskIds.length > 0 && /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "contained",
        startIcon: /* @__PURE__ */ React.createElement(AssignmentIcon, null),
        onClick: openBulkAssign,
        fullWidth: isMobile,
        sx: yellowFilledButtonSx
      },
      "Assign ",
      selectedTaskIds.length,
      " Selected Tasks"
    )
  )), /* @__PURE__ */ React.createElement(Box, { sx: { display: { xs: "block", md: "none" } } }, /* @__PURE__ */ React.createElement(Stack, { spacing: 1.5 }, rows.map((r, idx) => {
    const checked = isSelected(r._id);
    return /* @__PURE__ */ React.createElement(
      SectionCard,
      {
        key: r._id,
        sx: {
          p: 2,
          borderColor: checked ? alpha4(BRAND_YELLOW_DARK, 0.3) : alpha4(BRAND_DARK, 0.08),
          boxShadow: checked ? "0 18px 32px rgba(245, 200, 66, 0.14)" : void 0
        }
      },
      /* @__PURE__ */ React.createElement(Stack, { spacing: 1 }, /* @__PURE__ */ React.createElement(Stack, { direction: "row", justifyContent: "space-between", alignItems: "flex-start", spacing: 1 }, /* @__PURE__ */ React.createElement(Stack, { direction: "row", spacing: 1, alignItems: "flex-start", sx: { minWidth: 0 } }, /* @__PURE__ */ React.createElement(
        Checkbox,
        {
          color: "primary",
          checked,
          onChange: (event) => handleClick(event, r._id),
          sx: { p: 0, mt: 0.25 }
        }
      ), /* @__PURE__ */ React.createElement(Box, { sx: { minWidth: 0 } }, /* @__PURE__ */ React.createElement(Typography, { variant: "caption", color: "text.secondary" }, "#", idx + 1, " \u2022 ", r.date ? new Date(r.date).toLocaleDateString() : "-"), /* @__PURE__ */ React.createElement(Typography, { variant: "subtitle2", sx: { fontWeight: 700, wordBreak: "break-word" } }, r.productTitle || "-"), r.supplierLink ? /* @__PURE__ */ React.createElement(
        Button,
        {
          size: "small",
          variant: "outlined",
          component: "a",
          href: r.supplierLink,
          target: "_blank",
          rel: "noreferrer",
          sx: { mt: 1, ...yellowOutlinedButtonSx }
        },
        "Supplier Link"
      ) : null)), /* @__PURE__ */ React.createElement(Button, { size: "small", variant: "outlined", onClick: () => openAssign(r), sx: { flexShrink: 0, ...yellowOutlinedButtonSx } }, "Share")), /* @__PURE__ */ React.createElement(Stack, { direction: "row", spacing: 1, flexWrap: "wrap", useFlexGap: true }, /* @__PURE__ */ React.createElement(Chip, { size: "small", label: `Source: ${r.sourcePlatform?.name || "-"}`, sx: compactChipSx }), /* @__PURE__ */ React.createElement(Chip, { size: "small", label: `Marketplace: ${formatMarketplace(r.marketplace)}`, sx: compactChipSx }), /* @__PURE__ */ React.createElement(
        Chip,
        {
          size: "small",
          label: `Category: ${r.category?.name || "-"}${r.subcategory ? ` / ${r.subcategory.name}` : ""}`,
          sx: compactChipSx
        }
      ), /* @__PURE__ */ React.createElement(Chip, { size: "small", label: `Created: ${r.createdBy?.username || "-"}`, sx: compactChipSx })))
    );
  }))), /* @__PURE__ */ React.createElement(SectionCard, { sx: { p: { xs: 2, md: 2.5 }, display: { xs: "none", md: "block" } } }, /* @__PURE__ */ React.createElement(Box, { sx: { mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3, border: `1px solid ${alpha4(BRAND_DARK, 0.08)}`, background: "linear-gradient(135deg, rgba(15,23,42,0.04) 0%, rgba(37,99,235,0.04) 100%)" } }, /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", lg: "row" }, spacing: 1.5, justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK } }, "Pending Tasks"), /* @__PURE__ */ React.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, "Review task details, supplier links, and listing metadata before sharing to a lister.")), /* @__PURE__ */ React.createElement(Chip, { label: `${rows.length} visible`, sx: { alignSelf: { xs: "flex-start", lg: "center" }, bgcolor: alpha4(BRAND_DARK, 0.06), color: BRAND_DARK, fontWeight: 700, border: `1px solid ${alpha4(BRAND_DARK, 0.1)}` } }))), /* @__PURE__ */ React.createElement(TableContainer, { sx: { ...tableContainerSx, overflowX: "auto" } }, /* @__PURE__ */ React.createElement(Table, { size: "small" }, /* @__PURE__ */ React.createElement(TableHead, null, /* @__PURE__ */ React.createElement(TableRow, null, /* @__PURE__ */ React.createElement(TableCell, { padding: "checkbox", sx: tableHeaderCellSx }, /* @__PURE__ */ React.createElement(
    Checkbox,
    {
      color: "default",
      indeterminate: selectedTaskIds.length > 0 && selectedTaskIds.length < rows.length,
      checked: rows.length > 0 && selectedTaskIds.length === rows.length,
      onChange: handleSelectAllClick,
      sx: { color: "rgba(255,255,255,0.78)", "&.Mui-checked": { color: "#fff" }, "&.MuiCheckbox-indeterminate": { color: "#fff" } }
    }
  )), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "SL No"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Date"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Product"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Source Platform"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Marketplace"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Category"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Created By"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Actions"))), /* @__PURE__ */ React.createElement(TableBody, null, rows.map((r, idx) => {
    const isItemSelected = isSelected(r._id);
    return /* @__PURE__ */ React.createElement(
      TableRow,
      {
        key: r._id,
        hover: true,
        role: "checkbox",
        "aria-checked": isItemSelected,
        selected: isItemSelected,
        sx: tableBodyRowSx
      },
      /* @__PURE__ */ React.createElement(TableCell, { padding: "checkbox", sx: tableBodyCellSx }, /* @__PURE__ */ React.createElement(
        Checkbox,
        {
          color: "primary",
          checked: isItemSelected,
          onChange: (event) => handleClick(event, r._id)
        }
      )),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, idx + 1),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, r.date ? new Date(r.date).toLocaleDateString() : "-"),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, /* @__PURE__ */ React.createElement(Typography, { sx: { fontWeight: 600, color: BRAND_DARK, mb: 0.5 } }, r.productTitle || "-"), r.supplierLink ? /* @__PURE__ */ React.createElement(
        Typography,
        {
          variant: "caption",
          component: "a",
          href: r.supplierLink,
          target: "_blank",
          rel: "noreferrer",
          sx: { color: "#2563eb", textDecoration: "none", "&:hover": { textDecoration: "underline" } }
        },
        "Supplier Link"
      ) : "-"),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, r.sourcePlatform?.name || "-"),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, formatMarketplace(r.marketplace)),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, r.category?.name || "-", r.subcategory ? ` / ${r.subcategory.name}` : ""),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, r.createdBy?.username || "-"),
      /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, /* @__PURE__ */ React.createElement(Button, { size: "small", variant: "outlined", onClick: () => openAssign(r), sx: yellowOutlinedButtonSx }, "Share"))
    );
  }))))), /* @__PURE__ */ React.createElement(Dialog, { open: assignOpen, onClose: () => setAssignOpen(false), maxWidth: "sm", fullWidth: true, fullScreen: isMobile, PaperProps: { sx: dialogPaperSx } }, /* @__PURE__ */ React.createElement(DialogTitle, { sx: { background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 100%)`, color: "#fffdf0", fontWeight: 800 } }, "Share Task"), /* @__PURE__ */ React.createElement(DialogContent, null, /* @__PURE__ */ React.createElement(Stack, { spacing: 2, sx: { mt: 1 } }, assigning && /* @__PURE__ */ React.createElement(Alert, { severity: "info", sx: { borderRadius: 2 } }, "Assigning: ", /* @__PURE__ */ React.createElement("strong", null, assigning.productTitle)), /* @__PURE__ */ React.createElement(FormControl, { fullWidth: true, size: "small" }, /* @__PURE__ */ React.createElement(InputLabel, null, "Lister"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Lister",
      value: assignForm.listerId,
      onChange: (e) => setAssignForm({ ...assignForm, listerId: e.target.value })
    },
    listers.map((l) => /* @__PURE__ */ React.createElement(MenuItem, { key: l._id, value: l._id }, l.username))
  )), /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: "Quantity",
      type: "number",
      size: "small",
      value: assignForm.quantity,
      onChange: (e) => setAssignForm({ ...assignForm, quantity: Number(e.target.value) }),
      sx: inputSx
    }
  ), /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: "Scheduled Date",
      type: "date",
      size: "small",
      value: assignForm.scheduledDate,
      onChange: (e) => setAssignForm({ ...assignForm, scheduledDate: e.target.value }),
      InputLabelProps: { shrink: true },
      sx: inputSx
    }
  ), /* @__PURE__ */ React.createElement(FormControl, { fullWidth: true, size: "small" }, /* @__PURE__ */ React.createElement(InputLabel, null, "Listing Platform"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Listing Platform",
      value: assignForm.listingPlatformId,
      onChange: (e) => setAssignForm({ ...assignForm, listingPlatformId: e.target.value })
    },
    listingPlatforms.map((p) => /* @__PURE__ */ React.createElement(MenuItem, { key: p._id, value: p._id }, p.name))
  )), /* @__PURE__ */ React.createElement(FormControl, { fullWidth: true, size: "small", disabled: !assignForm.listingPlatformId }, /* @__PURE__ */ React.createElement(InputLabel, null, "Store"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Store",
      value: assignForm.storeId,
      onChange: (e) => setAssignForm({ ...assignForm, storeId: e.target.value })
    },
    stores.map((s) => /* @__PURE__ */ React.createElement(MenuItem, { key: s._id, value: s._id }, s.name))
  )), /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: "Notes (optional)",
      multiline: true,
      rows: 2,
      size: "small",
      value: assignForm.notes,
      onChange: (e) => setAssignForm({ ...assignForm, notes: e.target.value }),
      sx: inputSx
    }
  ))), /* @__PURE__ */ React.createElement(DialogActions, { sx: { px: 3, pb: 2.5 } }, /* @__PURE__ */ React.createElement(Button, { onClick: () => setAssignOpen(false), sx: yellowOutlinedButtonSx }, "Cancel"), /* @__PURE__ */ React.createElement(Button, { variant: "contained", onClick: handleAssign, sx: yellowFilledButtonSx }, "Share"))), /* @__PURE__ */ React.createElement(Dialog, { open: bulkAssignOpen, onClose: () => setBulkAssignOpen(false), maxWidth: "md", fullWidth: true, fullScreen: isMobile, PaperProps: { sx: dialogPaperSx } }, /* @__PURE__ */ React.createElement(DialogTitle, { sx: { background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 100%)`, color: "#fffdf0", fontWeight: 800 } }, "Bulk Assign Tasks"), /* @__PURE__ */ React.createElement(DialogContent, null, /* @__PURE__ */ React.createElement(Stack, { spacing: 2, sx: { mt: 1 } }, /* @__PURE__ */ React.createElement(Alert, { severity: "info", sx: { borderRadius: 2 } }, "You are assigning ", /* @__PURE__ */ React.createElement("strong", null, selectedTaskIds.length), " tasks. Set common details below, then specify quantities and stores for each task."), /* @__PURE__ */ React.createElement(Grid, { container: true, spacing: 2 }, /* @__PURE__ */ React.createElement(Grid, { item: true, xs: 12, md: 6 }, /* @__PURE__ */ React.createElement(FormControl, { fullWidth: true, size: "small" }, /* @__PURE__ */ React.createElement(InputLabel, null, "Lister"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Lister",
      value: assignForm.listerId,
      onChange: (e) => setAssignForm({ ...assignForm, listerId: e.target.value })
    },
    listers.map((l) => /* @__PURE__ */ React.createElement(MenuItem, { key: l._id, value: l._id }, l.username))
  ))), /* @__PURE__ */ React.createElement(Grid, { item: true, xs: 12, md: 6 }, /* @__PURE__ */ React.createElement(
    TextField,
    {
      fullWidth: true,
      label: "Scheduled Date",
      type: "date",
      size: "small",
      value: assignForm.scheduledDate,
      onChange: (e) => setAssignForm({ ...assignForm, scheduledDate: e.target.value }),
      InputLabelProps: { shrink: true },
      sx: inputSx
    }
  )), /* @__PURE__ */ React.createElement(Grid, { item: true, xs: 12, md: 6 }, /* @__PURE__ */ React.createElement(FormControl, { fullWidth: true, size: "small" }, /* @__PURE__ */ React.createElement(InputLabel, null, "Listing Platform"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Listing Platform",
      value: assignForm.listingPlatformId,
      onChange: (e) => setAssignForm({ ...assignForm, listingPlatformId: e.target.value })
    },
    listingPlatforms.map((p) => /* @__PURE__ */ React.createElement(MenuItem, { key: p._id, value: p._id }, p.name))
  ))), /* @__PURE__ */ React.createElement(Grid, { item: true, xs: 12, md: 6 }, /* @__PURE__ */ React.createElement(FormControl, { fullWidth: true, size: "small", disabled: !assignForm.listingPlatformId }, /* @__PURE__ */ React.createElement(InputLabel, null, "Set All Stores"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Set All Stores",
      value: assignForm.storeId,
      onChange: (e) => applyToAll("storeId", e.target.value)
    },
    stores.map((s) => /* @__PURE__ */ React.createElement(MenuItem, { key: s._id, value: s._id }, s.name))
  ))), /* @__PURE__ */ React.createElement(Grid, { item: true, xs: 12 }, /* @__PURE__ */ React.createElement(
    TextField,
    {
      fullWidth: true,
      label: "Notes (optional)",
      multiline: true,
      rows: 2,
      size: "small",
      value: assignForm.notes,
      onChange: (e) => setAssignForm({ ...assignForm, notes: e.target.value }),
      sx: inputSx
    }
  ))), /* @__PURE__ */ React.createElement(Divider, { sx: { color: alpha4(BRAND_DARK, 0.54), fontWeight: 700 } }, "TASK DETAILS"), /* @__PURE__ */ React.createElement(Box, { display: "flex", gap: 2, alignItems: "center", justifyContent: "flex-end" }, /* @__PURE__ */ React.createElement(Typography, { variant: "caption" }, "Set all quantities:"), /* @__PURE__ */ React.createElement(
    TextField,
    {
      size: "small",
      type: "number",
      sx: { width: 80 },
      onChange: (e) => applyToAll("quantity", e.target.value),
      placeholder: "0"
    }
  )), /* @__PURE__ */ React.createElement(TableContainer, { component: Paper2, variant: "outlined", sx: { ...tableContainerSx, maxHeight: 300, overflowX: "auto" } }, /* @__PURE__ */ React.createElement(Table, { size: "small", stickyHeader: true }, /* @__PURE__ */ React.createElement(TableHead, null, /* @__PURE__ */ React.createElement(TableRow, null, /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Product Title"), /* @__PURE__ */ React.createElement(TableCell, { width: 220, sx: tableHeaderCellSx }, "Store"), /* @__PURE__ */ React.createElement(TableCell, { width: 120, sx: tableHeaderCellSx }, "Quantity"))), /* @__PURE__ */ React.createElement(TableBody, null, selectedTaskIds.map((id) => {
    const task = rows.find((r) => r._id === id);
    const itemState = bulkItems[id] || {};
    if (!task) return null;
    return /* @__PURE__ */ React.createElement(TableRow, { key: id, sx: tableBodyRowSx }, /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, task.productTitle), /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, /* @__PURE__ */ React.createElement(FormControl, { fullWidth: true, size: "small" }, /* @__PURE__ */ React.createElement(
      Select,
      {
        value: itemState.storeId || "",
        onChange: (e) => handleBulkItemChange(id, "storeId", e.target.value),
        displayEmpty: true,
        disabled: !assignForm.listingPlatformId
      },
      /* @__PURE__ */ React.createElement(MenuItem, { value: "", disabled: true }, /* @__PURE__ */ React.createElement("em", null, "Select Store")),
      stores.map((s) => /* @__PURE__ */ React.createElement(MenuItem, { key: s._id, value: s._id }, s.name))
    ))), /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, /* @__PURE__ */ React.createElement(
      TextField,
      {
        size: "small",
        type: "number",
        value: itemState.quantity || "",
        onChange: (e) => handleBulkItemChange(id, "quantity", e.target.value),
        placeholder: "Qty",
        sx: inputSx
      }
    )));
  })))))), /* @__PURE__ */ React.createElement(DialogActions, { sx: { px: 3, pb: 2.5 } }, /* @__PURE__ */ React.createElement(Button, { onClick: () => setBulkAssignOpen(false), sx: yellowOutlinedButtonSx }, "Cancel"), /* @__PURE__ */ React.createElement(Button, { variant: "contained", onClick: handleBulkAssignSubmit, fullWidth: isSmallMobile, sx: yellowFilledButtonSx }, "Assign All"))));
}
export {
  ListingManagementPage as default
};
