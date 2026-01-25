// frontend/src/pages/admin/import-users.tsx
import {useState, ChangeEvent, useRef, DragEvent} from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  uploadImportPreview,
  commitEmployeeImport,
  resendImportSetupLinks,
  ImportPreviewResponse,
  ImportCommitResult,
  ImportField,
} from '@/lib/api';
import {
  UploadCloud,
  TableProperties,
  CheckCircle,
  FileSpreadsheet,
  AlertCircle,
  Check,
  Loader2,
  Download,
} from 'lucide-react';

type Step = 'upload' | 'map' | 'result';

type CompanyEmailMode = 'csv' | 'generate';

function ImportUsersPageInner() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companyEmailMode, setCompanyEmailMode] =
    useState<CompanyEmailMode>('csv');

  const isCompanyEmailField = (f: ImportField) => {
    const id = (f.id || '').toLowerCase();
    const label = (f.label || '').toLowerCase();
    return (
      (id.includes('company') && id.includes('email')) ||
      (label.includes('company') && label.includes('email'))
    );
  };

  const steps = [
    {id: 'upload', label: 'Upload File', icon: UploadCloud},
    {id: 'map', label: 'Map Columns', icon: TableProperties},
    {id: 'result', label: 'Review & Finish', icon: CheckCircle},
  ];

  const stepIndex = steps.findIndex(s => s.id === step);

  const [retryLoading, setRetryLoading] = useState(false);

  const mergeByUserId = (prev: any[] = [], next: any[] = []) => {
    const m = new Map<number, any>();
    for (const r of prev) m.set(r.userId, r);
    for (const r of next) m.set(r.userId, r);
    return Array.from(m.values());
  };
  const retryFailedEmails = async () => {
    if (!result?.setupEmails?.length) return;
    const failed = result.setupEmails.filter(r => !r.ok);
    if (!failed.length) return;

    setRetryLoading(true);
    try {
      const resp = await resendImportSetupLinks(failed.map(f => f.userId));
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          setupEmails: mergeByUserId(
            prev.setupEmails || [],
            resp.results || [],
          ),
          setupEmailsSent: mergeByUserId(
            prev.setupEmails || [],
            resp.results || [],
          ).filter(r => r.ok).length,
          setupEmailsFailed: mergeByUserId(
            prev.setupEmails || [],
            resp.results || [],
          ).filter(r => !r.ok).length,
        };
      });
    } finally {
      setRetryLoading(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;

    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setError(null);
    setResult(null);
    setPreview(null);
    setMapping({});
    setStep('upload');
    setFile(f);
    setLoading(true);

    try {
      const data = await uploadImportPreview(f);
      setPreview(data);
      setStep('map');
    } catch (err: any) {
      setError(
        err?.message || 'Failed to parse CSV. Please check the file format.',
      );
      setStep('upload');
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (
        file.type === 'text/csv' ||
        file.name.toLowerCase().endsWith('.csv')
      ) {
        handleFileChange({target: {files: [file]}} as any);
      } else {
        setError('Please drop a CSV file');
      }
    }
  };

  const getMissingRequiredFields = (fields: ImportField[]) => {
    return fields.filter(f => {
      if (companyEmailMode === 'generate' && isCompanyEmailField(f))
        return false;
      return (
        f.required &&
        (mapping[f.id] == null || Number.isNaN(Number(mapping[f.id]!)))
      );
    });
  };

  const handleImport = async () => {
    if (!file || !preview) return;

    const missingRequired = getMissingRequiredFields(preview.fields);
    if (missingRequired.length > 0) {
      setError(
        `Please map all required fields: ${missingRequired.map(f => f.label).join(', ')}`,
      );
      // Scroll to error
      window.scrollTo({top: 0, behavior: 'smooth'});
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const mappingToSend = {...mapping};
      if (companyEmailMode === 'generate') {
        for (const f of preview.fields) {
          if (isCompanyEmailField(f)) mappingToSend[f.id] = null;
        }
      }

      const res = await commitEmployeeImport(file, mappingToSend, {
        companyEmailMode,
      });
      setResult(res);
      setStep('result');
      window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (err: any) {
      setError(err?.message || 'Import failed. Please try again.');
      window.scrollTo({top: 0, behavior: 'smooth'});
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Import Employees
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg">
          Upload a CSV file to import employee data into the system
        </p>
      </div>

      {/* Stepper */}
      <div className="mb-12">
        <div className="relative flex justify-between">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 dark:bg-gray-700 -z-10 -translate-y-1/2" />
          {steps.map((s, idx) => {
            const isActive = s.id === step;
            const isCompleted = stepIndex > idx;
            return (
              <div
                key={s.id}
                className="flex flex-col items-center bg-white dark:bg-[#0a0a0a] px-4"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-6 h-6" />
                  ) : (
                    <s.icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isActive
                      ? 'text-blue-600'
                      : isCompleted
                        ? 'text-blue-600'
                        : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer group ${
              loading
                ? 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700'
                : 'border-gray-300 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10'
            }`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Drag CSV here or click to browse
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Max file size: 10MB
            </p>

            {loading && (
              <div className="flex items-center justify-center gap-2 mb-4">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-gray-600 dark:text-gray-300">
                  Processing file...
                </span>
              </div>
            )}

            <a
              href="#"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              <Download className="w-4 h-4 mr-1" />
              Download Template
            </a>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={loading}
            className="hidden"
          />

          <div className="mt-8">
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">
              CSV Requirements
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-500 dark:text-gray-400">
              <li>First row must be headers</li>
              <li>Required: Name, Email, Department, Position</li>
              <li>Date format: YYYY-MM-DD</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 2: Map */}
      {step === 'map' && preview && (
        <div className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Map CSV Columns
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Match your CSV columns to the system fields.
              </p>
            </div>
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setCompanyEmailMode('csv')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  companyEmailMode === 'csv'
                    ? 'bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                }`}
              >
                Use CSV Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompanyEmailMode('generate');
                  setMapping(prev => {
                    const next = {...prev};
                    for (const f of preview.fields) {
                      if (isCompanyEmailField(f)) next[f.id] = null;
                    }
                    return next;
                  });
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  companyEmailMode === 'generate'
                    ? 'bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                }`}
              >
                Auto-Generate
              </button>
            </div>
          </div>

          {/* File Info */}
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-lg mb-8">
            <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <span className="font-medium text-gray-900 dark:text-white">
                {preview.fileName}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-2 text-sm">
                {preview.rowCount} rows • {preview.columnCount} columns
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-900 dark:text-white w-1/3">
                    System Field
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    CSV Column
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {preview.fields
                  .filter(
                    f =>
                      !(
                        companyEmailMode === 'generate' &&
                        isCompanyEmailField(f)
                      ),
                  )
                  .map(field => (
                    <tr
                      key={field.id}
                      className="bg-white dark:bg-[#111] hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {field.label}{' '}
                        {field.required && (
                          <span className="text-red-500">*</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={mapping[field.id] ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            setMapping(prev => ({
                              ...prev,
                              [field.id]: val === '' ? null : Number(val),
                            }));
                          }}
                          className="w-full p-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Select CSV Column...</option>
                          {preview.header.map((h, idx) => (
                            <option key={idx} value={idx}>
                              {h || `Column ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex gap-4">
            <button
              type="button"
              onClick={handleImport}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {loading ? 'Importing...' : 'Import Users'}
            </button>
            <button
              type="button"
              onClick={resetAll}
              disabled={loading}
              className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 'result' && result && (
        <div className="bg-white dark:bg-[#111] rounded-xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Import Complete
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            Processed {result.total} rows successfully.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {result.createdUsers}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Users Created
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {result.createdInterns}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Intern Profiles
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {result.createdInternships}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Internships
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                {result.total}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total Rows
              </div>
            </div>
          </div>

          {result.setupEmails && result.setupEmails.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg mb-8 text-left">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                Password Setup Emails
              </h3>
              <div className="flex gap-4 mb-4 text-sm">
                <div>
                  <span className="font-medium text-green-600">Sent:</span>{' '}
                  {result.setupEmailsSent ??
                    result.setupEmails.filter(r => r.ok).length}
                </div>
                <div>
                  <span className="font-medium text-red-600">Failed:</span>{' '}
                  {result.setupEmailsFailed ??
                    result.setupEmails.filter(r => !r.ok).length}
                </div>
              </div>

              {result.setupEmails.some(r => !r.ok) && (
                <button
                  type="button"
                  onClick={retryFailedEmails}
                  disabled={retryLoading}
                  className="mb-4 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {retryLoading ? 'Retrying...' : 'Retry failed emails'}
                </button>
              )}

              <div className="max-h-40 overflow-y-auto border-t border-gray-200 dark:border-gray-700 pt-2 text-sm text-gray-600 dark:text-gray-300">
                {result.setupEmails.map((r, i) => (
                  <div
                    key={i}
                    className="py-1 flex justify-between items-center"
                  >
                    <span>{r.email}</span>
                    <span className={r.ok ? 'text-green-600' : 'text-red-600'}>
                      {r.ok ? 'Sent' : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.rowErrors.length > 0 && (
            <div className="mb-8 text-left">
              <h3 className="text-red-600 font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Errors ({result.rowErrors.length})
              </h3>
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg p-4 max-h-60 overflow-y-auto font-mono text-sm text-red-700 dark:text-red-400">
                {result.rowErrors.map((e, i) => (
                  <div
                    key={i}
                    className="mb-1 border-b border-red-100 dark:border-red-800/20 last:border-0 pb-1"
                  >
                    <span className="font-bold">Row {e.row}:</span> {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={resetAll}
            className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}

export default function ImportUsersPage() {
  return (
    <ProtectedRoute roles={['hr', 'super_admin']}>
      <ImportUsersPageInner />
    </ProtectedRoute>
  );
}
