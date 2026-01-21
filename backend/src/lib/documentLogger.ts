import prisma from '../prisma';
import type { Request } from 'express';

interface LogDocumentActionOptions {
  action: 'upload' | 'delete' | 'replace';
  documentType: string;
  fileName: string;
  fileId?: string | null;
  internId: string;
  internName?: string | null;
  userId?: number | null;
  performedBy: number;
  expiryDate?: Date | null;
  req: Request;
}

/**
 * Log document upload or delete action
 */
export async function logDocumentAction(options: LogDocumentActionOptions) {
  const {
    action,
    documentType,
    fileName,
    fileId,
    internId,
    internName,
    userId,
    performedBy,
    expiryDate,
    req,
  } = options;

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
    || (req.headers['x-real-ip'] as string) 
    || req.socket?.remoteAddress 
    || null;
  const userAgent = req.headers['user-agent'] || null;

  await prisma.documentLog.create({
    data: {
      action,
      documentType,
      fileName,
      fileId: fileId || null,
      internId,
      internName: internName || null,
      userId: userId || null,
      performedBy,
      expiryDate: expiryDate || null,
      ip: ip?.substring(0, 45) || null,
      userAgent: userAgent?.substring(0, 255) || null,
    },
  });
}
