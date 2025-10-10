import { z } from 'zod';

// Common validation schemas for reuse across the application

export const nameSchema = z
  .string()
  .trim()
  .min(1, { message: "Namnet får inte vara tomt" })
  .max(100, { message: "Namnet får inte vara längre än 100 tecken" });

export const descriptionSchema = z
  .string()
  .trim()
  .max(500, { message: "Beskrivningen får inte vara längre än 500 tecken" })
  .optional();

export const emailSchema = z
  .string()
  .trim()
  .email({ message: "Ogiltig e-postadress" })
  .max(255, { message: "E-postadressen får inte vara längre än 255 tecken" });

export const addressSchema = z
  .string()
  .trim()
  .max(255, { message: "Adressen får inte vara längre än 255 tecken" })
  .optional();

export const urlSchema = z
  .string()
  .url({ message: "Ogiltig URL" })
  .optional()
  .or(z.literal(''));

export const positiveNumberSchema = z
  .number()
  .positive({ message: "Värdet måste vara positivt" })
  .or(z.string().regex(/^\d+$/).transform(Number));

export const nonNegativeNumberSchema = z
  .number()
  .nonnegative({ message: "Värdet får inte vara negativt" })
  .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number));

export const yearSchema = z
  .number()
  .int()
  .min(1900, { message: "Ogiltigt år" })
  .max(2100, { message: "Ogiltigt år" })
  .or(z.string().regex(/^\d{4}$/).transform(Number));

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Ogiltigt datumformat (ÅÅÅÅ-MM-DD)" });

// Property validation
export const propertySchema = z.object({
  name: nameSchema,
  address: addressSchema,
  description: descriptionSchema,
});

// Component validation
export const componentSchema = z.object({
  name: nameSchema,
  type: z.string().min(1, { message: "Välj en komponenttyp" }),
  manufacturer: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  serial_number: z.string().trim().max(100).optional(),
  registration_number: z.string().trim().max(100).optional(),
  installation_year: yearSchema.optional().nullable(),
  status: z.enum(['active', 'maintenance', 'inactive']),
  priority: z.number().int().min(1).max(5).optional().nullable(),
  cost_center: z.string().trim().max(50).optional(),
  room_zone: z.string().trim().max(100).optional(),
  supplier: z.string().trim().max(100).optional(),
  aff_code: z.string().trim().max(50).optional(),
  refrigerant_type: z.string().trim().max(50).optional(),
  refrigerant_code: z.string().trim().max(50).optional(),
  refrigerant_amount_kg: nonNegativeNumberSchema.optional().nullable(),
  notes: descriptionSchema,
});

// Maintenance history validation
export const maintenanceHistorySchema = z.object({
  action_type: z.string().trim().min(1, { message: "Åtgärdstyp krävs" }).max(100),
  performed_date: dateSchema,
  supplier: z.string().trim().max(100).optional(),
  cost: nonNegativeNumberSchema.optional().nullable(),
  notes: descriptionSchema,
});

// Category validation
export const categorySchema = z.object({
  name: nameSchema,
  parent_id: z.string().uuid().optional().nullable(),
});

// Drift task validation
export const driftTaskSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  planned_count: z.number().int().nonnegative().default(0),
});

// Drift task component validation
export const driftTaskComponentSchema = z.object({
  object_name: z.string().trim().max(100).optional(),
  series_id: z.string().trim().max(100).optional(),
  registration_number: z.string().trim().max(100).optional(),
});

// Floor validation
export const floorSchema = z.object({
  name: nameSchema,
  level: z.number().int().optional().nullable(),
  drawing_url: urlSchema,
});
