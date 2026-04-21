import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import AmazonProduct from '../models/AmazonProduct.js';
import ProductUmbrella from '../models/ProductUmbrella.js';
import { generateWithGemini, replacePlaceholders } from '../utils/gemini.js';
import { createEbayImageWithOverlay, deleteEbayImage } from '../utils/imageProcessor.js';

const router = express.Router();

// Fetch Amazon data and optionally save to database
router.post('/', requireAuth, async (req, res) => {
  try {
    const { asin, sellerId, productUmbrellaId } = req.body;

    if (!asin || !productUmbrellaId) {
      return res.status(400).json({ error: 'ASIN and Product Umbrella are required' });
    }

    const url = `https://amazon-helper.vercel.app/api/items?asin=${asin}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'Failed to fetch Amazon data' 
      });
    }

    const data = await response.json();
    const item = data.ItemsResult?.Items?.[0];

    if (!item) {
      return res.status(404).json({ error: 'No item found for this ASIN' });
    }

    // Extract and format the data
    let title = item.ItemInfo?.Title?.DisplayValue || '';
    const brand = 
      item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ||
      item.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue ||
      'Unbranded';

    // Remove brand from title if it's included
    if (brand && title.toLowerCase().includes(brand.toLowerCase())) {
      title = title.replace(new RegExp(brand, 'ig'), '').trim();
    }

    let price = item.Offers?.Listings?.[0]?.Price?.DisplayAmount || '';
    price = price.split(' ')[0];

    const description = (item.ItemInfo?.Features?.DisplayValues || []).join('\n');

    // Collect all images
    const allImages = [];
    if (item.Images?.Primary?.Large?.URL) {
      allImages.push(item.Images.Primary.Large.URL);
    }
    if (item.Images?.Variants?.length) {
      item.Images.Variants.forEach(img => {
        if (img.Large?.URL && !allImages.includes(img.Large.URL)) {
          allImages.push(img.Large.URL);
        }
      });
    }
    if (item.Images?.Alternate?.length) {
      item.Images.Alternate.forEach(img => {
        if (img.Large?.URL && !allImages.includes(img.Large.URL)) {
          allImages.push(img.Large.URL);
        }
      });
    }

    const productData = {
      asin,
      title,
      price,
      brand,
      description,
      images: allImages,
      rawData: item
    };

    // If sellerId and productUmbrellaId are provided, save to database
    if (productUmbrellaId) {
      // Check for duplicate: same ASIN + same seller (regardless of umbrella)
      const duplicateCheck = {
        asin
      };
      
      // Handle sellerId - it can be null/undefined, so we need to check accordingly
      if (sellerId) {
        duplicateCheck.sellerId = sellerId;
      } else {
        duplicateCheck.sellerId = null;
      }

      const existingProduct = await AmazonProduct.findOne(duplicateCheck);
      
      if (existingProduct) {
        return res.status(409).json({ 
          error: 'This product already exists for the selected seller',
          productId: existingProduct._id
        });
      }

      // Fetch the product umbrella with custom columns
      const umbrella = await ProductUmbrella.findById(productUmbrellaId)
        .populate('customColumns.columnId');
      
      if (!umbrella) {
        return res.status(404).json({ error: 'Product umbrella not found' });
      }

      // Generate custom fields using Gemini
      const customFields = {};
      
      if (umbrella.customColumns && umbrella.customColumns.length > 0) {
        const dataForPlaceholders = {
          title,
          brand,
          description,
          price,
          asin
        };

        // Process each custom column
        for (const customCol of umbrella.customColumns) {
          try {
            const columnName = customCol.columnId.name;
            const promptTemplate = customCol.prompt;
            
            // Replace placeholders in the prompt
            const processedPrompt = replacePlaceholders(promptTemplate, dataForPlaceholders);
            
            // Generate content with OpenAI
            console.log(`Generating ${columnName} for ASIN ${asin}...`);
            let generatedValue = await generateWithGemini(processedPrompt);
            
            // Truncate to 80 characters if it's an eBay title column
            if (columnName.toLowerCase().includes('ebay') && columnName.toLowerCase().includes('title')) {
              if (generatedValue.length > 80) {
                generatedValue = generatedValue.substring(0, 80);
                console.log(`Truncated ${columnName} to exactly 80 characters`);
              }
            }
            
            customFields[columnName] = generatedValue;
            console.log(`Generated ${columnName}: ${generatedValue.substring(0, 50)}...`);
          } catch (error) {
            console.error(`Error generating ${customCol.columnId.name}:`, error);
            customFields[customCol.columnId.name] = 'Error generating content';
          }
        }
      }

      const amazonProductData = {
        ...productData,
        productUmbrellaId,
        customFields,
        createdBy: req.user.userId
      };
      
      // Only add sellerId if it's provided
      if (sellerId) {
        amazonProductData.sellerId = sellerId;
      }

      // Process eBay image with overlay if we have images
      let ebayImagePath = null;
      if (allImages.length > 0) {
        try {
          console.log(`Processing eBay image overlay for ASIN ${asin}...`);
          ebayImagePath = await createEbayImageWithOverlay(allImages[0], 'usa-seller');
          amazonProductData.ebayImage = ebayImagePath;
          console.log(`eBay image created: ${ebayImagePath}`);
        } catch (error) {
          console.error('Error creating eBay image overlay:', error);
          // Continue without eBay image if processing fails
        }
      }

      const amazonProduct = new AmazonProduct(amazonProductData);

      await amazonProduct.save();
      await amazonProduct.populate({ path: 'sellerId', populate: { path: 'user', select: 'username email' } });
      await amazonProduct.populate('productUmbrellaId', 'name');
      await amazonProduct.populate('createdBy', 'name email');

      return res.json({
        ...productData,
        customFields,
        ebayImage: ebayImagePath,
        saved: true,
        _id: amazonProduct._id,
        seller: amazonProduct.sellerId,
        productUmbrella: amazonProduct.productUmbrellaId
      });
    }

    // Return data without saving
    res.json({
      ...productData,
      saved: false
    });

  } catch (error) {
    console.error('Amazon lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all saved Amazon products
router.get('/', requireAuth, async (req, res) => {
  try {
    const { sellerId, productUmbrellaId, includeDeleted } = req.query;
    const filter = {};
    
    if (sellerId) filter.sellerId = sellerId;
    if (productUmbrellaId) filter.productUmbrellaId = productUmbrellaId;
    
    // By default, exclude deleted products unless explicitly requested
    if (includeDeleted === 'true') {
      // Show only deleted products
      filter.deleted = true;
    } else {
      // Show only active (non-deleted) products
      filter.deleted = { $ne: true };
    }

    const products = await AmazonProduct.find(filter)
      .populate({ path: 'sellerId', populate: { path: 'user', select: 'username email' } })
      .populate('productUmbrellaId', 'name')
      .populate('createdBy', 'name email')
      .populate('deletedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    console.error('Error fetching Amazon products:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single Amazon product by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const product = await AmazonProduct.findById(req.params.id)
      .populate({ path: 'sellerId', populate: { path: 'user', select: 'username email' } })
      .populate('productUmbrellaId', 'name')
      .populate('createdBy', 'name email');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching Amazon product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Soft delete Amazon product (mark as deleted)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const product = await AmazonProduct.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Mark as deleted instead of removing
    product.deleted = true;
    product.deletedAt = new Date();
    product.deletedBy = req.user.userId;
    await product.save();

    res.json({ message: 'Product archived successfully', product });
  } catch (error) {
    console.error('Error archiving Amazon product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Restore archived product
router.patch('/:id/restore', requireAuth, async (req, res) => {
  try {
    const product = await AmazonProduct.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Restore the product
    product.deleted = false;
    product.deletedAt = null;
    product.deletedBy = null;
    await product.save();

    await product.populate({ path: 'sellerId', populate: { path: 'user', select: 'username email' } });
    await product.populate('productUmbrellaId', 'name');
    await product.populate('createdBy', 'name email');

    res.json({ message: 'Product restored successfully', product });
  } catch (error) {
    console.error('Error restoring Amazon product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Permanently delete Amazon product
router.delete('/:id/permanent', requireAuth, async (req, res) => {
  try {
    const product = await AmazonProduct.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete associated eBay image file if it exists
    if (product.ebayImage) {
      await deleteEbayImage(product.ebayImage);
    }

    res.json({ message: 'Product permanently deleted successfully' });
  } catch (error) {
    console.error('Error permanently deleting Amazon product:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
