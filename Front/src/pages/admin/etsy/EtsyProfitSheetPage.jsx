import EtsyOrderFulfilmentPage from './EtsyOrderFulfilmentPage.jsx';

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
  return (
    <EtsyOrderFulfilmentPage
      title="Profit Sheet"
      columnSelectorPage="etsy-profit-sheet"
      columnStorageKey="etsyProfitSheet.visibleColumns"
      hiddenColumnKeys={PROFIT_SHEET_HIDDEN_COLUMNS}
      columnLabelOverrides={PROFIT_SHEET_COLUMN_LABELS}
      apiBasePath="/etsy/profit-sheet"
    />
  );
}
