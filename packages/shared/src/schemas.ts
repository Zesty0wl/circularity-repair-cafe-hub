import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const emailSchema = z.string().email('Please enter a valid email address');

// A #rrggbb hex colour. Used for the per-cafe brand + accent colours.
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #rrggbb hex colour');

// Selectable, self-hosted typefaces a cafe can pick for its display + body
// text. Every option is bundled with the web app (see +layout.svelte imports)
// so the choice only switches which family the CSS variables point at — it
// never loads a third-party/CDN font (the app's CSP forbids that).
export const FONT_OPTIONS = [
  {
    value: 'fraunces',
    label: 'Fraunces (elegant serif)',
    stack: '"Fraunces Variable", Fraunces, Georgia, "Times New Roman", serif',
  },
  {
    value: 'mulish',
    label: 'Mulish (clean sans)',
    stack: '"Mulish Variable", Mulish, ui-sans-serif, system-ui, sans-serif',
  },
  {
    value: 'hanken',
    label: 'Hanken Grotesk (modern sans)',
    stack: '"Hanken Grotesk Variable", "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif',
  },
  {
    value: 'system',
    label: 'System sans',
    stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  },
] as const;

export type FontChoice = (typeof FONT_OPTIONS)[number]['value'];

const FONT_VALUES = FONT_OPTIONS.map((f) => f.value) as [FontChoice, ...FontChoice[]];

export const fontChoiceSchema = z.enum(FONT_VALUES);

/** Map a font choice to its CSS `font-family` stack. */
export const FONT_STACKS = Object.fromEntries(
  FONT_OPTIONS.map((f) => [f.value, f.stack]),
) as Record<FontChoice, string>;

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
    // Optional branding captured in the onboarding wizard.
    primaryColor: hexColorSchema.optional().nullable().or(z.literal('')),
    accentColor: hexColorSchema.optional().nullable().or(z.literal('')),
    headingFont: fontChoiceSchema.optional().nullable().or(z.literal('')),
    bodyFont: fontChoiceSchema.optional().nullable().or(z.literal('')),
  }),
  venue: z.object({
    name: z.string().min(1).max(200),
    address: z.string().max(500).optional().nullable(),
    postcode: z.string().max(20).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
  publicUrl: z.string().url('Please enter a valid URL'),
  // What the cafe agreed to share with the project. Optional so an older
  // client, or a scripted setup, still works: leaving it out shares nothing.
  telemetry: z
    .object({ level: z.enum(['none', 'standard', 'community']) })
    .optional(),
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
    // What kind of thing it is, used to look up the CO2 saving. Optional,
    // because a visitor may not find their item in the list.
    co2FactorId: z.string().uuid().optional().nullable(),
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
    // What kind of thing it is, used to look up the CO2 saving. Optional,
    // because a visitor may not find their item in the list.
    co2FactorId: z.string().uuid().optional().nullable(),
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
  // Every session made from this template also offers help moving a computer
  // to Linux. Ignored unless the cafe has the feature switched on.
  supportsLinux: z.boolean().default(false),
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
  /** People can also get help moving a computer to Linux at this session. */
  supportsLinux: z.boolean().default(false),
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
  // Helps at Linux sessions. Only asked for when the cafe runs them.
  linuxRepairer: z.boolean().default(false),
});

export const userUpdateSchema = userCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const repairUpdateSchema = z.object({
  status: z.enum(['waiting', 'in_progress', 'completed', 'cannot_repair', 'awaiting_return', 'returned']).optional(),
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

// ─────────────────────────── Linux Repair Cafe ───────────────────────────
// A Linux Repair Cafe helps people move an ageing computer to Linux instead of
// replacing it. See https://www.repaircafe.org/en/linux-repair-cafe/.
//
// The lists below are the choices a volunteer picks from when they write up an
// install. They live here so the form, the server and the reports all read from
// one place, and a value can never mean one thing in a form and another in a
// chart.

/** What kind of machine somebody brought in. */
export const LINUX_DEVICE_TYPES = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'Desktop (tower)' },
  { value: 'all_in_one', label: 'All-in-one' },
  { value: 'other', label: 'Something else' },
] as const;

/**
 * What it ran before. Windows 10 is listed on its own because losing its
 * support is why most machines arrive, and a cafe will want to say so.
 */
export const LINUX_PREVIOUS_OS = [
  { value: 'windows_10', label: 'Windows 10' },
  { value: 'windows_11', label: 'Windows 11' },
  { value: 'windows_older', label: 'Windows 8 or older' },
  { value: 'macos', label: 'macOS' },
  { value: 'chromeos', label: 'ChromeOS' },
  { value: 'linux', label: 'Another Linux' },
  { value: 'none', label: 'Nothing (the machine would not start)' },
  { value: 'other', label: 'Something else' },
] as const;

/**
 * How it went. Only `installed` and `dual_boot` leave somebody with Linux on
 * their own machine, so the reports count those two as a success and say so.
 */
export const LINUX_OUTCOMES = [
  { value: 'installed', label: 'Linux installed' },
  { value: 'dual_boot', label: 'Installed alongside the old system' },
  { value: 'tried_live', label: 'Tried it from a USB stick' },
  { value: 'advice_only', label: 'Advice only' },
  { value: 'not_possible', label: 'Could not be done' },
] as const;

export type LinuxDeviceType = (typeof LINUX_DEVICE_TYPES)[number]['value'];
export type LinuxPreviousOs = (typeof LINUX_PREVIOUS_OS)[number]['value'];
export type LinuxOutcome = (typeof LINUX_OUTCOMES)[number]['value'];

/** The outcomes where somebody went home with Linux on their own computer. */
export const LINUX_SUCCESS_OUTCOMES: readonly LinuxOutcome[] = ['installed', 'dual_boot'];

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((o) => o.value) as [T[number]['value'], ...T[number]['value'][]];

export const linuxDeviceTypeSchema = z.enum(values(LINUX_DEVICE_TYPES));
export const linuxPreviousOsSchema = z.enum(values(LINUX_PREVIOUS_OS));
export const linuxOutcomeSchema = z.enum(values(LINUX_OUTCOMES));

/** Recording one computer that came to a Linux session. */
export const linuxInstallSchema = z.object({
  eventId: z.string().uuid(),
  deviceDescription: z.string().min(1, 'Say what the computer is').max(200),
  deviceBrand: z.string().max(100).optional().nullable(),
  deviceType: linuxDeviceTypeSchema.default('laptop'),
  deviceAgeYears: z.number().int().min(0).max(60).optional().nullable(),
  previousOs: linuxPreviousOsSchema.optional().nullable(),
  distro: z.string().max(100).optional().nullable(),
  outcome: linuxOutcomeSchema.default('installed'),
  repairerId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(50).optional().nullable(),
  customerContact: z.string().max(100).optional().nullable(),
  gdprConsent: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  // What kind of thing it is, used to look up the CO2 saved by keeping it in
  // use. Optional, the same as it is for a repair.
  co2FactorId: z.string().uuid().optional().nullable(),
});

// Personal details are only kept when somebody has said they may be. The
// visitor is not present when this is written up, so the volunteer confirms it
// on their behalf, exactly as they do for an assisted check-in.
export const linuxInstallCreateSchema = linuxInstallSchema.refine(
  (v) => {
    const hasPersonalDetails = Boolean(v.customerName?.trim()) || Boolean(v.customerContact?.trim());
    return !hasPersonalDetails || v.gdprConsent === true;
  },
  {
    message: 'Please confirm the visitor is happy for their details to be stored',
    path: ['gdprConsent'],
  },
);

export const linuxInstallUpdateSchema = linuxInstallSchema.partial().omit({ eventId: true });

export type LinuxInstallPayload = z.infer<typeof linuxInstallSchema>;

export const cafeSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tagline: z.string().max(120).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  websiteUrl: z.string().url().optional().nullable().or(z.literal('')),
  publicUrl: z.string().url().optional(),
  primaryColor: hexColorSchema.optional().nullable().or(z.literal('')),
  accentColor: hexColorSchema.optional().nullable().or(z.literal('')),
  headingFont: fontChoiceSchema.optional().nullable().or(z.literal('')),
  bodyFont: fontChoiceSchema.optional().nullable().or(z.literal('')),
  donateUrl: z.string().url().optional().nullable().or(z.literal('')),
  contactEmail: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  socialLinks: z.record(z.string(), z.string()).optional(),
  // The cafe's own listing on repaircafe.org. Admins may paste the full page
  // URL or just the slug; the server reduces it to a slug before saving.
  repaircafeSlug: z.string().max(300).optional().nullable().or(z.literal('')),
});
