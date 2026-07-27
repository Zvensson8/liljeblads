import { z } from 'zod';

export const workOrderFormSchema = z.object({
  action: z.string().min(1, 'Åtgärd krävs').max(200, 'Max 200 tecken'),
  property_id: z.string().min(1, 'Fastighet krävs'),
  component_id: z.string().optional(),
  due_date: z.string().optional(),
  status: z.enum([
    'not_started',
    'awaiting_quote',
    'ordered',
    'completed',
    'archived',
  ]),
  priority: z.enum(['low', 'medium', 'high']),
  price: z.string().optional(),
  contractor: z.string().max(100, 'Max 100 tecken').optional(),
  quarter: z.string().max(10, 'Max 10 tecken').optional(),
  comments: z.string().max(1000, 'Max 1000 tecken').optional(),
  reminder_enabled: z.boolean().default(false),
  reminder_frequency: z
    .enum(['weekly', 'biweekly', 'triweekly', 'monthly', 'none'])
    .default('weekly'),
  reminder_recipient_email: z
    .string()
    .email('Ogiltig e-postadress')
    .optional()
    .or(z.literal('')),
});

export type WorkOrderFormData = z.infer<typeof workOrderFormSchema>;
