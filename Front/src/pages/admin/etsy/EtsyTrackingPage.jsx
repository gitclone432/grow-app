import { useEffect, useState } from 'react';
import EtsyOrderFulfilmentPage from './EtsyOrderFulfilmentPage.jsx';

const TRACKING_VISIBLE_COLUMNS = [
  'dateSold',
  'etsyOrdersReceivedTime',
  'shipBy',
  'sku',
  'address',
  'zipCode',
  'messageUpdate',
  'trackingId',
  'remark',
  'trackingIdUploaded',
  'amazonOrderNumber',
];

const TRACKING_COLUMN_LABELS = {
  etsyOrdersReceivedTime: 'Etsy Order Received',
  trackingIdUploaded: 'Tracking Uploaded',
};

function getTodayIstYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getMillisecondsUntilNextIstMidnight() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour || 0);
  const minute = Number(values.minute || 0);
  const second = Number(values.second || 0);
  const elapsedTodayMs = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  const fullDayMs = 24 * 60 * 60 * 1000;

  return Math.max(1000, fullDayMs - elapsedTodayMs + 250);
}

export default function EtsyTrackingPage() {
  const [todayIst, setTodayIst] = useState(() => getTodayIstYmd());

  useEffect(() => {
    let timeoutId;

    const scheduleNextSync = () => {
      timeoutId = window.setTimeout(() => {
        setTodayIst(getTodayIstYmd());
        scheduleNextSync();
      }, getMillisecondsUntilNextIstMidnight());
    };

    scheduleNextSync();

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        setTodayIst(getTodayIstYmd());
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, []);

  return (
    <EtsyOrderFulfilmentPage
      title="Tracking"
      columnSelectorPage="etsy-tracking"
      columnStorageKey="etsyTracking.visibleColumns"
      columnLabelOverrides={TRACKING_COLUMN_LABELS}
      apiBasePath="/etsy/tracking"
      fixedVisibleColumns={TRACKING_VISIBLE_COLUMNS}
      allowColumnSelection={false}
      allowImport={false}
      allowCreate={false}
      allowDelete={false}
      showRegionFilter={false}
      dateFilterField="shipBy"
      dateFilterMode="single"
      singleDateLabel="Ship By"
      initialSingleDate={todayIst}
      noFilteredResultsMessage="No orders match the selected ship-by date."
    />
  );
}