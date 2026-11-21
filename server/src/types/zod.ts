import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1, "Password is required").max(1024, "Password must be at most 1024 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(1024, "Password must be at most 1024 characters"),
  newPassword: z.string().min(1, "New password is required").max(1024, "Password must be at most 1024 characters"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const userRoleSchema = z.enum(["ADMIN", "VIEWER"]);

export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Valid email is required")
    .max(254, "Email must be at most 254 characters"),
  role: userRoleSchema,
  password: z.string().min(1, "Password is required").max(1024, "Password must be at most 1024 characters"),
});

export const updateUserRoleSchema = z.object({
  role: userRoleSchema,
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(1, "New password is required").max(1024, "Password must be at most 1024 characters"),
});
