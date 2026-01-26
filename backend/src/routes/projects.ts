// backend/src/routes/projects.ts
import { Router, Request, Response } from 'express';
import ensureAuthenticated from '../middleware/ensureAuthenticated';
import prisma from '../prisma';
import { Prisma } from '@prisma/client';
import { sendProjectAddedNotice, sendProjectStatusNotice, sendProjectRemovedNotice, sendProjectDeletedNotice } from '../lib/mailer';

const router = Router();

// helper: who can create projects (NOT per-project permission)
async function canCreateProject(uid: number) {
  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true, empType: true },
  });
  return !!u && (u.role === 'super_admin' || u.empType === 'team_lead');
}

// helper: project is in scope for this user (creator OR member)
async function isProjectInScope(projectId: number, uid: number) {
  const p = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ createdById: uid }, { members: { some: { userId: uid } } }],
    },
    select: { id: true },
  });
  return !!p;
}

// helper: who can manage a specific project (edit/delete/add members/create tasks)
async function canManageProject(projectId: number, uid: number) {
  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true, empType: true },
  });
  if (!u) return false;
  if (u.role === 'super_admin') return true;
  if (u.empType === 'team_lead') return await isProjectInScope(projectId, uid);
  return false;
}

// helper: task-level permission (assignee OR project member OR scoped team lead OR super_admin)
async function isProjectMemberOrAdmin(projectId: number, uid: number) {
  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true, empType: true },
  });
  if (!u) return false;

  if (u.role === 'super_admin') return true;

  // team_lead is NOT global admin anymore; only within their projects
  if (u.empType === 'team_lead') return await isProjectInScope(projectId, uid);

  // everyone else: must be an explicit project member
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: uid },
    select: { id: true },
  });
  return !!member;
}

async function canTouchTask(uid: number, taskId: number) {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true } } },
  });
  if (!t) return { allowed: false as const, task: null as any };

  const allowed =
    t.assigneeId === uid ||
    (await isProjectMemberOrAdmin(t.projectId, uid));

  return { allowed, task: t };
}




// GET /api/projects/member-candidates?q=...
router.get('/member-candidates', ensureAuthenticated, async (req, res) => {
  const uid = Number((req as any).user?.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const me = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true, empType: true },
  });
  if (!(me && (me.role === 'super_admin' || me.empType === 'team_lead'))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const q = String(req.query.q || '').trim();
  const insensitive = 'insensitive' as const;

  // text search (optional)
  const search: Prisma.UserWhereInput = q
    ? {
        OR: [
          { companyEmail: { contains: q, mode: insensitive } },
          { firstName:    { contains: q, mode: insensitive } },
          { surname:      { contains: q, mode: insensitive } },
          { empId:        { contains: q, mode: insensitive } },
        ],
      }
    : {};

  // only HR/SA/team_lead or interns with an Active internship
  const activeish: Prisma.UserWhereInput = {
    OR: [
      { role: { in: ['hr', 'super_admin'] } },
      { empType: 'team_lead' },
      {
        employeeDetails: {
          some: {
            internships: { some: { status: 'Active' } }, // enum value from schema
          },
        },
      },
    ],
  };

  const rows = await prisma.user.findMany({
    where: { AND: [search, activeish] },
    take: 50,
    orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, surname: true, companyEmail: true },
  });

  res.json(
    rows.map(u => ({
      id: u.id,
      name: `${u.firstName ?? ''} ${u.surname ?? ''}`.trim() || u.companyEmail,
      email: u.companyEmail,
    }))
  );
});




// quick permission probe for the UI
router.get('/permissions', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const me = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true, empType: true },
  });
  const canCreateFlag = await canCreateProject(uid);
  const canManage = canCreateFlag; // only super_admin or team_lead
  const viewOnly = me?.role === 'hr' && !canManage;
  res.json({ canCreate: canCreateFlag, canManage, viewOnly });
});

// create project
router.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  if (!(await canCreateProject(uid))) return res.status(403).json({ error: 'forbidden' });

  const { title, description, dueDate, status, memberIds } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const project = await prisma.project.create({
  data: {
    title: String(title).trim(),
    description: description ? String(description) : null,
    status: status && ['NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED'].includes(status)
      ? status
      : 'NOT_STARTED',
    dueDate: dueDate ? new Date(dueDate) : null,
    createdById: uid,
    members: {
      create: [
        { userId: uid },
        ...(Array.isArray(memberIds) ? [...new Set(memberIds)]
          .filter((id) => id && id !== uid)
          .map((id) => ({ userId: Number(id) })) : []),
      ],
    },
  },
  include: {
    members: { include: { user: { select: { id: true, firstName: true, surname: true, companyEmail: true } } } },
    tasks:   { select: { id: true, status: true } },
  },
});

// fire-and-forget emails
try {
  const teamEmails = Array.from(
    new Set(
      project.members
        .map(m => m.user.companyEmail)
        .filter((e): e is string => !!e && e.includes('@'))
    )
  );

  const toSet = new Set(teamEmails);

  // Optional: don’t email the creator
  const creator = await prisma.user.findUnique({
    where: { id: uid },
    select: { companyEmail: true },
  });
  if (creator?.companyEmail) toSet.delete(creator.companyEmail);

  const promises = Array.from(toSet).map(to =>
    sendProjectAddedNotice({
      to,
      projectTitle: project.title,
      projectId: project.id,
      teamEmails, // ✅ matches mailer signature
    })
  );

  Promise.allSettled(promises).catch(() => {});
} catch (e) {
  console.error('[projects:create] added-email failed', e);
}


res.json(project);

});

// list projects visible to me
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const me = await prisma.user.findUnique({
  where: { id: uid },
  select: { role: true, empType: true },
});

  const projects = await prisma.project.findMany({
    where: (me?.role === 'super_admin' || me?.role === 'hr')
  ? {}
  : { OR: [{ members: { some: { userId: uid } } }, { createdById: uid }] },

    orderBy: { updatedAt: 'desc' },
    include: {
      tasks:   { select: { status: true } },
      members: { include: { user: { select: { id: true, firstName: true, surname: true } } } },
    },
  });


  const shaped = projects.map((p) => {
  const total = p.tasks.length;
  const done  = p.tasks.filter(t => t.status === 'COMPLETED').length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status, // raw status from DB (e.g., ON_HOLD)
    dueDate: p.dueDate,
    updatedAt: p.updatedAt,
    progress,
    members: p.members.map(m => ({
      id: m.user.id,
      name: `${m.user.firstName ?? ''} ${m.user.surname ?? ''}`.trim(),
    })),
    // ⬇️ include lite tasks for frontend deriveProjectStatus()
    tasks: p.tasks.map(t => ({ status: t.status })),
  };
});


  res.json(shaped);
});

// project detail
router.get('/:id', ensureAuthenticated, async (req, res) => {
  const uid = Number((req as any).user?.id);
  const id = Number(req.params.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const me = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true, empType: true },
    });

    const memberOrAdmin = await isProjectMemberOrAdmin(id, uid);
    const hrViewOnly = me?.role === 'hr';
    if (!(memberOrAdmin || hrViewOnly)) return res.status(403).json({ error: 'forbidden' });

  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, firstName: true, surname: true, companyEmail: true } },
        },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, firstName: true, surname: true } },
          checklistItems: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(p);
});


// delete project (super_admin or team lead only)
// cascades will remove members, tasks, and checklist items via Prisma schema
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const id = Number(req.params.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  // Load current user (for deletedByName + permission)
  const me = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true, empType: true, firstName: true, surname: true, companyEmail: true },
  });
  if (!me) return res.status(401).json({ error: 'unauthorized' });

  // Only super_admin or team_lead can delete, but team_lead must be member/creator
  if (!(me.role === 'super_admin' || me.empType === 'team_lead')) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Load project + members BEFORE deleting
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      createdById: true,
      members: { select: { user: { select: { id: true, companyEmail: true } } } },
    },
  });
  if (!project) return res.status(404).json({ error: 'not_found' });

  if (me.role !== 'super_admin') {
    const isMember = project.members.some(m => m.user.id === uid);
    const isCreator = project.createdById === uid;
    if (!isMember && !isCreator) return res.status(403).json({ error: 'forbidden' });
  }

  try {
    await prisma.project.delete({ where: { id } });

    // Notify members (best-effort)
    const deletedByName = `${me.firstName ?? ''} ${me.surname ?? ''}`.trim() || 'Admin';
    const toSet = new Set(
      project.members
        .map(m => m.user.companyEmail)
        .filter((e): e is string => !!e && e.includes('@'))
    );

    // Optional: don’t email the deleter
    if (me.companyEmail) toSet.delete(me.companyEmail);

    const promises = Array.from(toSet).map(to =>
      sendProjectDeletedNotice({ to, projectTitle: project.title, deletedByName })
    );
    Promise.allSettled(promises).catch(() => {});

    return res.status(204).end();
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    console.error('delete project failed', e);
    return res.status(500).json({ error: 'delete_failed' });
  }
});




// update project (title, description, dueDate, status)
router.patch('/:id', ensureAuthenticated, async (req, res) => {
  const uid = Number((req as any).user?.id);
  const id  = Number(req.params.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  if (!(await canManageProject(id, uid))) return res.status(403).json({ error: 'forbidden' });

  const { title, description, dueDate, status } = req.body ?? {};
  const data: any = {};
  if (typeof title === 'string')        data.title = title.trim();
  if (typeof description === 'string')  data.description = description.trim() || null;
  if (dueDate !== undefined)            data.dueDate = dueDate ? new Date(dueDate) : null;
  if (status && ['NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED'].includes(status)) data.status = status;

  // fetch current to compare status
  const before = await prisma.project.findUnique({
    where: { id },
    select: { id: true, title: true, status: true },
  });
  if (!before) return res.status(404).json({ error: 'not_found' });

  const updated = await prisma.project.update({
    where: { id },
    data,
    select: { id: true, title: true, description: true, dueDate: true, status: true },
  });

  // if status changed, email all members
  if (data.status && data.status !== before.status) {
    try {
      const members = await prisma.projectMember.findMany({
        where: { projectId: id },
        include: { user: { select: { companyEmail: true } } },
      });
      const toSet = new Set(members.map(m => m.user.companyEmail).filter(Boolean));
      const promises = Array.from(toSet).map(to =>
        sendProjectStatusNotice({
          to,
          projectTitle: updated.title,
          newStatus: updated.status as any,
          projectId: updated.id,
        })
      );
      Promise.allSettled(promises).catch(() => {});
    } catch (_) {}
  }

  res.json(updated);
});





// add members
router.post('/:id/members', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const id = Number(req.params.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  if (!(await canManageProject(id, uid))) return res.status(403).json({ error: 'forbidden' });

  const ids: number[] = Array.isArray(req.body?.userIds) ? req.body.userIds.map(Number) : [];
  const toCreate = [...new Set(ids)].map(userId => ({ projectId: id, userId }));

  // ignore duplicates via upsert pattern
  await prisma.$transaction(
    toCreate.map(row =>
      prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: row.projectId, userId: row.userId } },
        create: row,
        update: {},
      })
    )
  );

  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    include: { user: { select: { id: true, firstName: true, surname: true } } },
    orderBy: { id: 'asc' },
  });

  // after upserts and before returning
try {
  const newIds = [...new Set(ids)].map(Number).filter(Boolean);

  if (newIds.length) {
    const [proj, users, allMembers] = await Promise.all([
      prisma.project.findUnique({ where: { id }, select: { id: true, title: true } }),
      prisma.user.findMany({ where: { id: { in: newIds } }, select: { companyEmail: true } }),
      prisma.projectMember.findMany({
        where: { projectId: id },
        include: { user: { select: { companyEmail: true } } },
      }),
    ]);

    if (proj) {
      const teamEmails = Array.from(
        new Set(
          allMembers
            .map(m => m.user.companyEmail)
            .filter((e): e is string => !!e && e.includes('@'))
        )
      );

      const promises = users
        .map(u => u.companyEmail)
        .filter((e): e is string => !!e && e.includes('@'))
        .map(to =>
          sendProjectAddedNotice({
            to,
            projectTitle: proj.title,
            projectId: proj.id,
            teamEmails, // ✅ correct property
          })
        );

      Promise.allSettled(promises).catch(() => {});
    }
  }
} catch (e) {
  console.error('[projects:add-members] added-email failed', e);
}



  res.json({ ok: true, members });
});

router.delete('/:projectId/members/:userId', ensureAuthenticated, async (req, res) => {
  const uid = Number((req as any).user?.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const projectId = Number(req.params.projectId);
  const userId = Number(req.params.userId);
  const force = String(req.query.force || '') === '1';

  if (!(await canManageProject(projectId, uid))) return res.status(403).json({ error: 'forbidden' });
  if (!projectId || !userId) return res.status(400).json({ error: 'bad_params' });

  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    include: { user: { select: { companyEmail: true } }, project: { select: { id: true, title: true } } }
  });
  if (!membership) return res.status(404).json({ error: 'not_found' });

  const assigned = await prisma.task.findMany({
    where: { projectId, assigneeId: userId },
    select: { id: true }
  });

  if (assigned.length && !force) {
    return res.status(409).json({ error: 'user_has_assigned_tasks', count: assigned.length });
  }

  await prisma.$transaction(async (tx) => {
    if (assigned.length && force) {
      await tx.task.updateMany({ where: { projectId, assigneeId: userId }, data: { assigneeId: null } });
    }
    await tx.projectMember.deleteMany({ where: { projectId, userId } });
  });

  try {
    if (membership.user.companyEmail) {
      await sendProjectRemovedNotice({
        to: membership.user.companyEmail,
        projectTitle: membership.project.title,
        projectId: membership.project.id,
      });
    }
  } catch {}

  return res.status(204).send();
});


// create task
router.post('/:id/tasks', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const id = Number(req.params.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  if (!(await canManageProject(id, uid))) return res.status(403).json({ error: 'forbidden' });

  const {
    title,
    description,
    assigneeId,
    dueDate,
    status,
    checklistEnabled,
    checklistItems,       // ← NEW
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const items: string[] = Array.isArray(checklistItems)
    ? checklistItems.map((s: any) => String(s || '').trim()).filter(Boolean)
    : [];

  const task = await prisma.task.create({
    data: {
      projectId: id,
      title: String(title),
      description: description ? String(description) : null,
      assigneeId: assigneeId ? Number(assigneeId) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      status: status && ['NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED'].includes(status)
        ? status
        : 'NOT_STARTED',
      checklistEnabled: !!checklistEnabled,
      ...(items.length
        ? { checklistItems: { create: items.map((t, idx) => ({ title: t, sort: idx })) } }
        : {}),
    },
  });

  res.json(task);
});


// update task status (assignee or admin/lead)
router.patch('/tasks/:taskId/status', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const taskId = Number(req.params.taskId);
  const { status } = req.body || {};
  if (!['NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }

  const t = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true } } },
  });
  if (!t) return res.status(404).json({ error: 'not_found' });

  const allowed = t.assigneeId === uid || (await isProjectMemberOrAdmin(t.projectId, uid));
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  const updated = await prisma.task.update({ where: { id: taskId }, data: { status } });
  res.json(updated);
});


// PATCH /api/projects/tasks/:taskId/checklist-enabled  { checklistEnabled: boolean }
router.patch('/tasks/:taskId/checklist-enabled', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const taskId = Number(req.params.taskId);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const { allowed } = await canTouchTask(uid, taskId);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  const { checklistEnabled } = req.body ?? {};
  if (typeof checklistEnabled !== 'boolean') return res.status(400).json({ error: 'checklistEnabled boolean required' });

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { checklistEnabled },
    include: { checklistItems: true, assignee: { select: { id: true, firstName: true, surname: true } } },
  });
  res.json(updated);
});

// POST /api/projects/tasks/:taskId/checklist  { title: string }
router.post('/tasks/:taskId/checklist', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const taskId = Number(req.params.taskId);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const { allowed } = await canTouchTask(uid, taskId);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title_required' });

  const sort = await prisma.taskChecklistItem.count({ where: { taskId } });
  const item = await prisma.taskChecklistItem.create({ data: { taskId, title, sort } });
  res.json(item);
});

// PATCH /api/projects/tasks/:taskId/checklist/:itemId  { done?, title?, sort? }
router.patch('/tasks/:taskId/checklist/:itemId', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const taskId = Number(req.params.taskId);
  const itemId = Number(req.params.itemId);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const { allowed } = await canTouchTask(uid, taskId);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  // ensure the item belongs to the task
  const exists = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId } });
  if (!exists) return res.status(404).json({ error: 'not_found' });

  const { done, title, sort } = req.body ?? {};
  const data: any = {};
  if (typeof done === 'boolean') data.done = done;
  if (typeof title === 'string')  data.title = title.trim();
  if (Number.isFinite(sort))      data.sort  = Number(sort);

  const item = await prisma.taskChecklistItem.update({ where: { id: itemId }, data });
  res.json(item);
});


// DELETE /api/projects/tasks/:taskId
router.delete('/tasks/:taskId', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const taskId = Number(req.params.taskId);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const { allowed, task } = await canTouchTask(uid, taskId);
  if (!allowed || !task) return res.status(403).json({ error: 'forbidden' });

  await prisma.task.delete({ where: { id: taskId } }); // checklist cascades via schema
  res.json({ ok: true });
});


// DELETE /api/projects/tasks/:taskId/checklist/:itemId
router.delete('/tasks/:taskId/checklist/:itemId', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const taskId = Number(req.params.taskId);
  const itemId = Number(req.params.itemId);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const { allowed } = await canTouchTask(uid, taskId);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  const exists = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId } });
  if (!exists) return res.status(404).json({ error: 'not_found' });

  await prisma.taskChecklistItem.delete({ where: { id: itemId } });
  res.json({ ok: true });
});



// my tasks
router.get('/me/tasks', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const tasks = await prisma.task.findMany({
    where: { assigneeId: uid },
    include: { project: { select: { id: true, title: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(tasks);
});


// PATCH /api/projects/tasks/:taskId  { title?, description?, dueDate?, assigneeId?, status?, checklistEnabled? }
router.patch('/tasks/:taskId', ensureAuthenticated, async (req: Request, res: Response) => {
  const uid = Number((req as any).user?.id);
  const taskId = Number(req.params.taskId);
  if (!uid) return res.status(401).json({ error: 'unauthorized' });

  const { allowed } = await canTouchTask(uid, taskId);
  if (!allowed) return res.status(403).json({ error: 'forbidden' });

  const { title, description, dueDate, assigneeId, status, checklistEnabled } = req.body ?? {};
  const data: any = {};

  if (typeof title === 'string')        data.title = title.trim();
  if (typeof description === 'string')  data.description = description.trim();
  if (dueDate != null)                  data.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined)         data.assigneeId = assigneeId ? Number(assigneeId) : null;
  if (typeof checklistEnabled === 'boolean') data.checklistEnabled = checklistEnabled;
  if (status && ['NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED'].includes(status)) data.status = status;

  const updated = await prisma.task.update({
    where: { id: taskId },
    data,
    include: {
      assignee: { select: { id: true, firstName: true, surname: true } },
      checklistItems: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
    },
  });

  res.json(updated);
});


export default router;
