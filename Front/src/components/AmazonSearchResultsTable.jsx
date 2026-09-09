import {
  Box,
  Checkbox,
  Chip,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { formatAmazonDelivery } from '../utils/formatAmazonDelivery.js';

function ProductBadges({ product, showAlreadyListed = false }) {
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
      {product.isAmazonChoice ? <Chip size="small" color="success" label="Amazon's Choice" /> : null}
      {product.isBestSeller ? <Chip size="small" color="warning" label="Best Seller" /> : null}
      {product.hasPrime ? <Chip size="small" label="Prime" /> : null}
      {product.limitedTimeDeal ? <Chip size="small" label="Limited time deal" /> : null}
      {product.dealOfTheDay ? <Chip size="small" label="Deal of the day" /> : null}
      {product.sponsored ? <Chip size="small" label="Sponsored" /> : null}
      {showAlreadyListed && product.alreadyListed ? (
        <Chip size="small" color="warning" label="Already listed" />
      ) : null}
    </Stack>
  );
}

export default function AmazonSearchResultsTable({
  products = [],
  selectable = false,
  selected,
  onToggle,
  onToggleAll,
  showAlreadyListed = false,
}) {
  const selectedSet = selected instanceof Set ? selected : new Set();
  const selectedCount = products.filter((p) => selectedSet.has(p.asin)).length;
  const allChecked = selectable && products.length > 0 && selectedCount === products.length;
  const someChecked = selectable && selectedCount > 0 && selectedCount < products.length;

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {selectable ? (
            <TableCell padding="checkbox">
              <Checkbox
                checked={allChecked}
                indeterminate={someChecked}
                onChange={(e) => onToggleAll?.(e.target.checked)}
              />
            </TableCell>
          ) : null}
          <TableCell>Product</TableCell>
          <TableCell>ASIN</TableCell>
          <TableCell>Price</TableCell>
          <TableCell>Rating</TableCell>
          <TableCell>Bought</TableCell>
          <TableCell>Delivery</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {products.map((product) => (
          <TableRow
            key={product.asin}
            hover
            selected={selectable && selectedSet.has(product.asin)}
          >
            {selectable ? (
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedSet.has(product.asin)}
                  onChange={() => onToggle?.(product.asin)}
                />
              </TableCell>
            ) : null}
            <TableCell>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                {product.image ? (
                  <Box
                    component="img"
                    src={product.image}
                    alt=""
                    sx={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 0.5, flexShrink: 0 }}
                  />
                ) : null}
                <Box>
                  {product.optimizedUrl || product.url ? (
                    <Link
                      href={product.optimizedUrl || product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="body2"
                      underline="hover"
                      sx={{ display: 'block', maxWidth: 460 }}
                    >
                      {product.title || 'Untitled'}
                    </Link>
                  ) : (
                    <Typography variant="body2" sx={{ maxWidth: 460 }}>
                      {product.title || 'Untitled'}
                    </Typography>
                  )}
                  <ProductBadges product={product} showAlreadyListed={showAlreadyListed} />
                  {product.certification ? (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {product.certification}
                    </Typography>
                  ) : null}
                </Box>
              </Stack>
            </TableCell>
            <TableCell>
              <Typography variant="caption" fontFamily="monospace">{product.asin}</Typography>
            </TableCell>
            <TableCell>
              <Typography variant="body2">{product.price || '—'}</Typography>
              {product.moreBuyingChoices ? (
                <Typography variant="caption" color="text.secondary" display="block">
                  {product.moreBuyingChoices}
                </Typography>
              ) : null}
            </TableCell>
            <TableCell>
              {product.stars || product.totalReviews ? (
                <Typography variant="body2">
                  {product.stars ? `${product.stars}★` : '—'}
                  {product.totalReviews ? ` (${product.totalReviews})` : ''}
                </Typography>
              ) : '—'}
            </TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ maxWidth: 160 }}>
                {product.numberOfPeopleBought || '—'}
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>
                {formatAmazonDelivery(product.delivery) || '—'}
              </Typography>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
