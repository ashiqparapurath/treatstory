import { z } from 'zod';
import {firestoreDocumentId} from '@/lib/document-id';

export const weightSelectionSchema = z.object({
  value: z.number().positive().max(100000),
  unit: z.enum(['g', 'kg', 'ml', 'l', 'pieces']),
}).strict();

export const checkoutLineSchema = z.object({
  productId: firestoreDocumentId(),
  quantity: z.number().int().min(1).max(99),
  expectedPrice: z.number().finite().min(0).max(10000000),
  customizationNote: z.string().max(750).default(''),
  weight: weightSelectionSchema.nullable().optional(),
}).strict();

export const checkoutRequestSchema = z.object({
  advancePaymentAcknowledged: z.boolean().default(false),
  checkoutId: z.string().uuid(),
  lines: z.array(checkoutLineSchema).min(1).max(10),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(5).max(40),
  deliveryAddress: z.string().trim().min(10).max(1000),
  customerNote: z.string().trim().max(750).default(''),
  deliveryMode: z.enum(['delivery', 'pickup']).default('delivery'),
  pincode: z.string().regex(/^[0-9]{6}$/).optional(),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestedSlot: z.string().max(60).default(''),
  giftRecipient: z.string().trim().max(120).default(''),
  giftMessage: z.string().trim().max(300).default(''),
}).strict();

export type CheckoutPayload = z.infer<typeof checkoutRequestSchema>;
export type CheckoutLine = z.infer<typeof checkoutLineSchema>;
