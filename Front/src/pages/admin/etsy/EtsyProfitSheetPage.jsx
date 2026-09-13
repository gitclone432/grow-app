import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import EtsyOrderFulfilmentPage from './EtsyOrderFulfilmentPage.jsx';
import EtsyMonthlyProfitSheet from './EtsyMonthlyProfitSheet.jsx';

const PROFIT_SHEET_HIDDEN_COLUMNS = [
  'etsyOrdersReceivedTime',
  'shipBy',
  'estimateEtsyDelivery',
  'sku',
  'address',
  'zipCode',
  'region',
  'note',
  'messageUpdate',
  'trackingId',
  'trackingIdUploaded',
  'amazonOrderNumber',
  'issuesIfAny',
  'remark',
  'orderStatus',
  'refund',
];

const PROFIT_SHEET_COLUMN_LABELS = {
  dateSold: 'Order Date',
  productName: 'Name',
  soldFor: 'Sold For',
  tax: 'Sales Tax',
  total: 'Total',
  etsyFee: 'Etsy fee',
  processingFee: 'Processing Fee',
  regulatoryOperatingFee: 'Regulatory Operating fee',
  tds: 'TDS',
  tcs: 'TCS',
  offsiteAds: 'Offsite ADS',
  coupons: 'Coupons',
  relistFee: 'Relist Fee',
  tId: 'T.Id',
  additionalFees: 'Additional Fees',
  net: 'Net',
  estimateAmazonDelivery: 'P. Date',
  itemCost: 'Item Cost',
  shipCost: 'Ship Cost',
  amazonTax: 'Tax',
  totalInUsd: 'Total',
  totalInRs: 'in (Rs)',
  markUpFee: 'MarkUp Fee',
  igst: 'IGST',
  amazonTotal: 'Total',
  exRate: 'Ex. Rate',
  inHand: 'In Hand',
  customerName: 'Customers Name',
  amazonAccount: 'Amazon A/C',
  cardNo: 'Credit Card',
};

export default function EtsyProfitSheetPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('view') === 'monthly' ? 'monthly' : 'sheet';

  const tabBar = useMemo(() => (
    <Tabs
      value={tab}
      onChange={(_event, next) => {
        setSearchParams(next === 'monthly' ? { view: 'monthly' } : {}, { replace: true });
      }}
      sx={{
        minHeight: 42,
        px: { xs: 0.5, sm: 1 },
        borderBottom: 1,
        borderColor: 'divider',
        '& .MuiTab-root': { minHeight: 42, textTransform: 'none', fontWeight: 600 },
      }}
    >
      <Tab value="sheet" label="Profit Sheet" />
      <Tab value="monthly" label="Monthly Profit Sheet" />
    </Tabs>
  ), [tab, setSearchParams]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'calc(100dvh - 56px)', sm: 'calc(100dvh - 64px)', md: 'calc(100vh - 100px)' },
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {tabBar}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'monthly' ? (
          <EtsyMonthlyProfitSheet />
        ) : (
          <EtsyOrderFulfilmentPage
            title="Profit Sheet"
            columnSelectorPage="etsy-profit-sheet"
            columnStorageKey="etsyProfitSheet.visibleColumns"
            hiddenColumnKeys={PROFIT_SHEET_HIDDEN_COLUMNS}
            columnLabelOverrides={PROFIT_SHEET_COLUMN_LABELS}
            apiBasePath="/etsy/profit-sheet"
            embedded
          />
        )}
      </Box>
    </Box>
  );
}
