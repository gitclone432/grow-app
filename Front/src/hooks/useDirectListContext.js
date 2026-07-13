import { useEffect, useState } from 'react';
import api from '../lib/api.js';

/**
 * Loads store lister defaults, pricing config, and effective template in parallel
 * when seller and/or template selection changes.
 */
export function useDirectListContext(selectedSeller, selectedTemplate) {
  const [storeListerDefaults, setStoreListerDefaults] = useState(null);
  const [ebayMarketplace, setEbayMarketplace] = useState(null);
  const [pricingConfig, setPricingConfig] = useState(null);
  const [effectiveTemplate, setEffectiveTemplate] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedSeller) {
      setStoreListerDefaults(null);
      setEbayMarketplace(null);
      setPricingConfig(null);
      setEffectiveTemplate(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const requests = [
          api.get('/template-listings/direct-list/store-lister-defaults', {
            params: {
              sellerId: selectedSeller,
              ...(selectedTemplate ? { templateId: selectedTemplate } : {}),
            },
          }),
        ];

        if (selectedTemplate) {
          requests.push(
            api.get('/seller-pricing-config', {
              params: { sellerId: selectedSeller, templateId: selectedTemplate },
            }),
            api.get(`/template-overrides/${selectedTemplate}/effective`, {
              params: { sellerId: selectedSeller },
            })
          );
        }

        const responses = await Promise.all(requests);
        if (cancelled) return;

        const defaultsRes = responses[0];
        setStoreListerDefaults(defaultsRes.data.storeListerApplied || null);
        setEbayMarketplace(defaultsRes.data.ebayMarketplace || null);

        if (selectedTemplate) {
          setPricingConfig(responses[1]?.data?.pricingConfig || null);
          setEffectiveTemplate(responses[2]?.data || null);
        } else {
          setPricingConfig(null);
          setEffectiveTemplate(null);
        }
      } catch {
        if (!cancelled) {
          setStoreListerDefaults(null);
          setEbayMarketplace(null);
          setPricingConfig(null);
          setEffectiveTemplate(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSeller, selectedTemplate]);

  return {
    storeListerDefaults,
    ebayMarketplace,
    pricingConfig,
    effectiveTemplate,
    loading,
  };
}
