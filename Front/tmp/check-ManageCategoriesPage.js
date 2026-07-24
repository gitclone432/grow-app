// src/pages/admin/ManageCategoriesPage.jsx
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
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SegmentRoundedIcon from "@mui/icons-material/SegmentRounded";
import ViewAgendaRoundedIcon from "@mui/icons-material/ViewAgendaRounded";
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

// src/pages/admin/ManageCategoriesPage.jsx
var sectionConfigs = {
  categories: {
    title: "Categories",
    subtitle: "Core catalog groups used across subcategories and ranges.",
    accent: "#2563eb",
    icon: CategoryOutlinedIcon,
    createLabel: "Category Name",
    searchLabel: "Search Category",
    buttonLabel: "Add Category",
    emptyMessage: "No categories match the current search."
  },
  subcategories: {
    title: "Subcategories",
    subtitle: "Organize products inside each category with faster lookup.",
    accent: "#10b981",
    icon: SegmentRoundedIcon,
    createLabel: "Subcategory Name",
    searchLabel: "Search Subcategory",
    buttonLabel: "Add Subcategory",
    emptyMessage: "Choose a category or adjust the search to see subcategories."
  },
  ranges: {
    title: "Ranges",
    subtitle: "Keep range options aligned with the active category structure.",
    accent: "#f59e0b",
    icon: ViewAgendaRoundedIcon,
    createLabel: "Range Name",
    searchLabel: "Search Range",
    buttonLabel: "Add Range",
    emptyMessage: "Choose a category or adjust the search to see ranges."
  }
};
var inputSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#fff"
  }
};
function buildSectionHeaderSx(accent) {
  return {
    mb: 2.5,
    p: { xs: 2, md: 2.5 },
    borderRadius: 3,
    border: `1px solid ${alpha4(accent, 0.18)}`,
    background: `linear-gradient(135deg, ${alpha4(accent, 0.12)} 0%, ${alpha4(accent, 0.04)} 100%)`
  };
}
function getHighlightRowSx(searchValue) {
  return searchValue ? {
    "& td": {
      backgroundColor: `${alpha4(BRAND_YELLOW, 0.16)} !important`
    }
  } : void 0;
}
function ManageCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [subcategories, setSubcategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [ranges, setRanges] = useState([]);
  const [selectedCategoryForRange, setSelectedCategoryForRange] = useState("");
  const [rangeName, setRangeName] = useState("");
  const [rangeSearch, setRangeSearch] = useState("");
  useEffect(() => {
    api.get("/categories").then(({ data }) => setCategories(data));
  }, []);
  useEffect(() => {
    if (selectedCategoryId) {
      api.get("/subcategories", { params: { categoryId: selectedCategoryId } }).then(({ data }) => setSubcategories(data));
    } else {
      setSubcategories([]);
    }
  }, [selectedCategoryId]);
  useEffect(() => {
    if (selectedCategoryForRange) {
      api.get("/ranges", { params: { categoryId: selectedCategoryForRange } }).then(({ data }) => setRanges(data));
    } else {
      setRanges([]);
    }
  }, [selectedCategoryForRange]);
  const addCategory = async (e) => {
    e.preventDefault();
    await api.post("/categories", { name: categoryName });
    setCategoryName("");
    const { data } = await api.get("/categories");
    setCategories(data);
  };
  const addSubcategory = async (e) => {
    e.preventDefault();
    if (!selectedCategoryId) return;
    await api.post("/subcategories", { name: subcategoryName, categoryId: selectedCategoryId });
    setSubcategoryName("");
    const { data } = await api.get("/subcategories", { params: { categoryId: selectedCategoryId } });
    setSubcategories(data);
  };
  const addRange = async (e) => {
    e.preventDefault();
    if (!selectedCategoryForRange) return;
    await api.post("/ranges", { name: rangeName, categoryId: selectedCategoryForRange });
    setRangeName("");
    const { data } = await api.get("/ranges", { params: { categoryId: selectedCategoryForRange } });
    setRanges(data);
  };
  const filteredCategories = categories.filter((category) => !categorySearch || category.name.toLowerCase().includes(categorySearch.toLowerCase()));
  const filteredSubcategories = subcategories.filter((subcategory) => !subcategorySearch || subcategory.name.toLowerCase().includes(subcategorySearch.toLowerCase()));
  const filteredRanges = ranges.filter((range) => !rangeSearch || range.name.toLowerCase().includes(rangeSearch.toLowerCase()));
  return /* @__PURE__ */ React.createElement(Box, { sx: { maxWidth: 1400, mx: "auto" } }, /* @__PURE__ */ React.createElement(
    SectionCard,
    {
      emphasized: true,
      sx: {
        mb: 3,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_ALT} 55%, #314b74 100%)`,
        border: `1px solid ${alpha4(BRAND_YELLOW, 0.18)}`,
        color: "#fffdf0",
        position: "relative"
      }
    },
    /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" } }, /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", top: -96, right: -72, width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle, ${alpha4(BRAND_YELLOW, 0.22)} 0%, transparent 70%)` } }), /* @__PURE__ */ React.createElement(Box, { sx: { position: "absolute", bottom: -88, left: "28%", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)" } })),
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
          label: "Catalog Controls",
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
      ), /* @__PURE__ */ React.createElement(Typography, { variant: "h4", sx: { fontWeight: 900, lineHeight: 1.1, mb: 1 } }, "Manage Categories, Subcategories & Ranges"), /* @__PURE__ */ React.createElement(Typography, { sx: { color: "rgba(255, 253, 240, 0.76)", maxWidth: 640 } }, "Maintain the full catalog hierarchy from one place with the updated admin dashboard styling and faster visual scanning.")),
      /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "row", sm: "row", md: "column" }, spacing: 1.25 }, /* @__PURE__ */ React.createElement(Chip, { label: `${categories.length} Categories`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React.createElement(Chip, { label: `${subcategories.length} Subcategories`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }), /* @__PURE__ */ React.createElement(Chip, { label: `${ranges.length} Ranges`, sx: { bgcolor: alpha4("#fff", 0.08), color: "#fffdf0", border: "1px solid rgba(255,255,255,0.1)", fontWeight: 700 } }))
    )
  ), /* @__PURE__ */ React.createElement(Stack, { spacing: 3 }, /* @__PURE__ */ React.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 } } }, /* @__PURE__ */ React.createElement(Box, { sx: buildSectionHeaderSx(sectionConfigs.categories.accent) }, /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", sm: "row" }, spacing: 1.5, justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Stack, { direction: "row", spacing: 1.5, alignItems: "center" }, /* @__PURE__ */ React.createElement(Box, { sx: { width: 44, height: 44, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${sectionConfigs.categories.accent} 0%, ${alpha4(sectionConfigs.categories.accent, 0.72)} 100%)`, color: "#fff" } }, /* @__PURE__ */ React.createElement(CategoryOutlinedIcon, null)), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK } }, sectionConfigs.categories.title), /* @__PURE__ */ React.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, sectionConfigs.categories.subtitle))), /* @__PURE__ */ React.createElement(Chip, { label: `${filteredCategories.length} visible`, sx: { alignSelf: { xs: "flex-start", sm: "center" }, bgcolor: alpha4(sectionConfigs.categories.accent, 0.1), color: sectionConfigs.categories.accent, fontWeight: 700, border: `1px solid ${alpha4(sectionConfigs.categories.accent, 0.18)}` } }))), /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", md: "row" }, spacing: 1.5, component: "form", onSubmit: addCategory, sx: { mb: 1.5 } }, /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: sectionConfigs.categories.createLabel,
      value: categoryName,
      onChange: (e) => setCategoryName(e.target.value),
      required: true,
      sx: { flex: 1, ...inputSx }
    }
  ), /* @__PURE__ */ React.createElement(Button, { type: "submit", variant: "contained", sx: yellowFilledButtonSx }, sectionConfigs.categories.buttonLabel)), /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", md: "row" }, spacing: 1.5, sx: { mb: 2.5 } }, /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: sectionConfigs.categories.searchLabel,
      value: categorySearch,
      onChange: (e) => setCategorySearch(e.target.value),
      sx: { flex: 1, ...inputSx }
    }
  ), /* @__PURE__ */ React.createElement(Button, { variant: "outlined", startIcon: /* @__PURE__ */ React.createElement(SearchRoundedIcon, null), sx: yellowOutlinedButtonSx }, "Search")), /* @__PURE__ */ React.createElement(TableContainer, { sx: tableContainerSx }, /* @__PURE__ */ React.createElement(Table, { size: "small" }, /* @__PURE__ */ React.createElement(TableHead, null, /* @__PURE__ */ React.createElement(TableRow, null, /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Category"))), /* @__PURE__ */ React.createElement(TableBody, null, filteredCategories.length > 0 ? filteredCategories.map((category) => /* @__PURE__ */ React.createElement(
    TableRow,
    {
      key: category._id,
      sx: {
        ...tableBodyRowSx,
        ...getHighlightRowSx(
          categorySearch && category.name.toLowerCase() === categorySearch.toLowerCase()
        )
      }
    },
    /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, category.name)
  )) : /* @__PURE__ */ React.createElement(TableRow, { sx: tableBodyRowSx }, /* @__PURE__ */ React.createElement(TableCell, { sx: { ...tableBodyCellSx, py: 3, color: alpha4(BRAND_DARK, 0.62) } }, sectionConfigs.categories.emptyMessage)))))), /* @__PURE__ */ React.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 } } }, /* @__PURE__ */ React.createElement(Box, { sx: buildSectionHeaderSx(sectionConfigs.subcategories.accent) }, /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", sm: "row" }, spacing: 1.5, justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Stack, { direction: "row", spacing: 1.5, alignItems: "center" }, /* @__PURE__ */ React.createElement(Box, { sx: { width: 44, height: 44, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${sectionConfigs.subcategories.accent} 0%, ${alpha4(sectionConfigs.subcategories.accent, 0.72)} 100%)`, color: "#fff" } }, /* @__PURE__ */ React.createElement(SegmentRoundedIcon, null)), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK } }, sectionConfigs.subcategories.title), /* @__PURE__ */ React.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, sectionConfigs.subcategories.subtitle))), /* @__PURE__ */ React.createElement(Chip, { label: `${filteredSubcategories.length} visible`, sx: { alignSelf: { xs: "flex-start", sm: "center" }, bgcolor: alpha4(sectionConfigs.subcategories.accent, 0.1), color: sectionConfigs.subcategories.accent, fontWeight: 700, border: `1px solid ${alpha4(sectionConfigs.subcategories.accent, 0.18)}` } }))), /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", lg: "row" }, spacing: 1.5, component: "form", onSubmit: addSubcategory, sx: { mb: 1.5 } }, /* @__PURE__ */ React.createElement(FormControl, { sx: { minWidth: 240, ...inputSx } }, /* @__PURE__ */ React.createElement(InputLabel, null, "Category"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Category",
      value: selectedCategoryId,
      onChange: (e) => setSelectedCategoryId(e.target.value),
      required: true
    },
    categories.map((category) => /* @__PURE__ */ React.createElement(MenuItem, { key: category._id, value: category._id }, category.name))
  )), /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: sectionConfigs.subcategories.createLabel,
      value: subcategoryName,
      onChange: (e) => setSubcategoryName(e.target.value),
      required: true,
      sx: { flex: 1, ...inputSx }
    }
  ), /* @__PURE__ */ React.createElement(Button, { type: "submit", variant: "contained", disabled: !selectedCategoryId, sx: yellowFilledButtonSx }, sectionConfigs.subcategories.buttonLabel)), /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", md: "row" }, spacing: 1.5, sx: { mb: 2.5 } }, /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: sectionConfigs.subcategories.searchLabel,
      value: subcategorySearch,
      onChange: (e) => setSubcategorySearch(e.target.value),
      sx: { flex: 1, ...inputSx }
    }
  ), /* @__PURE__ */ React.createElement(Button, { variant: "outlined", startIcon: /* @__PURE__ */ React.createElement(SearchRoundedIcon, null), sx: yellowOutlinedButtonSx }, "Search")), /* @__PURE__ */ React.createElement(TableContainer, { sx: tableContainerSx }, /* @__PURE__ */ React.createElement(Table, { size: "small" }, /* @__PURE__ */ React.createElement(TableHead, null, /* @__PURE__ */ React.createElement(TableRow, null, /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Subcategory"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Category"))), /* @__PURE__ */ React.createElement(TableBody, null, filteredSubcategories.length > 0 ? filteredSubcategories.map((subcategory) => /* @__PURE__ */ React.createElement(
    TableRow,
    {
      key: subcategory._id,
      sx: {
        ...tableBodyRowSx,
        ...getHighlightRowSx(
          subcategorySearch && subcategory.name.toLowerCase() === subcategorySearch.toLowerCase()
        )
      }
    },
    /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, subcategory.name),
    /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, subcategory.category?.name)
  )) : /* @__PURE__ */ React.createElement(TableRow, { sx: tableBodyRowSx }, /* @__PURE__ */ React.createElement(TableCell, { colSpan: 2, sx: { ...tableBodyCellSx, py: 3, color: alpha4(BRAND_DARK, 0.62) } }, sectionConfigs.subcategories.emptyMessage)))))), /* @__PURE__ */ React.createElement(SectionCard, { sx: { p: { xs: 2, md: 3 } } }, /* @__PURE__ */ React.createElement(Box, { sx: buildSectionHeaderSx(sectionConfigs.ranges.accent) }, /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", sm: "row" }, spacing: 1.5, justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Stack, { direction: "row", spacing: 1.5, alignItems: "center" }, /* @__PURE__ */ React.createElement(Box, { sx: { width: 44, height: 44, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${sectionConfigs.ranges.accent} 0%, ${alpha4(sectionConfigs.ranges.accent, 0.72)} 100%)`, color: "#fff" } }, /* @__PURE__ */ React.createElement(ViewAgendaRoundedIcon, null)), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Typography, { variant: "h6", sx: { fontWeight: 800, color: BRAND_DARK } }, sectionConfigs.ranges.title), /* @__PURE__ */ React.createElement(Typography, { variant: "body2", sx: { color: alpha4(BRAND_DARK, 0.64) } }, sectionConfigs.ranges.subtitle))), /* @__PURE__ */ React.createElement(Chip, { label: `${filteredRanges.length} visible`, sx: { alignSelf: { xs: "flex-start", sm: "center" }, bgcolor: alpha4(sectionConfigs.ranges.accent, 0.1), color: sectionConfigs.ranges.accent, fontWeight: 700, border: `1px solid ${alpha4(sectionConfigs.ranges.accent, 0.18)}` } }))), /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", lg: "row" }, spacing: 1.5, component: "form", onSubmit: addRange, sx: { mb: 1.5 } }, /* @__PURE__ */ React.createElement(FormControl, { sx: { minWidth: 240, ...inputSx } }, /* @__PURE__ */ React.createElement(InputLabel, null, "Category"), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: "Category",
      value: selectedCategoryForRange,
      onChange: (e) => setSelectedCategoryForRange(e.target.value),
      required: true
    },
    categories.map((category) => /* @__PURE__ */ React.createElement(MenuItem, { key: category._id, value: category._id }, category.name))
  )), /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: sectionConfigs.ranges.createLabel,
      value: rangeName,
      onChange: (e) => setRangeName(e.target.value),
      required: true,
      sx: { flex: 1, ...inputSx }
    }
  ), /* @__PURE__ */ React.createElement(Button, { type: "submit", variant: "contained", disabled: !selectedCategoryForRange, sx: yellowFilledButtonSx }, sectionConfigs.ranges.buttonLabel)), /* @__PURE__ */ React.createElement(Stack, { direction: { xs: "column", md: "row" }, spacing: 1.5, sx: { mb: 2.5 } }, /* @__PURE__ */ React.createElement(
    TextField,
    {
      label: sectionConfigs.ranges.searchLabel,
      value: rangeSearch,
      onChange: (e) => setRangeSearch(e.target.value),
      sx: { flex: 1, ...inputSx }
    }
  ), /* @__PURE__ */ React.createElement(Button, { variant: "outlined", startIcon: /* @__PURE__ */ React.createElement(SearchRoundedIcon, null), sx: yellowOutlinedButtonSx }, "Search")), /* @__PURE__ */ React.createElement(TableContainer, { sx: tableContainerSx }, /* @__PURE__ */ React.createElement(Table, { size: "small" }, /* @__PURE__ */ React.createElement(TableHead, null, /* @__PURE__ */ React.createElement(TableRow, null, /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Range"), /* @__PURE__ */ React.createElement(TableCell, { sx: tableHeaderCellSx }, "Category"))), /* @__PURE__ */ React.createElement(TableBody, null, filteredRanges.length > 0 ? filteredRanges.map((range) => /* @__PURE__ */ React.createElement(
    TableRow,
    {
      key: range._id,
      sx: {
        ...tableBodyRowSx,
        ...getHighlightRowSx(
          rangeSearch && range.name.toLowerCase() === rangeSearch.toLowerCase()
        )
      }
    },
    /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, range.name),
    /* @__PURE__ */ React.createElement(TableCell, { sx: tableBodyCellSx }, range.category?.name)
  )) : /* @__PURE__ */ React.createElement(TableRow, { sx: tableBodyRowSx }, /* @__PURE__ */ React.createElement(TableCell, { colSpan: 2, sx: { ...tableBodyCellSx, py: 3, color: alpha4(BRAND_DARK, 0.62) } }, sectionConfigs.ranges.emptyMessage))))))));
}
export {
  ManageCategoriesPage as default
};
