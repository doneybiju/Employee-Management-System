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

  const hasPreview = !!preview && !!file;

  // Progress steps configuration
  const steps = [
    {id: 'upload', label: 'Upload File', description: 'Select your CSV file'},
    {
      id: 'map',
      label: 'Map Columns',
      description: 'Match CSV columns to fields',
    },
    {
      id: 'result',
      label: 'Import Result',
      description: 'Review import outcome',
    },
  ];

  const stepIndex = steps.findIndex(s => s.id === step);
  const progressPct =
    steps.length <= 1 ? 0 : (stepIndex / (steps.length - 1)) * 100;
  const edgePct = 100 / (steps.length * 2);

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

  const handleColumnMappingChange = (colIndex: number, fieldId: string) => {
    setMapping(prev => {
      const next: Record<string, number | null> = {...prev};

      // Remove this column from any field currently using it
      for (const key of Object.keys(next)) {
        if (next[key] === colIndex) {
          next[key] = null;
        }
      }

      if (!fieldId) {
        // User chose "Ignore"
        return next;
      }

      next[fieldId] = colIndex;
      return next;
    });
  };

  const getSelectedFieldForColumn = (colIndex: number): string => {
    for (const [fieldId, col] of Object.entries(mapping)) {
      if (col === colIndex) return fieldId;
    }
    return '';
  };

  const getUsedFieldIdsExcludingColumn = (
    excludeColIndex: number,
  ): Set<string> => {
    const used = new Set<string>();
    for (const [fieldId, col] of Object.entries(mapping)) {
      if (col != null && col !== excludeColIndex) used.add(fieldId);
    }
    return used;
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

  const getStepStatus = (stepId: Step) => {
    if (stepId === step) return 'current';
    const stepIndex = steps.findIndex(s => s.id === stepId);
    const currentIndex = steps.findIndex(s => s.id === step);
    return stepIndex < currentIndex ? 'completed' : 'upcoming';
  };

  return (
    <div style={{maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem'}}>
      <div style={{marginBottom: '2rem'}}>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
            color: '#1f2937',
          }}
        >
          Import Employees
        </h1>
        <p style={{color: '#6b7280', fontSize: '1rem'}}>
          Upload a CSV file to import employee data into the system
        </p>
      </div>

      {/* Progress Steps */}
      <div style={{marginBottom: '3rem'}}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          {steps.map((stepItem, index) => {
            const status = getStepStatus(stepItem.id as Step);
            return (
              <div
                key={stepItem.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  zIndex: 2,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    marginBottom: '0.5rem',
                    ...(status === 'completed'
                      ? {backgroundColor: '#10b981', color: 'white'}
                      : status === 'current'
                        ? {backgroundColor: '#3b82f6', color: 'white'}
                        : {backgroundColor: '#f3f4f6', color: '#9ca3af'}),
                  }}
                >
                  {status === 'completed' ? '✓' : index + 1}
                </div>
                <div style={{textAlign: 'center'}}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color:
                        status === 'completed'
                          ? '#10b981'
                          : status === 'current'
                            ? '#3b82f6'
                            : '#9ca3af',
                    }}
                  >
                    {stepItem.label}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      marginTop: '0.25rem',
                    }}
                  >
                    {stepItem.description}
                  </div>
                </div>
              </div>
            );
          })}
          {/* Progress line 
          below*/}
          <div
            style={{
              position: 'absolute',
              top: '1.25rem',
              left: `${edgePct}%`,
              right: `${edgePct}%`,
              height: '2px',
              backgroundColor: '#e5e7eb',
              zIndex: 1,
            }}
          >
            <div
              style={{
                height: '100%',
                backgroundColor: '#10b981',
                width: `${progressPct}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          {/* <div style={{
            position: 'absolute',
            top: '1.25rem',
            left: '25%',
            right: '25%',
            height: '2px',
            backgroundColor: '#e5e7eb',
            zIndex: 1
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#10b981',
              width: step === 'upload' ? '0%' : step === 'map' ? '50%' : '100%',
              transition: 'width 0.3s ease'
            }} />
          </div> */}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <div style={{color: '#dc2626', flexShrink: 0}}>
            <svg
              style={{width: '1.25rem', height: '1.25rem'}}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div style={{color: '#dc2626', fontSize: '0.875rem'}}>{error}</div>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <section
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          }}
        >
          <div
            style={{textAlign: 'center', maxWidth: '500px', margin: '0 auto'}}
          >
            <div
              style={{
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                padding: '3rem 2rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: loading ? '#f9fafb' : '#fafafa',
                ...(!loading && {
                  ':hover': {
                    borderColor: '#3b82f6',
                    backgroundColor: '#f0f9ff',
                  },
                }),
              }}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={triggerFileInput}
            >
              <div style={{color: '#6b7280', marginBottom: '1rem'}}>
                <svg
                  style={{width: '3rem', height: '3rem', margin: '0 auto'}}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div style={{marginBottom: '0.5rem'}}>
                <span style={{color: '#3b82f6', fontWeight: 600}}>
                  Click to upload
                </span>
                <span style={{color: '#6b7280'}}> or drag and drop</span>
              </div>
              <p
                style={{
                  color: '#6b7280',
                  fontSize: '0.875rem',
                  marginBottom: '1rem',
                }}
              >
                CSV files only (max 10MB)
              </p>
              {loading && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      width: '1rem',
                      height: '1rem',
                      border: '2px solid #e5e7eb',
                      borderTop: '2px solid #3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <span style={{color: '#6b7280', fontSize: '0.875rem'}}>
                    Processing file...
                  </span>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={loading}
              style={{display: 'none'}}
            />

            <div style={{marginTop: '2rem', textAlign: 'left'}}>
              <h3
                style={{
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                  color: '#374151',
                }}
              >
                CSV Format Requirements
              </h3>
              <ul
                style={{
                  color: '#6b7280',
                  fontSize: '0.875rem',
                  listStyle: 'disc',
                  paddingLeft: '1.5rem',
                }}
              >
                <li>First row should contain column headers</li>
                <li>Supported fields: Name, Email, Department, Position</li>
                <li>Date format: YYYY-MM-DD</li>
                <li>File size limit: 10MB</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Company Email Mode */}
      {hasPreview && step === 'map' && (
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div
            style={{fontWeight: 600, color: '#111827', marginBottom: '0.5rem'}}
          >
            Company Email
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginRight: '1rem',
            }}
          >
            <input
              type="radio"
              name="companyEmailMode"
              checked={companyEmailMode === 'csv'}
              onChange={() => setCompanyEmailMode('csv')}
            />
            Use from CSV
          </label>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <input
              type="radio"
              name="companyEmailMode"
              checked={companyEmailMode === 'generate'}
              onChange={() => {
                setCompanyEmailMode('generate');

                // Clear any existing company email mapping
                setMapping(prev => {
                  const next = {...prev};
                  if (preview) {
                    for (const f of preview.fields) {
                      if (isCompanyEmailField(f)) next[f.id] = null;
                    }
                  }
                  return next;
                });
              }}
            />
            Generate new (ignore CSV company email)
          </label>

          <div
            style={{
              marginTop: '0.5rem',
              fontSize: '0.875rem',
              color: '#6b7280',
            }}
          >
            If “Generate new” is selected, the Company Email column will not be
            imported from the CSV.
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {hasPreview && step === 'map' && (
        <section
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{marginBottom: '1.5rem'}}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: '#1f2937',
              }}
            >
              Map CSV Columns
            </h2>
            <p style={{color: '#6b7280', fontSize: '0.875rem'}}>
              Match your CSV columns to the system fields. Required fields are
              marked with <span style={{color: '#ef4444'}}>*</span>.
            </p>
          </div>

          {/* File Info */}
          <div
            style={{
              backgroundColor: '#f0f9ff',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              border: '1px solid #e0f2fe',
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <svg
                style={{width: '1.25rem', height: '1.25rem', color: '#0ea5e9'}}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div>
                <span style={{fontWeight: 600}}>{preview.fileName}</span>
                <span
                  style={{
                    color: '#6b7280',
                    fontSize: '0.875rem',
                    marginLeft: '0.75rem',
                  }}
                >
                  {preview.rowCount} rows • {preview.columnCount} columns
                </span>
              </div>
            </div>
          </div>

          {/* Mapping Table */}
          <div
            style={{
              overflowX: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
                minWidth: '800px',
              }}
            >
              <thead>
                <tr style={{backgroundColor: '#f9fafb'}}>
                  <th
                    style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#374151',
                      borderBottom: '1px solid #e5e7eb',
                      width: '120px',
                    }}
                  >
                    System Field
                  </th>
                  {preview.header.map((h, colIndex) => {
                    const currentFieldId = getSelectedFieldForColumn(colIndex);
                    const usedElsewhere =
                      getUsedFieldIdsExcludingColumn(colIndex);

                    return (
                      <th
                        key={colIndex}
                        style={{
                          padding: '0.75rem',
                          borderBottom: '1px solid #e5e7eb',
                          fontWeight: 600,
                          color: '#374151',
                          minWidth: 150,
                          backgroundColor: '#f9fafb',
                        }}
                      >
                        <div style={{marginBottom: '0.5rem'}}>
                          {h || (
                            <span
                              style={{color: '#9ca3af', fontStyle: 'italic'}}
                            >
                              (empty header)
                            </span>
                          )}
                        </div>

                        <select
                          value={currentFieldId}
                          onChange={e =>
                            handleColumnMappingChange(colIndex, e.target.value)
                          }
                          style={{
                            width: '100%',
                            padding: '0.375rem 0.5rem',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.8rem',
                            backgroundColor: 'white',
                          }}
                        >
                          <option value="">Ignore column</option>

                          {preview.fields
                            // keep your existing “generate mode hides companyEmail” rule
                            .filter(
                              f =>
                                !(
                                  companyEmailMode === 'generate' &&
                                  isCompanyEmailField(f)
                                ),
                            )
                            // NEW: hide fields already selected in other columns (but keep current selection)
                            .filter(
                              f =>
                                !usedElsewhere.has(f.id) ||
                                f.id === currentFieldId,
                            )
                            .map(f => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                                {f.required ? ' *' : ''}
                              </option>
                            ))}
                        </select>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 10).map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    style={{
                      backgroundColor: rowIndex % 2 === 0 ? 'white' : '#f9fafb',
                      transition: 'background-color 0.1s ease',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.75rem',
                        borderBottom: '1px solid #e5e7eb',
                        fontWeight: 500,
                        color: '#6b7280',
                        fontSize: '0.8rem',
                      }}
                    >
                      Row {rowIndex + 2}
                    </td>
                    {preview.header.map((_h, colIndex) => (
                      <td
                        key={colIndex}
                        style={{
                          padding: '0.75rem',
                          borderBottom: '1px solid #e5e7eb',
                          whiteSpace: 'nowrap',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: '#374151',
                        }}
                        title={row[colIndex] || ''}
                      >
                        {row[colIndex] || (
                          <span style={{color: '#9ca3af'}}>-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.rows.length > 10 && (
            <div
              style={{
                textAlign: 'center',
                padding: '1rem',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              Showing first 10 rows of {preview.rows.length} total rows
            </div>
          )}

          {/* Required Fields Info */}
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <svg
                style={{width: '1rem', height: '1rem', color: '#d97706'}}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <span style={{fontWeight: 600, color: '#92400e'}}>
                Required Fields
              </span>
            </div>
            <div style={{color: '#92400e', fontSize: '0.875rem'}}>
              {preview.fields
                .filter(
                  f =>
                    f.required &&
                    !(
                      companyEmailMode === 'generate' && isCompanyEmailField(f)
                    ),
                )
                .map(f => f.label)
                .join(', ')}
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              marginTop: '2rem',
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={handleImport}
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                border: 'none',
                background: loading ? '#9ca3af' : '#3b82f6',
                color: '#ffffff',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                ...(!loading && {
                  ':hover': {backgroundColor: '#2563eb'},
                }),
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: '1rem',
                      height: '1rem',
                      border: '2px solid transparent',
                      borderTop: '2px solid currentColor',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  Importing...
                </>
              ) : (
                <>
                  <svg
                    style={{width: '1rem', height: '1rem'}}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Import Employees
                </>
              )}
            </button>
            <button
              type="button"
              onClick={resetAll}
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#374151',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                ...(!loading && {
                  ':hover': {backgroundColor: '#f9fafb'},
                }),
              }}
            >
              Start Over
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Result */}
      {result && step === 'result' && (
        <section
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          }}
        >
          <div
            style={{textAlign: 'center', maxWidth: '600px', margin: '0 auto'}}
          >
            <div
              style={{
                width: '4rem',
                height: '4rem',
                borderRadius: '50%',
                background: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                border: '2px solid #10b981',
              }}
            >
              <svg
                style={{width: '2rem', height: '2rem', color: '#10b981'}}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                marginBottom: '0.5rem',
                color: '#1f2937',
              }}
            >
              Import Complete
            </h2>
            <p style={{color: '#6b7280', marginBottom: '2rem'}}>
              Your employee data has been successfully imported
            </p>

            {/* Results Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem',
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#3b82f6',
                    marginBottom: '0.25rem',
                  }}
                >
                  {result.total}
                </div>
                <div style={{fontSize: '0.875rem', color: '#6b7280'}}>
                  Total Rows
                </div>
              </div>
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#10b981',
                    marginBottom: '0.25rem',
                  }}
                >
                  {result.createdUsers}
                </div>
                <div style={{fontSize: '0.875rem', color: '#6b7280'}}>
                  Users Created
                </div>
              </div>
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#10b981',
                    marginBottom: '0.25rem',
                  }}
                >
                  {result.createdInterns}
                </div>
                <div style={{fontSize: '0.875rem', color: '#6b7280'}}>
                  Intern Profiles
                </div>
              </div>
              <div
                style={{
                  textAlign: 'center',
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#10b981',
                    marginBottom: '0.25rem',
                  }}
                >
                  {result.createdInternships}
                </div>
                <div style={{fontSize: '0.875rem', color: '#6b7280'}}>
                  Internships
                </div>
              </div>
            </div>

            {/* Skipped Rows */}
            {(result.skippedExisting > 0 || result.skippedEmpty > 0) && (
              <div
                style={{
                  backgroundColor: '#fffbeb',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '2rem',
                  textAlign: 'left',
                }}
              >
                <h3
                  style={{
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                    color: '#92400e',
                  }}
                >
                  Skipped Rows
                </h3>
                <div style={{color: '#92400e', fontSize: '0.875rem'}}>
                  {result.skippedExisting > 0 && (
                    <div>
                      • {result.skippedExisting} rows with existing users
                    </div>
                  )}
                  {result.skippedEmpty > 0 && (
                    <div>• {result.skippedEmpty} empty rows</div>
                  )}
                </div>
              </div>
            )}

            {/* __________________________________________________________________________________ */}

            {result.setupEmails && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 16,
                  textAlign: 'left',
                }}
              >
                <h3 style={{margin: 0, marginBottom: 8, fontWeight: 600}}>
                  Password setup emails
                </h3>

                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <strong>Sent:</strong>{' '}
                    {result.setupEmailsSent ??
                      result.setupEmails.filter(r => r.ok).length}
                  </div>
                  <div>
                    <strong>Failed:</strong>{' '}
                    {result.setupEmailsFailed ??
                      result.setupEmails.filter(r => !r.ok).length}
                  </div>
                </div>

                {result.setupEmails.some(r => !r.ok) && (
                  <button
                    type="button"
                    onClick={retryFailedEmails}
                    disabled={retryLoading}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      cursor: retryLoading ? 'not-allowed' : 'pointer',
                      marginBottom: 10,
                    }}
                  >
                    {retryLoading ? 'Retrying…' : 'Retry failed emails'}
                  </button>
                )}

                <div
                  style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    fontSize: 13,
                    color: '#374151',
                  }}
                >
                  {result.setupEmails.map(r => (
                    <div
                      key={r.userId}
                      style={{padding: '6px 0', borderTop: '1px solid #e5e7eb'}}
                    >
                      <div>
                        <strong>{r.email}</strong> — {r.ok ? 'Sent' : 'Failed'}
                      </div>
                      {!r.ok && r.error && (
                        <div style={{color: '#b91c1c'}}>{r.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.rowErrors.length > 0 && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '2rem',
                  textAlign: 'left',
                }}
              >
                <h3
                  style={{
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                    color: '#dc2626',
                  }}
                >
                  Import Errors
                </h3>
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: '#dc2626',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  {result.rowErrors.map((e, idx) => (
                    <div key={idx} style={{marginBottom: '0.25rem'}}>
                      <strong>Row {e.row}:</strong> {e.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={resetAll}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '6px',
                border: '1px solid #3b82f6',
                background: '#3b82f6',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                transition: 'all 0.2s ease',
              }}
            >
              Import Another File
            </button>
          </div>
        </section>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
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
