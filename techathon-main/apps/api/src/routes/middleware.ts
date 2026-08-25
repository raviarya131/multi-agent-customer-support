import express from "express";
import { accountForToken, type Account, type Role } from "../auth";
import { ticketExists, getTicketCustomer } from "../db";
import { getAccountByCustomerId } from "../auth";
import { userName } from "../users";

export interface AuthedRequest extends express.Request {
  account?: Account | null;
}

export function tokenFromReq(req: express.Request): string | null {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim() || null;
  const q = (req.query?.token as string) || "";
  return q.trim() || null;
}

export function authMiddleware(req: AuthedRequest, _res: express.Response, next: express.NextFunction) {
  req.account = accountForToken(tokenFromReq(req));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    const account = req.account;
    if (!account) return res.status(401).json({ error: "Not signed in" });
    if (roles.length && !roles.includes(account.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

export function displayCustomerName(customerId: string | null): string {
  if (!customerId) return "Guest";
  return getAccountByCustomerId(customerId)?.name ?? userName(customerId);
}

export function canAccessTicket(ticketId: string, customerId: string | null): boolean {
  if (!ticketExists(ticketId)) return false;
  return getTicketCustomer(ticketId) === customerId;
}
