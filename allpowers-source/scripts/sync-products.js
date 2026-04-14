import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productsDir = path.resolve(__dirname, '../src/content/products');

async function scrapeProductData(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Get image from Open Graph
    let image = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');
    
    // Shopify often uses "og:image:secure_url" as well
    if (!image) {
      image = $('meta[property="og:image:secure_url"]').attr('content');
    }

    // Ensure it's an absolute URL if starting with //
    if (image && image.startsWith('//')) {
      image = 'https:' + image;
    }
    
    // Clean query params for the image just in case
    if (image && image.includes('?')) {
        image = image.split('?')[0];
    }

    // Get price from JSON-LD or meta tags
    let price = null;
    let originalPrice = null;

    // Try finding JSON-LD for Product
    // Look for <script type="application/ld+json">
    $('script[type="application/ld+json"]').each((i, el) => {
        try {
            const data = JSON.parse($(el).html());
            // Shopify puts an array of objects or single object
            let productData = data;
            if (Array.isArray(data)) {
                productData = data.find(item => item['@type'] === 'Product' || (item['@graph'] && item['@graph'].find(g => g['@type'] === 'Product')));
            }
            if (productData && productData.offers) {
                const offers = Array.isArray(productData.offers) ? productData.offers[0] : productData.offers;
                if (offers && offers.price) {
                    price = parseFloat(offers.price);
                }
            }
        } catch (e) {
            // ignore JSON parse error
        }
    });

    // Fallback if no JSON-LD found: try meta tags
    if (!price) {
        const metaPrice = $('meta[property="og:price:amount"]').attr('content');
        if (metaPrice) {
            price = parseFloat(metaPrice);
        }
    }

    // Optional: try parsing original price from specific Shopify classes if available (often '.price__regular .price-item--regular' etc)
    // Here we'll try to just grab common original price classes or leave it if too difficult
    // Typically on shopify: <s class="price-item price-item--regular">...</s>
    const compareAtPriceText = $('s.price-item--regular, .price__sale s.price-item--regular').first().text();
    if (compareAtPriceText) {
        const parsedOrig = parseFloat(compareAtPriceText.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (!isNaN(parsedOrig) && parsedOrig > price) {
            originalPrice = parsedOrig;
        }
    }

    return { image, price, originalPrice };
  } catch (error) {
    console.error(`Failed to fetch and scrape data from ${url}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Starting product synchronization...');
  
  const files = fs.readdirSync(productsDir).filter(file => file.endsWith('.md'));
  
  for (const file of files) {
    console.log(`Processing ${file}...`);
    const filePath = path.join(productsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Parse frontmatter
    const parsed = matter(content);
    const { affiliateUrl } = parsed.data;

    if (!affiliateUrl) {
      console.log(`  Skipping ${file}: No affiliateUrl found.`);
      continue;
    }

    // Remove tracking payload to get canonical page for safer scraping
    const cleanUrl = affiliateUrl.split('?')[0];

    console.log(`  Scraping target: ${cleanUrl}`);
    const scrapedData = await scrapeProductData(cleanUrl);

    if (scrapedData) {
      let updated = false;

      if (scrapedData.image && parsed.data.image !== scrapedData.image) {
        parsed.data.image = scrapedData.image;
        updated = true;
        console.log(`  Updated image: ${scrapedData.image}`);
      }

      if (scrapedData.price && parsed.data.price !== scrapedData.price) {
        parsed.data.price = scrapedData.price;
        updated = true;
        console.log(`  Updated price: ${scrapedData.price}`);
      }

      // Only update originalPrice if we successfully scraped it and it's different
      // Or if previous originalPrice exists, maybe we keep it. We'll update it if scraped.
      if (scrapedData.originalPrice && parsed.data.originalPrice !== scrapedData.originalPrice) {
          parsed.data.originalPrice = scrapedData.originalPrice;
          updated = true;
          console.log(`  Updated originalPrice: ${scrapedData.originalPrice}`);
      }

      if (updated) {
        // Build the new markdown
        const newFileContent = matter.stringify(parsed.content, parsed.data);
        fs.writeFileSync(filePath, newFileContent, 'utf-8');
        console.log(`  Saved changes to ${file}.`);
      } else {
        console.log(`  No changes needed for ${file}.`);
      }
    }
  }

  console.log('Product synchronization complete!');
}

main();
