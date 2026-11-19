import { z } from 'zod';

export const styles = ['Professional', 'Luxury', 'Friendly', 'Short & Simple'] as const;
export const languages = ['English', 'Malayalam', 'Hindi'] as const;
const publicText = (max: number) => z.string().trim().max(max).refine(
  value => !/[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|(?:\+?\d[ ()-]*){10,}|[<>\u0000-\u0008\u000e-\u001f]/iu.test(value),
  'Use public product facts only. Remove contact details, links or markup.',
);
export const suggestionRequest = z.strictObject({
  name: z.string().trim().min(2).pipe(publicText(120)),
  category: z.string().trim().min(1).pipe(publicText(80)),
  details: publicText(2000),
  ingredients: publicText(1000),
  features: publicText(1000),
  sizes: z.array(z.strictObject({
    value: z.number().positive().max(100000),
    unit: z.enum(['g', 'kg', 'ml', 'l', 'pieces']),
  })).max(8),
  style: z.enum(styles),
  language: z.enum(languages),
});
export type DescriptionRequest = z.infer<typeof suggestionRequest>;
