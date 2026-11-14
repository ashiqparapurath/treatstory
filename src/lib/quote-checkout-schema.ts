import { z } from 'zod';
import { weightSelectionSchema } from './checkout-schema';
export const quoteFulfillmentSchema = z
  .object({
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().min(5).max(40),
    deliveryAddress: z.string().trim().min(10).max(1000),
    deliveryMode: z.enum(['delivery', 'pickup']),
    pincode: z
      .string()
      .regex(/^[0-9]{6}$/)
      .optional(),
    requestedSlot: z.string().max(60).default(''),
    expectedTotal: z.number().finite().positive().max(10000000),
    weight: weightSelectionSchema.nullable().default(null),
  })
  .strict();
export type QuoteFulfillment = z.infer<typeof quoteFulfillmentSchema>;
