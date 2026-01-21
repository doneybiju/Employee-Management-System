// backend/src/lib/deprovision.test.ts
import prisma from '../prisma';
import {
  runDocumentDeletionCycle,
  deleteDocsForIntern,
  deleteInternProfilePicture,
  deleteUserAvatarByUserId,
} from './deprovision';
import { deleteDriveFileByAny } from '../google/deletion';

// Mock the google deletion module
jest.mock('../google/deletion', () => ({
  deleteDriveFileByAny: jest.fn().mockResolvedValue(true),
}));

describe('Deprovisioning and Document Deletion', () => {
  beforeEach(async () => {
    // Clear the database before each test
    await prisma.internDocument.deleteMany({});
    await prisma.internshipInfo.deleteMany({});
    await prisma.internDetail.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.documentDeletionPolicy.deleteMany({});
    (deleteDriveFileByAny as jest.Mock).mockClear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should delete documents in bulk', async () => {
    // Create a user and intern detail
    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        surname: 'User',
        companyEmail: 'test.user@example.com',
        password: 'password',
        role: 'intern',
        empType: 'intern',
        empId: '12345',
      },
    });

    const internDetail = await prisma.internDetail.create({
      data: {
        name: 'Test Intern',
        email: 'test.intern@example.com',
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    });

    // Create internship info with an end date in the past
    await prisma.internshipInfo.create({
      data: {
        internId: internDetail.internId,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-06-30'),
        status: 'Active',
      },
    });

    // Create some documents for the intern
    await prisma.internDocument.createMany({
      data: [
        {
          internId: internDetail.internId,
          documentType: 'CV',
          fileName: 'cv.pdf',
          filePath: 'drive/cv.pdf',
          originalName: 'cv.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
        },
        {
          internId: internDetail.internId,
          documentType: 'ID_PASSPORT',
          fileName: 'passport.pdf',
          filePath: 'drive/passport.pdf',
          originalName: 'passport.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
        },
      ],
    });

    // Enable the document deletion policy
    await prisma.documentDeletionPolicy.create({
      data: {
        id: 1,
        enabled: true,
        delayAmount: 0,
        delayUnit: 'days',
      },
    });

    // Run the deletion cycle
    const result = await runDocumentDeletionCycle();

    // Check the results
    expect(result.deletedDocs).toBe(2);
    expect(result.driveDeleted).toBe(2);
    expect(deleteDriveFileByAny).toHaveBeenCalledTimes(2);
  });
});
