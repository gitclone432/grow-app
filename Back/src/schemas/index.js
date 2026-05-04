import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// ── Users ─────────────────────────────────────────────────────────────────────

const USER_ROLES = [
  'productadmin',
  'listingadmin',
  'lister',
  'advancelister',
  'compatibilityadmin',
  'compatibilityeditor',
  'seller',
  'fulfillmentadmin',
  'hradmin',
  'hr',
  'operationhead',
  'trainee',
  'hoc',
  'compliancemanager',
];

export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  newUserRole: z.enum(USER_ROLES, { errorMap: () => ({ message: 'Invalid role' }) }),
  // email is optional — if provided it must be a valid address or an empty string
  email: z.union([z.string().email('Invalid email format'), z.literal('')]).optional(),
  department: z.string().optional(),
});

// ── Leaves ────────────────────────────────────────────────────────────────────

export const createLeaveSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().trim().min(1, 'Reason is required'),
});

export const updateLeaveStatusSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    errorMap: () => ({ message: 'Status must be "approved" or "rejected"' }),
  }),
  rejectionReason: z.string().optional(),
});

// ── Config masters ────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export const createPlatformSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
});

export const createSubcategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  categoryId: z.string().min(1, 'Category is required'),
});

export const createRangeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  categoryId: z.string().optional(),
});

export const createStoreSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  platformId: z.string().min(1, 'Platform is required'),
});

// ── Financial entities ────────────────────────────────────────────────────────

export const createCreditCardSchema = z.object({
  name: z.string().trim().min(1, 'Card name is required'),
});

export const createBankAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  sellers: z.string().optional(),
});

export const createPaymentAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bankAccount: z.string().min(1, 'Bank account is required'),
});

// ── Financial transactions ────────────────────────────────────────────────────

export const createSalarySchema = z.object({
  year: z.number({ invalid_type_error: 'Year must be a number' })
    .int()
    .min(2000, 'Year must be 2000 or later')
    .max(2099, 'Year must be 2099 or earlier'),
  name: z.string().min(1, 'Name is required'),
  designation: z.string().optional(),
});

export const createTransactionSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  bankAccount: z.string().min(1, 'Bank account is required'),
  transactionType: z.enum(['Debit', 'Credit'], {
    errorMap: () => ({ message: 'Transaction type must be "Debit" or "Credit"' }),
  }),
  amount: z.coerce.number({ invalid_type_error: 'Amount must be a number' }),
  remark: z.string().optional(),
  creditCardName: z.string().optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const createExtraExpenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  name: z.string().min(1, 'Name is required'),
  amount: z.coerce.number({ invalid_type_error: 'Amount must be a number' }),
  paidBy: z.string().min(1, 'paidBy is required'),
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  marketplace: z.string().min(1, 'Marketplace is required'),
  date: z.string().optional(),
  productTitle: z.string().optional(),
  supplierLink: z.string().optional(),
  link: z.string().optional(),            // legacy alias
  sourcePrice: z.number().optional(),
  sellingPrice: z.number().optional(),
  quantity: z.number().int().optional(),
  sourcePlatformId: z.string().optional(),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  rangeId: z.string().optional(),
  listingPlatformId: z.string().optional(),
  storeId: z.string().optional(),
  assignedListerId: z.string().optional(),
});

// ── Assignments ───────────────────────────────────────────────────────────────

export const createAssignmentSchema = z.object({
  taskId: z.string().min(1, 'Task is required'),
  listerId: z.string().min(1, 'Lister is required'),
  quantity: z.number({ invalid_type_error: 'Quantity must be a number' }).int().min(1, 'Quantity must be at least 1'),
  listingPlatformId: z.string().min(1, 'Listing platform is required'),
  storeId: z.string().min(1, 'Store is required'),
  notes: z.string().optional(),
  scheduledDate: z.string().optional(),
});

// ── Internal messages ─────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  recipientId: z.string().min(1, 'Recipient is required'),
  body: z.string().min(1, 'Message body is required'),
  mediaUrls: z.array(z.string()).optional(),
});

// ── Ideas ─────────────────────────────────────────────────────────────────────

export const createIdeaSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  createdBy: z.string().min(1, 'createdBy is required'),
  type: z.enum(['idea', 'bug', 'feature', 'improvement']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  completeByDate: z.string().optional(),
});

export const addIdeaCommentSchema = z.object({
  text: z.string().min(1, 'Comment text is required'),
  commentedBy: z.string().min(1, 'commentedBy is required'),
});

// ── Amazon accounts ───────────────────────────────────────────────────────────

export const createAmazonAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  phoneNumber: z.string().optional(),
  notes: z.string().optional(),
});

// ── Chat templates ────────────────────────────────────────────────────────────

export const createChatTemplateSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  label: z.string().min(1, 'Label is required'),
  text: z.string().min(1, 'Text is required'),
});

// ── Column presets ────────────────────────────────────────────────────────────

export const createColumnPresetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  columns: z.array(z.any()).min(1, 'Columns are required'),
  page: z.string().optional(),
});

// ── Custom columns ────────────────────────────────────────────────────────────

export const createCustomColumnSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  dataType: z.string().optional(),
  description: z.string().optional(),
});

// ── Remark templates ──────────────────────────────────────────────────────────

const remarkTemplateItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Template name is required'),
  text: z.string().min(1, 'Template text is required'),
});

export const updateRemarkTemplatesSchema = z.object({
  templates: z.array(remarkTemplateItemSchema).min(1, 'templates must be a non-empty array'),
});
