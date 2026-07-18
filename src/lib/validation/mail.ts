import { z } from "zod";

// Zod schemas for the mail accounts API (plan §4) — single source of input
// validation, shared by the /api/mail/accounts route handlers. Messages are
// Russian because they surface directly as fieldErrors in the settings dialog.

// Bare hostname or IP: dot-separated labels of letters/digits/hyphens —
// no scheme, no slashes, no spaces, no ports (SSRF guard, plan §6).
const HOSTNAME_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

const hostSchema = z
  .string()
  .trim()
  .min(1, "Укажите адрес сервера")
  .max(253, "Адрес сервера слишком длинный")
  .regex(HOSTNAME_REGEX, "Укажите корректное имя хоста или IP-адрес");

const portSchema = z
  .number("Порт должен быть числом")
  .int("Порт должен быть целым числом")
  .min(1, "Порт должен быть в диапазоне 1–65535")
  .max(65535, "Порт должен быть в диапазоне 1–65535");

const securitySchema = z.enum(["SSL", "STARTTLS"], {
  message: "Допустимые значения защиты: SSL или STARTTLS",
});

export const createMailAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Название обязательно")
    .max(100, "Название не должно превышать 100 символов"),
  email: z.email("Укажите корректный e-mail"),
  imapHost: hostSchema,
  imapPort: portSchema.default(993),
  imapSecurity: securitySchema.default("SSL"),
  smtpHost: hostSchema,
  smtpPort: portSchema.default(465),
  smtpSecurity: securitySchema.default("SSL"),
  username: z.string().trim().min(1, "Логин обязателен"),
  password: z.string().min(1, "Пароль обязателен"),
  mode: z.enum(["MOCK", "REAL"]).default("REAL"),
});

export type CreateMailAccountInput = z.infer<typeof createMailAccountSchema>;

// PATCH payload: every field optional; empty/absent password means "keep the
// stored one" (blank-means-keep, plan §6), so no min(1) on password here.
export const updateMailAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Название обязательно")
    .max(100, "Название не должно превышать 100 символов")
    .optional(),
  email: z.email("Укажите корректный e-mail").optional(),
  imapHost: hostSchema.optional(),
  imapPort: portSchema.optional(),
  imapSecurity: securitySchema.optional(),
  smtpHost: hostSchema.optional(),
  smtpPort: portSchema.optional(),
  smtpSecurity: securitySchema.optional(),
  username: z.string().trim().min(1, "Логин обязателен").optional(),
  password: z.string().optional(),
});

export type UpdateMailAccountInput = z.infer<typeof updateMailAccountSchema>;

// POST /api/mail/accounts/test takes the same raw connection input as create
// (nothing is persisted — a transient driver is built from it).
export const testMailAccountSchema = createMailAccountSchema;

export type TestMailAccountInput = z.infer<typeof testMailAccountSchema>;

// --- Mail item actions + send (plan §4, Phase 6) ---

export const patchMailItemSchema = z.object({
  isRead: z.boolean("isRead должен быть булевым значением"),
});

export type PatchMailItemInput = z.infer<typeof patchMailItemSchema>;

export const moveMailItemSchema = z.object({
  targetFolderId: z.string().min(1, "Укажите папку назначения"),
});

export type MoveMailItemInput = z.infer<typeof moveMailItemSchema>;

const recipientListSchema = z
  .array(z.email("Укажите корректный e-mail"))
  .max(50, "Не более 50 адресов");

export const sendMailSchema = z.object({
  accountId: z.string().min(1, "Укажите аккаунт"),
  to: recipientListSchema.min(1, "Укажите хотя бы одного получателя"),
  cc: recipientListSchema.default([]),
  bcc: recipientListSchema.default([]),
  subject: z
    .string()
    .min(1, "Тема обязательна")
    .max(500, "Тема не должна превышать 500 символов"),
  body: z
    .string()
    .min(1, "Текст письма обязателен")
    .max(500_000, "Текст письма не должен превышать 500 000 символов"),
  inReplyToId: z.string().optional(),
});

export type SendMailInput = z.infer<typeof sendMailSchema>;
