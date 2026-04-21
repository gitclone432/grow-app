import {
  Stack, Typography, Divider, TextField, MenuItem, FormControlLabel, Checkbox, Box
} from '@mui/material';

export const CORE_FIELD_SECTIONS = [
  {
    title: 'Basic Information',
    fields: [
      { key: 'categoryId', label: 'Category ID', type: 'text', placeholder: 'e.g., 171485' },
      { key: 'categoryName', label: 'Category Name', type: 'text', placeholder: 'e.g., Cell Phone Accessories' },
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Product title (max 80 chars)' },
      { key: 'upc', label: 'UPC', type: 'text', placeholder: 'Universal Product Code' },
      { key: 'epid', label: 'EPID', type: 'text', placeholder: 'eBay Product ID' },
      { key: 'customLabel', label: 'Custom Label (SKU)', type: 'text', placeholder: 'Stock Keeping Unit' }
    ]
  },
  {
    title: 'Pricing & Quantity',
    fields: [
      { key: 'startPrice', label: 'Start Price', type: 'number', placeholder: 'e.g., 29.99' },
      { key: 'buyItNowPrice', label: 'Buy It Now Price', type: 'number', placeholder: 'e.g., 39.99' },
      { key: 'quantity', label: 'Quantity', type: 'number', placeholder: 'e.g., 10' },
      { key: 'bestOfferEnabled', label: 'Best Offer Enabled', type: 'checkbox' },
      { key: 'bestOfferAutoAcceptPrice', label: 'Best Offer Auto Accept Price', type: 'number', placeholder: 'e.g., 35.00' },
      { key: 'minimumBestOfferPrice', label: 'Minimum Best Offer Price', type: 'number', placeholder: 'e.g., 30.00' }
    ]
  },
  {
    title: 'Listing Settings',
    fields: [
      { 
        key: 'conditionId', 
        label: 'Condition ID', 
        type: 'text',
        placeholder: 'e.g., 1000 (New), 3000 (Used), 2000 (Refurbished)'
      },
      { 
        key: 'format', 
        label: 'Format', 
        type: 'select',
        options: [
          { value: 'FixedPrice', label: 'Fixed Price' },
          { value: 'Auction', label: 'Auction' }
        ]
      },
      { 
        key: 'duration', 
        label: 'Duration', 
        type: 'select',
        options: [
          { value: 'GTC', label: 'Good \'Til Cancelled' },
          { value: 'Days_3', label: '3 Days' },
          { value: 'Days_5', label: '5 Days' },
          { value: 'Days_7', label: '7 Days' },
          { value: 'Days_10', label: '10 Days' },
          { value: 'Days_30', label: '30 Days' }
        ]
      },
      { key: 'immediatePayRequired', label: 'Immediate Pay Required', type: 'checkbox' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g., New Delhi, India' },
      { key: 'scheduleTime', label: 'Schedule Time', type: 'text', placeholder: 'YYYY-MM-DD HH:MM:SS' }
    ]
  },
  {
    title: 'Media & Description',
    fields: [
      { key: 'itemPhotoUrl', label: 'Item Photo URL', type: 'text', placeholder: 'Image URL' },
      { key: 'videoId', label: 'Video ID', type: 'text', placeholder: 'YouTube video ID' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Product description' }
    ]
  },
  {
    title: 'Shipping',
    fields: [
      { key: 'shippingService1Option', label: 'Shipping Service 1 Option', type: 'text', placeholder: 'e.g., USPSPriority' },
      { key: 'shippingService1Cost', label: 'Shipping Service 1 Cost', type: 'number', placeholder: 'e.g., 5.99' },
      { key: 'shippingService1Priority', label: 'Shipping Service 1 Priority', type: 'number', placeholder: 'e.g., 1' },
      { key: 'shippingService2Option', label: 'Shipping Service 2 Option', type: 'text', placeholder: 'e.g., USPSGround' },
      { key: 'shippingService2Cost', label: 'Shipping Service 2 Cost', type: 'number', placeholder: 'e.g., 3.99' },
      { key: 'shippingService2Priority', label: 'Shipping Service 2 Priority', type: 'number', placeholder: 'e.g., 2' },
      { key: 'maxDispatchTime', label: 'Max Dispatch Time', type: 'number', placeholder: 'Days (e.g., 3)' },
      { key: 'shippingProfileName', label: 'Shipping Profile Name', type: 'text', placeholder: 'Profile name' }
    ]
  },
  {
    title: 'Returns & Payment',
    fields: [
      { key: 'returnsAcceptedOption', label: 'Returns Accepted Option', type: 'text', placeholder: 'e.g., ReturnsAccepted' },
      { key: 'returnsWithinOption', label: 'Return Period', type: 'text', placeholder: 'e.g., Days_30' },
      { key: 'refundOption', label: 'Refund Option', type: 'text', placeholder: 'e.g., MoneyBack' },
      { key: 'returnShippingCostPaidBy', label: 'Return Shipping Paid By', type: 'text', placeholder: 'e.g., Buyer' },
      { key: 'returnProfileName', label: 'Return Profile Name', type: 'text', placeholder: 'Profile name' },
      { key: 'paymentProfileName', label: 'Payment Profile Name', type: 'text', placeholder: 'Profile name' }
    ]
  },
  {
    title: 'Relationships',
    fields: [
      { key: 'relationship', label: 'Relationship', type: 'text', placeholder: 'e.g., Variation' },
      { key: 'relationshipDetails', label: 'Relationship Details', type: 'text', placeholder: 'Details' }
    ]
  }
];

export default function CoreFieldDefaultsForm({ formData = {}, onChange }) {
  const handleChange = (fieldKey, value) => {
    onChange({
      ...formData,
      [fieldKey]: value
    });
  };

  return (
    <Stack spacing={3}>
      {CORE_FIELD_SECTIONS.map(section => (
        <Box key={section.title}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            {section.title}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Stack spacing={2}>
            {section.fields.map(field => {
              if (field.type === 'checkbox') {
                return (
                  <FormControlLabel
                    key={field.key}
                    control={
                      <Checkbox
                        checked={formData[field.key] === true || formData[field.key] === 'true'}
                        onChange={(e) => handleChange(field.key, e.target.checked)}
                      />
                    }
                    label={field.label}
                  />
                );
              }

              if (field.type === 'select') {
                return (
                  <TextField
                    key={field.key}
                    select
                    label={field.label}
                    value={formData[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    fullWidth
                    size="small"
                  >
                    <MenuItem value="">
                      <em>No default</em>
                    </MenuItem>
                    {field.options.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              }

              if (field.type === 'textarea') {
                return (
                  <TextField
                    key={field.key}
                    label={field.label}
                    value={formData[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    placeholder={field.placeholder}
                  />
                );
              }

              return (
                <TextField
                  key={field.key}
                  label={field.label}
                  type={field.type}
                  value={formData[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  fullWidth
                  size="small"
                  placeholder={field.placeholder}
                />
              );
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
