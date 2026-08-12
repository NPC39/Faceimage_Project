import { z } from 'zod';

export const PricingTypeEnum = z.enum(['FREE', 'PAID']);
export const EventStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const createEventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { message: 'Event name must be at least 2 characters long' })
      .max(100, { message: 'Event name cannot exceed 100 characters' }),
    description: z
      .string()
      .trim()
      .max(1000, { message: 'Description cannot exceed 1000 characters' })
      .optional()
      .or(z.literal('')),
    eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid event date',
    }),
    pricingType: PricingTypeEnum.default('FREE'),
    pricePerPhoto: z.number().nonnegative({ message: 'Price cannot be negative' }).default(0),
    currency: z.string().trim().min(3).max(3).default('THB'),
  })
  .refine(
    (data) => {
      if (data.pricingType === 'PAID') {
        return data.pricePerPhoto > 0;
      }
      return true;
    },
    {
      message: 'PAID events require a price per photo greater than 0',
      path: ['pricePerPhoto'],
    }
  );

export const updateEventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { message: 'Event name must be at least 2 characters long' })
      .max(100, { message: 'Event name cannot exceed 100 characters' })
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, { message: 'Description cannot exceed 1000 characters' })
      .optional()
      .nullable(),
    eventDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'Invalid event date',
      })
      .optional(),
    pricingType: PricingTypeEnum.optional(),
    pricePerPhoto: z.number().nonnegative({ message: 'Price cannot be negative' }).optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    status: EventStatusEnum.optional(),
  })
  .refine(
    (data) => {
      if (data.pricingType === 'PAID' && data.pricePerPhoto !== undefined) {
        return data.pricePerPhoto > 0;
      }
      return true;
    },
    {
      message: 'PAID events require a price per photo greater than 0',
      path: ['pricePerPhoto'],
    }
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
