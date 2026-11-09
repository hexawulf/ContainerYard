import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(1, "New password is required"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const userRoleSchema = z.enum(["ADMIN", "VIEWER"]);

export const createUserSchema = z.object({
  email: z.string().trim().email("Valid email is required").max(254, "Email must be at most 254 characters"),
  role: userRoleSchema,
  password: z.string().min(1, "Password is required"),
});

export const updateUserRoleSchema = z.object({
  role: userRoleSchema,
});

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(1, "New password is required"),
});
