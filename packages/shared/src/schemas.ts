import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const emailSchema = z.string().email('Please enter a valid email address');

export const setupCompleteSchema = z.object({
  admin: z.object({
    displayName: z.string().min(1).max(100),
    email: emailSchema,
    password: passwordSchema,
  }),
  cafe: z.object({
    name: z.string().min(1).max(200),
    tagline: z.string().max(120).optional().nullable(),
    contactEmail: z.string().email().optional().nullable(),
    websiteUrl: z.string().url().optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
  }),
  venue: z.object({
    name: z.string().min(1).max(200),
    address: z.string().max(500).optional().nullable(),
    postcode: z.string().max(20).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
  publicUrl: z.string().url('Please enter a valid URL'),
});

export type SetupCompletePayload = z.infer<typeof setupCompleteSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const checkInSubmitSchema = z
  .object({
    customerName: z.string().min(1).max(50).optional(),
    customerContact: z.string().max(100).optional().nullable(),
    gdprConsent: z.boolean().optional(),
    // When set, server reuses the customer details from existing jobs with this token
    // (the customer is adding another item from the same device/session).
    customerToken: z.string().min(8).max(64).optional(),
    itemDescription: z.string().min(1).max(200),
    faultDescription: z.string().min(1).max(500),
    itemCategoryId: z.string().uuid().optional().nullable(),
    itemBrand: z.string().max(100).optional().nullable(),
  })
  .refine(
    (v) => Boolean(v.customerToken) || (Boolean(v.customerName) && v.gdprConsent === true),
    {
      message: 'Provide your name and consent, or a returning customer token',
      path: ['customerName'],
    },
  );

export type CheckInSubmitPayload = z.infer<typeof checkInSubmitSchema>;

// Staff-assisted check-in: a logged-in repairer registering an item on behalf
// of a walk-in (e.g. someone without a phone). Name and contact are optional;
// consent is only required when some personal detail is actually captured.
export const assistedCheckInSchema = z
  .object({
    customerName: z.string().max(50).optional().nullable(),
    customerContact: z.string().max(100).optional().nullable(),
    gdprConsent: z.boolean().optional(),
    itemDescription: z.string().min(1).max(200),
    faultDescription: z.string().min(1).max(500),
    itemCategoryId: z.string().uuid().optional().nullable(),
    itemBrand: z.string().max(100).optional().nullable(),
  })
  .refine(
    (v) => {
      const hasPii = Boolean(v.customerName?.trim()) || Boolean(v.customerContact?.trim());
      return !hasPii || v.gdprConsent === true;
    },
    {
      message: 'Please confirm the customer is happy for their details to be stored',
      path: ['gdprConsent'],
    },
  );

export type AssistedCheckInPayload = z.infer<typeof assistedCheckInSchema>;

export const recurrenceRuleSchema = z.object({
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  interval: z.number().int().positive().default(1).optional(),
  byWeekday: z.union([
    z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']),
    z.array(z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])),
  ]),
  bySetPos: z.union([z.number().int(), z.array(z.number().int())]).optional(),
});

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

export const eventTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  venueId: z.string().uuid(),
  description: z.string().max(2000).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  recurrenceRule: recurrenceRuleSchema,
  recurrenceEndDate: z.string().optional().nullable(),
  maxItemsPerSession: z.number().int().positive().optional().nullable(),
  isPublished: z.boolean().default(false),
});

export const oneOffEventSchema = z.object({
  name: z.string().min(1).max(200),
  venueId: z.string().uuid(),
  description: z.string().max(2000).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isPublished: z.boolean().default(false),
  maxItems: z.number().int().positive().optional().nullable(),
});

export const venueSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  postcode: z.string().max(20).optional().nullable(),
  what3words: z.string().max(100).optional().nullable(),
  mapUrl: z.string().url().optional().nullable().or(z.literal('')),
  directions: z.string().max(2000).optional().nullable(),
  parkingInfo: z.string().max(1000).optional().nullable(),
  accessibilityInfo: z.string().max(1000).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isHomeVenue: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const skillCategorySchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(50).default('wrench'),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1B6B5A'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const userCreateSchema = z.object({
  email: emailSchema,
  displayName: z.string().min(1).max(100),
  role: z.enum(['super_admin', 'admin', 'repairer']).default('repairer'),
  bio: z.string().max(2000).optional().nullable(),
  skills: z.array(z.string()).default([]),
  joinDate: z.string().optional().nullable(),
  showOnPublicPage: z.boolean().default(true),
  showOnHomePage: z.boolean().default(true),
});

export const userUpdateSchema = userCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const repairUpdateSchema = z.object({
  status: z.enum(['waiting', 'in_progress', 'completed', 'cannot_repair', 'returned']).optional(),
  repairerId: z.string().uuid().nullable().optional(),
  outcomeNotes: z.string().max(2000).optional().nullable(),
  partsUsed: z.string().max(500).optional().nullable(),
  environmentalSavingKg: z.number().nonnegative().optional().nullable(),
  customerName: z.string().max(50).optional().nullable(),
  customerContact: z.string().max(100).optional().nullable(),
  itemDescription: z.string().max(200).optional(),
  faultDescription: z.string().max(500).optional(),
  itemCategoryId: z.string().uuid().optional().nullable(),
  itemBrand: z.string().max(100).optional().nullable(),
});

export const cafeSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tagline: z.string().max(120).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  websiteUrl: z.string().url().optional().nullable().or(z.literal('')),
  publicUrl: z.string().url().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #rrggbb hex colour')
    .optional()
    .nullable()
    .or(z.literal('')),
  donateUrl: z.string().url().optional().nullable().or(z.literal('')),
  contactEmail: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  socialLinks: z.record(z.string(), z.string()).optional(),
});
