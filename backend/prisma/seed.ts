// prisma/seed.ts
import { PrismaClient, DocumentType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---- change these if you want different emails/passwords ----
const DOMAIN = 'extramus.eu';
const SUPER_EMAIL = `superadmin@${DOMAIN}`;
const SUPER_PASS  = 'SuperSecret123';
const HR_EMAIL    = `hr@${DOMAIN}`;
const HR_PASS     = 'HrSecret123';
// ------------------------------------------------------------

async function seedDepartmentsAndPositions() {
  const departments = [
    'Digital Marketing',
    'Human Resource Management',
    'Business & Data Analyst',
    'Project Management',
    'Languages',
    'IT',
    'Urban Design',
    'Law',
  ];

  const posByDept: Record<string, string[]> = {
    'Digital Marketing': ['SEO Intern', 'Content Intern'],
    'Human Resource Management': ['HR Assistant', 'Recruitment Intern'],
    'Business & Data Analyst': ['Data Intern', 'Business Analyst Intern'],
    'Project Management': ['PM Assistant', 'Scrum Intern'],
    Languages: ['EN Tutor', 'IT Tutor'],
    IT: ['Frontend Intern', 'Backend Intern'],
    'Urban Design': ['CAD Intern'],
    Law: ['Paralegal Intern'],
  };

  for (const name of departments) {
    await prisma.department.upsert({
      where: { departmentName: name },
      update: {},
      create: { departmentName: name },
    });
  }

  for (const [deptName, positions] of Object.entries(posByDept)) {
    const dept = await prisma.department.findUnique({ where: { departmentName: deptName } });
    if (!dept) continue;

    for (const p of positions) {
      await prisma.position.upsert({
        where: { name_departmentId: { name: p, departmentId: dept.id } },
        update: {},
        create: { name: p, departmentId: dept.id },
      });
    }
  }

  console.log('✅ Departments & positions seeded');
}

async function seedUsers() {
  const superHash = await bcrypt.hash(SUPER_PASS, 10);
  const hrHash    = await bcrypt.hash(HR_PASS, 10);

// Super Admin
await prisma.user.upsert({
  where: { companyEmail: 'super.admin@extramus.eu' },        // unique
  update: {},
  create: {
    firstName: 'Super',
    surname: 'Admin',
    companyEmail: 'super.admin@extramus.eu',
    password: superHash,
    role: 'super_admin',
    empId: 'SA001',                                          // unique
    mustChangePassword: true,
  },
});

// HR
await prisma.user.upsert({
  where: { companyEmail: 'hr@extramus.eu' },                 // unique
  update: {},
  create: {
    firstName: 'HR',
    surname: 'Manager',
    companyEmail: 'hr@extramus.eu',
    password: hrHash,
    role: 'hr',
    empId: 'HR001',                                          // different from SA001
    mustChangePassword: true,
  },
});


  await prisma.user.updateMany({
  where: { role: { in: ['hr','super_admin'] } }, // adjust as needed
  data: { mustChangePassword: false },
});

  console.log('✅ Users seeded:', { SUPER_EMAIL, HR_EMAIL });
}

async function ensureEmptySmtpRow() {
  await prisma.smtpSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      host: '',
      port: 587,
      encryption: 'STARTTLS' as any,
      user: '',
      pass: '',
      fromName: '',
      fromEmail: '',
      updatedBy: 1,
    },
  });
}

async function seedDocumentExpiryPolicies() {
  // Default policy for Passport/ID expiry reminders
  await prisma.documentExpiryPolicy.upsert({
    where: { documentType: DocumentType.ID_PASSPORT },
    update: {
      enabled: true,
      daysBefore: 30,
      notifyUser: true,
      notifyHr: true,
      repeatEveryDays: 7, // set null if you don't want repeats
    },
    create: {
      documentType: DocumentType.ID_PASSPORT,
      enabled: true,
      daysBefore: 30,
      notifyUser: true,
      notifyHr: true,
      repeatEveryDays: 7,
    },
  });

  console.log('✅ Document expiry policies seeded');
}



async function main() {
  await seedDepartmentsAndPositions();
  await seedUsers();
  await ensureEmptySmtpRow();
  await seedDocumentExpiryPolicies();
}





main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
