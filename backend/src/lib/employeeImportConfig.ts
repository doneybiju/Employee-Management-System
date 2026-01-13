// backend/src/lib/employeeImportConfig.ts

/**
 * Logical fields that our CSV import understands.
 * These are NOT column names; they are internal keys.
 * The frontend will let the user map CSV columns to these keys.
 */
export const IMPORT_FIELDS = [
  'firstName',
  'surname',
  'personalEmail',
  'companyEmail',
  'nationality',
  'gender',
  'phone',
  'birthdate',
  'department',
  'position',
  'startDate',
  'endDate',
  'empType',
  'supervisor',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/**
 * Fields that MUST be mapped before we allow the import.
 * (companyEmail is required because those accounts already exist in Google.)
 */
export const REQUIRED_IMPORT_FIELDS: ImportField[] = [
  'firstName',
  'surname',
  'companyEmail',
  'department',
  'position',
  'startDate',
  'empType',
];

/**
 * Human-readable labels for each field (for UI + error messages).
 */
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  firstName:  'First Name',
  surname:    'Surname',
  companyEmail: 'Company Email',
  nationality: 'Nationality',
  gender:      'Gender',
  phone:       'Phone (optional)',
  birthdate:   'Birthdate (optional)',
  department:  'Department',
  position:    'Position',
  startDate:   'Start Date',
  endDate:     'End Date (optional)',
  empType:     'Employee Type',
  supervisor:  'Supervisor (optional)',
};

/**
 * Simple helper we’ll use later to send field metadata to the frontend.
 */
export type ImportFieldMeta = {
  key: ImportField;
  label: string;
  required: boolean;
};

export function getImportFieldMeta(): ImportFieldMeta[] {
  const requiredSet = new Set(REQUIRED_IMPORT_FIELDS);
  return IMPORT_FIELDS.map((key) => ({
    key,
    label: IMPORT_FIELD_LABELS[key],
    required: requiredSet.has(key),
  }));
}
