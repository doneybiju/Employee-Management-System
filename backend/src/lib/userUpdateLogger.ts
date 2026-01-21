import prisma from '../prisma';
import type { Request } from 'express';

interface LogUpdateOptions {
  userId?: number | null;
  internId?: string | null;
  updatedBy: number;
  fieldName: string;
  oldValue: any;
  newValue: any;
  req: Request;
}

/**
 * Helper to log user field updates
 */
export async function logUserUpdate(options: LogUpdateOptions) {
  const { userId, internId, updatedBy, fieldName, oldValue, newValue, req } = options;

  // Skip if values are the same
  if (oldValue === newValue) return;
  
  // Convert to strings for storage
  const oldStr = oldValue != null ? String(oldValue) : null;
  const newStr = newValue != null ? String(newValue) : null;

  // Skip if string values are the same
  if (oldStr === newStr) return;

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
    || (req.headers['x-real-ip'] as string) 
    || req.socket?.remoteAddress 
    || null;
  const userAgent = req.headers['user-agent'] || null;

  await prisma.userUpdateLog.create({
    data: {
      userId,
      internId,
      updatedBy,
      fieldName,
      oldValue: oldStr,
      newValue: newStr,
      ip: ip?.substring(0, 45) || null,
      userAgent: userAgent?.substring(0, 255) || null,
    },
  });
}

/**
 * Log multiple field updates in a transaction
 */
export async function logUserUpdates(
  updates: Omit<LogUpdateOptions, 'req'>[],
  req: Request
) {
  const logsToCreate = [];

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
    || (req.headers['x-real-ip'] as string) 
    || req.socket?.remoteAddress 
    || null;
  const userAgent = req.headers['user-agent'] || null;

  for (const update of updates) {
    // Skip if values are the same
    if (update.oldValue === update.newValue) continue;
    
    const oldStr = update.oldValue != null ? String(update.oldValue) : null;
    const newStr = update.newValue != null ? String(update.newValue) : null;

    if (oldStr === newStr) continue;

    logsToCreate.push({
      userId: update.userId,
      internId: update.internId,
      updatedBy: update.updatedBy,
      fieldName: update.fieldName,
      oldValue: oldStr,
      newValue: newStr,
      ip: ip?.substring(0, 45) || null,
      userAgent: userAgent?.substring(0, 255) || null,
    });
  }

  if (logsToCreate.length > 0) {
    await prisma.userUpdateLog.createMany({
      data: logsToCreate,
    });
  }
}
