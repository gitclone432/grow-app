import EtsyOrderFulfilmentPage from './EtsyOrderFulfilmentPage.jsx';

export default function EtsyReturnLabelsPage() {
  return (
    <EtsyOrderFulfilmentPage
      title="Return Labels"
      columnSelectorPage="etsy-return-labels"
      columnStorageKey="etsyReturnLabels.visibleColumns"
      apiBasePath="/etsy/return-labels"
      allowImport={false}
      allowCreate={false}
      emptyStoreDescription="Use the “return” action on an Order Fulfilment row to add it here."
    />
  );
}
