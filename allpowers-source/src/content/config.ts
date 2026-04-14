import { z, defineCollection } from 'astro:content';

const productsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    image: z.string(),
    affiliateUrl: z.string().url(),
    couponCode: z.string().default('AFFCT10'),
    shortDescription: z.string(),
    batteryCapacity: z.string(),
    outputWatts: z.string(),
    weight: z.string(),
    rechargeMethods: z.array(z.string()),
    price: z.number().optional(),
    originalPrice: z.number().optional(),
    featured: z.boolean().default(false),
    useCases: z.array(z.string()),
    order: z.number().default(99),
  })
});

export const collections = {
  'products': productsCollection,
};
