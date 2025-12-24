/**
 * Simple authentication utility
 * Uses JWT tokens and password hashing
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync("admin", 10); // Default: 'admin'

export interface AuthUser {
  id: string;
  email: string;
}

export async function verifyPassword(password: string): Promise<boolean> {
  // Check against environment variable hash or default
  const hash = process.env.ADMIN_PASSWORD_HASH || PASSWORD_HASH;
  return bcrypt.compare(password, hash);
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}










