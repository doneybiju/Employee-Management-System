// backend/src/routes/logs.ts
import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authorize } from '../middleware/authorize';
import ensureAuthenticated from '../middleware/ensureAuthenticated';

const router = Router();

// GET /api/logs/user-creation
// Returns user creation logs with pagination
router.get(
  '/user-creation',
  ensureAuthenticated as any,
  ...authorize('super_admin'),
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
      const offset = (page - 1) * limit;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          select: {
            id: true,
            firstName: true,
            surname: true,
            companyEmail: true,
            empId: true,
            role: true,
            empType: true,
            createdBy: true,
            createdByRole: true,
            createdByEmpType: true,
            createdAt: true,
            creationIp: true,
            creationUserAgent: true,
            creationMethod: true,
          },
        }),
        prisma.user.count(),
      ]);

      // Get creator names
      const creatorIds = Array.from(new Set(users.map(u => u.createdBy).filter(Boolean))) as number[];
      const creators = creatorIds.length
        ? await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, firstName: true, surname: true, companyEmail: true },
          })
        : [];

      const creatorMap = new Map(
        creators.map(c => [c.id, `${c.firstName} ${c.surname}`.trim() || c.companyEmail])
      );

      const enrichedLogs = users.map(user => ({
        id: user.id,
        userId: user.id,
        firstName: user.firstName,
        surname: user.surname,
        companyEmail: user.companyEmail,
        empId: user.empId,
        role: user.role,
        empType: user.empType,
        createdBy: user.createdBy,
        createdByName: user.createdBy ? creatorMap.get(user.createdBy) || 'Unknown' : 'System',
        createdByRole: user.createdByRole,
        createdByEmpType: user.createdByEmpType,
        createdAt: user.createdAt,
        ip: user.creationIp,
        userAgent: user.creationUserAgent,
        creationMethod: user.creationMethod || 'unknown',
      }));

      return res.json({
        logs: enrichedLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to fetch user creation logs' });
    }
  }
);

// GET /api/logs/user-updates
// Returns user update logs with pagination
router.get(
  '/user-updates',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
      const offset = (page - 1) * limit;
      const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : undefined;
      const internId = req.query.internId ? String(req.query.internId) : undefined;

      const where: any = {};
      if (userId) where.userId = userId;
      if (internId) where.internId = internId;

      const [logs, total] = await Promise.all([
        prisma.userUpdateLog.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: limit,
          skip: offset,
          select: {
            id: true,
            userId: true,
            internId: true,
            updatedBy: true,
            updatedAt: true,
            fieldName: true,
            oldValue: true,
            newValue: true,
            ip: true,
            userAgent: true,
          },
        }),
        prisma.userUpdateLog.count({ where }),
      ]);

      // Get user info (both updated users and updaters)
      const userIds = Array.from(new Set([
        ...logs.map(l => l.userId).filter(Boolean),
        ...logs.map(l => l.updatedBy),
      ])) as number[];
      
      const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, surname: true, companyEmail: true, role: true, empType: true },
          })
        : [];

      const userMap = new Map(
        users.map(u => [u.id, {
          name: `${u.firstName} ${u.surname}`.trim() || u.companyEmail,
          email: u.companyEmail,
          role: u.role,
          empType: u.empType,
        }])
      );

      // Get intern names for internId
      const internIds = Array.from(new Set(logs.map(l => l.internId).filter(Boolean))) as string[];
      const interns = internIds.length
        ? await prisma.internDetail.findMany({
            where: { internId: { in: internIds } },
            select: { internId: true, name: true },
          })
        : [];
      
      const internMap = new Map(interns.map(i => [i.internId, i.name]));

      const enrichedLogs = logs.map(log => ({
        ...log,
        updatedByName: userMap.get(log.updatedBy)?.name || 'Unknown',
        updatedByRole: userMap.get(log.updatedBy)?.role || null,
        updatedByEmpType: userMap.get(log.updatedBy)?.empType || null,
        userName: log.userId ? userMap.get(log.userId)?.name : null,
        internName: log.internId ? internMap.get(log.internId) : null,
      }));

      return res.json({
        logs: enrichedLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to fetch user update logs' });
    }
  }
);

// GET /api/logs/documents
// Returns document action logs with pagination
router.get(
  '/documents',
  ensureAuthenticated as any,
  ...authorize('hr', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
      const offset = (page - 1) * limit;
      const internId = req.query.internId ? String(req.query.internId) : undefined;
      const action = req.query.action ? String(req.query.action) : undefined;

      const where: any = {};
      if (internId) where.internId = internId;
      if (action && (action === 'upload' || action === 'delete')) where.action = action;

      const [logs, total] = await Promise.all([
        prisma.documentLog.findMany({
          where,
          orderBy: { performedAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            performer: {
              select: {
                id: true,
                firstName: true,
                surname: true,
                companyEmail: true,
                role: true,
                empType: true,
              },
            },
          },
        }),
        prisma.documentLog.count({ where }),
      ]);

      const enrichedLogs = logs.map(log => ({
        id: log.id,
        action: log.action,
        documentType: log.documentType,
        fileName: log.fileName,
        fileId: log.fileId,
        internId: log.internId,
        internName: log.internName,
        userId: log.userId,
        performedBy: log.performedBy,
        performedByName: `${log.performer.firstName} ${log.performer.surname}`.trim() || log.performer.companyEmail,
        performedByRole: log.performer.role,
        performedByEmpType: log.performer.empType,
        performedAt: log.performedAt,
        ip: log.ip,
        userAgent: log.userAgent,
        expiryDate: log.expiryDate,
      }));

      return res.json({
        logs: enrichedLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to fetch document logs' });
    }
  }
);

export default router;
