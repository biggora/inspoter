import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockDomains, mockDnsRecords } from '@/mocks/domains';
import type { Domain, DnsRecord, DnsRecordType } from '@/mocks/domains';
import Modal from '@/components/base/Modal';

type PageState = 'loading' | 'error' | 'ready';

const recordTypes: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'];

const typeNeedsPriority = (type: DnsRecordType) => type === 'MX' || type === 'SRV';

const defaultTtl = 3600;

interface NotificationState {
  message: string;
  variant: 'success' | 'error';
}

interface RecordFormData {
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  priority: number;
}

const blankForm = (): RecordFormData => ({
  type: 'A',
  name: '',
  value: '',
  ttl: defaultTtl,
  priority: 10,
});

interface RecordFormErrors {
  name?: string;
  value?: string;
  ttl?: string;
  priority?: string;
}

function validateRecord(form: RecordFormData): RecordFormErrors | null {
  const errors: RecordFormErrors = {};
  if (!form.name.trim()) errors.name = 'Имя обязательно';
  if (!form.value.trim()) {
    errors.value = 'Значение обязательно';
  } else {
    if (form.type === 'A') {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4.test(form.value.trim())) errors.value = 'Некорректный IPv4-адрес';
    }
    if (form.type === 'AAAA') {
      const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
      if (!ipv6.test(form.value.trim())) errors.value = 'Некорректный IPv6-адрес';
    }
    if (form.type === 'CNAME' || form.type === 'NS') {
      const hostname = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
      if (!hostname.test(form.value.trim()) && !form.value.trim().endsWith('.')) {
        errors.value = 'Некорректное имя хоста';
      }
    }
  }
  if (!form.ttl || form.ttl < 1) errors.ttl = 'TTL должен быть положительным числом';
  if (typeNeedsPriority(form.type) && (form.priority == null || form.priority < 0)) {
    errors.priority = 'Приоритет обязателен для этого типа';
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

export default function DnsDetailPage() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [domain, setDomain] = useState<Domain | null>(null);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [notification, setNotification] = useState<NotificationState | null>(null);

  // Record dialog state
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);
  const [recordForm, setRecordForm] = useState<RecordFormData>(blankForm());
  const [recordErrors, setRecordErrors] = useState<RecordFormErrors | null>(null);
  const [recordSaving, setRecordSaving] = useState(false);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<DnsRecord | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadData = useCallback(() => {
    if (!domainId) {
      setPageState('error');
      return;
    }
    setPageState('loading');
    setTimeout(() => {
      const foundDomain = mockDomains.find((d) => d.id === domainId);
      if (!foundDomain) {
        setPageState('error');
        return;
      }
      const domainRecords = mockDnsRecords[domainId] || [];
      setDomain(foundDomain);
      setRecords(domainRecords.map((r) => ({ ...r })));
      setPageState('ready');
    }, 500);
  }, [domainId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showNotification = useCallback((message: string, variant: 'success' | 'error') => {
    setNotification({ message, variant });
  }, []);

  // Open create dialog
  const handleOpenCreate = () => {
    setEditingRecord(null);
    setRecordForm(blankForm());
    setRecordErrors(null);
    setRecordDialogOpen(true);
  };

  // Open edit dialog
  const handleOpenEdit = (record: DnsRecord) => {
    setEditingRecord(record);
    setRecordForm({
      type: record.type,
      name: record.name,
      value: record.value,
      ttl: record.ttl,
      priority: record.priority || 10,
    });
    setRecordErrors(null);
    setRecordDialogOpen(true);
  };

  // Save record (create or update)
  const handleSaveRecord = () => {
    const errors = validateRecord(recordForm);
    if (errors) {
      setRecordErrors(errors);
      return;
    }
    setRecordSaving(true);
    // Simulate API call
    setTimeout(() => {
      const shouldFail = Math.random() < 0.08;
      if (shouldFail) {
        showNotification('Не удалось сохранить запись. Попробуйте снова.', 'error');
        setRecordSaving(false);
        return;
      }

      if (editingRecord) {
        // Update
        setRecords((prev) =>
          prev.map((r) =>
            r.id === editingRecord.id
              ? {
                  ...r,
                  type: recordForm.type,
                  name: recordForm.name.trim() || '@',
                  value: recordForm.value.trim(),
                  ttl: recordForm.ttl,
                  priority: typeNeedsPriority(recordForm.type) ? recordForm.priority : undefined,
                }
              : r
          )
        );
        showNotification('DNS-запись обновлена.', 'success');
      } else {
        // Create
        const newRecord: DnsRecord = {
          id: `dns-new-${Date.now()}`,
          type: recordForm.type,
          name: recordForm.name.trim() || '@',
          value: recordForm.value.trim(),
          ttl: recordForm.ttl,
          priority: typeNeedsPriority(recordForm.type) ? recordForm.priority : undefined,
        };
        setRecords((prev) => [...prev, newRecord]);
        showNotification('DNS-запись создана.', 'success');
      }

      setRecordDialogOpen(false);
      setRecordSaving(false);
    }, 600);
  };

  // Open delete confirmation
  const handleOpenDelete = (record: DnsRecord) => {
    setDeletingRecord(record);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleConfirmDelete = () => {
    if (!deletingRecord) return;
    setDeletePending(true);
    setTimeout(() => {
      const shouldFail = Math.random() < 0.08;
      if (shouldFail) {
        showNotification('Не удалось удалить запись. Попробуйте снова.', 'error');
        setDeletePending(false);
        setDeleteDialogOpen(false);
        return;
      }
      setRecords((prev) => prev.filter((r) => r.id !== deletingRecord.id));
      showNotification('DNS-запись удалена.', 'success');
      setDeletePending(false);
      setDeleteDialogOpen(false);
      setDeletingRecord(null);
    }, 500);
  };

  // Handle field blur — revalidate single field
  const handleFieldBlur = (field: keyof RecordFormErrors) => {
    if (recordErrors && recordErrors[field]) {
      const newErrors = validateRecord(recordForm);
      setRecordErrors(newErrors);
    }
  };

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="p-6">
        <div className="mb-5">
          <div className="animate-skeleton h-3 w-20 rounded mb-3"></div>
          <div className="animate-skeleton h-7 w-48 rounded"></div>
        </div>
        <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-100">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 w-20">Тип</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500">Имя</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500">Значение</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 w-20">TTL</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-foreground-500 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i} className="border-b border-background-50 last:border-0">
                  <td className="px-4 py-3"><div className="animate-skeleton h-6 w-14 rounded-lg"></div></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-28 rounded"></div></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-40 rounded"></div></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-4 w-12 rounded"></div></td>
                  <td className="px-4 py-3"><div className="animate-skeleton h-7 w-16 rounded-lg ml-auto"></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Error — domain not found or unknown
  if (pageState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-error-warning-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Домен не найден</h3>
          <p className="text-sm text-foreground-500 mb-6">
            Запрошенный домен не существует или был удалён. Вернитесь к списку доменов.
          </p>
          <button
            onClick={() => navigate('/domains')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-left-line w-5 h-5 flex items-center justify-center"></i>
            К списку доменов
          </button>
        </div>
      </div>
    );
  }

  // Ready
  return (
    <div className="p-6">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium animate-slide-in-right ${
            notification.variant === 'success'
              ? 'bg-accent-100/80 text-accent-800'
              : 'bg-primary-100/70 text-primary-800'
          }`}
          role="status"
          aria-live="polite"
        >
          <i
            className={`${
              notification.variant === 'success' ? 'ri-check-line' : 'ri-error-warning-line'
            } w-5 h-5 flex items-center justify-center`}
          ></i>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <button
            onClick={() => navigate('/domains')}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap mb-1.5"
          >
            <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
            Назад к доменам
          </button>
          <h2 className="font-heading text-lg font-semibold text-foreground-900">
            DNS-записи — {domain?.name}
          </h2>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
          Добавить запись
        </button>
      </div>

      {/* Empty state */}
      {records.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-sm animate-scale-in">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
              <i className="ri-file-list-3-line text-2xl text-secondary-600"></i>
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Нет DNS-записей</h3>
            <p className="text-sm text-foreground-500 mb-5">
              У домена «{domain?.name}» пока нет DNS-записей. Добавьте первую запись, чтобы настроить маршрутизацию.
            </p>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
              Добавить запись
            </button>
          </div>
        </div>
      ) : (
        /* Table */
        <div className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-background-100">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap w-20">Тип</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap">Имя</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap">Значение</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap w-20">TTL</th>
                  {records.some((r) => r.priority != null) && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-foreground-500 whitespace-nowrap w-16">Приор.</th>
                  )}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-foreground-500 whitespace-nowrap w-28"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-background-50 last:border-0 hover:bg-background-100/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-secondary-100 text-xs font-semibold text-secondary-800 whitespace-nowrap">
                        {record.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-800 font-medium break-all">{record.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground-600 break-all max-w-[300px]">
                      <code className="text-xs bg-background-100 rounded px-1.5 py-0.5">{record.value}</code>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-500 whitespace-nowrap">{record.ttl}s</td>
                    {records.some((r) => r.priority != null) && (
                      <td className="px-4 py-3 text-sm text-foreground-500 whitespace-nowrap">
                        {record.priority != null ? record.priority : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(record)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-200 transition-colors cursor-pointer"
                          title="Изменить"
                        >
                          <i className="ri-pencil-line text-sm"></i>
                        </button>
                        <button
                          onClick={() => handleOpenDelete(record)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer"
                          title="Удалить"
                        >
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-foreground-400">
          {records.length} {records.length === 1 ? 'запись' : records.length >= 2 && records.length <= 4 ? 'записи' : 'записей'}
        </p>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground-500 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
          Обновить
        </button>
      </div>

      {/* Create/Edit Record Dialog */}
      <Modal
        open={recordDialogOpen}
        onClose={() => setRecordDialogOpen(false)}
        title={editingRecord ? 'Изменить DNS-запись' : 'Новая DNS-запись'}
        footer={
          <>
            <button
              onClick={() => setRecordDialogOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              Отмена
            </button>
            <button
              onClick={handleSaveRecord}
              disabled={recordSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {recordSaving ? (
                <>
                  <i className="ri-loader-4-line w-4 h-4 flex items-center justify-center animate-spin"></i>
                  Сохранение...
                </>
              ) : editingRecord ? (
                'Сохранить'
              ) : (
                'Добавить'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-3.5">
          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">Тип записи</label>
            <select
              value={recordForm.type}
              onChange={(e) => {
                const newType = e.target.value as DnsRecordType;
                setRecordForm((prev) => ({ ...prev, type: newType }));
                if (recordErrors) setRecordErrors(validateRecord({ ...recordForm, type: newType }));
              }}
              className="w-full rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-colors cursor-pointer"
            >
              {recordTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">Имя</label>
            <input
              type="text"
              value={recordForm.name}
              onChange={(e) => {
                setRecordForm((prev) => ({ ...prev, name: e.target.value }));
                if (recordErrors) setRecordErrors(validateRecord({ ...recordForm, name: e.target.value }));
              }}
              onBlur={() => handleFieldBlur('name')}
              placeholder="@ или www"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-foreground-900 bg-background-50 focus:outline-none focus:ring-2 transition-colors ${
                recordErrors?.name
                  ? 'border-primary-400 focus:ring-primary-300 focus:border-primary-300'
                  : 'border-background-200 focus:ring-primary-300 focus:border-primary-300'
              }`}
            />
            {recordErrors?.name && <p className="text-xs text-primary-600 mt-1">{recordErrors.name}</p>}
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">Значение</label>
            <input
              type="text"
              value={recordForm.value}
              onChange={(e) => {
                setRecordForm((prev) => ({ ...prev, value: e.target.value }));
                if (recordErrors) setRecordErrors(validateRecord({ ...recordForm, value: e.target.value }));
              }}
              onBlur={() => handleFieldBlur('value')}
              placeholder={recordForm.type === 'A' ? '192.168.1.1' : recordForm.type === 'AAAA' ? '2a01::1' : recordForm.type === 'MX' ? 'mail.example.com' : 'example.com'}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-foreground-900 bg-background-50 focus:outline-none focus:ring-2 transition-colors ${
                recordErrors?.value
                  ? 'border-primary-400 focus:ring-primary-300 focus:border-primary-300'
                  : 'border-background-200 focus:ring-primary-300 focus:border-primary-300'
              }`}
            />
            {recordErrors?.value && <p className="text-xs text-primary-600 mt-1">{recordErrors.value}</p>}
          </div>

          {/* TTL */}
          <div>
            <label className="block text-xs font-medium text-foreground-700 mb-1.5">TTL (секунды)</label>
            <select
              value={recordForm.ttl}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setRecordForm((prev) => ({ ...prev, ttl: val }));
                if (recordErrors) setRecordErrors(validateRecord({ ...recordForm, ttl: val }));
              }}
              className="w-full rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-colors cursor-pointer"
            >
              <option value={60}>1 мин (60)</option>
              <option value={300}>5 мин (300)</option>
              <option value={600}>10 мин (600)</option>
              <option value={3600}>1 ч (3600)</option>
              <option value={14400}>4 ч (14400)</option>
              <option value={86400}>1 д (86400)</option>
            </select>
            {recordErrors?.ttl && <p className="text-xs text-primary-600 mt-1">{recordErrors.ttl}</p>}
          </div>

          {/* Priority — only for MX / SRV */}
          {typeNeedsPriority(recordForm.type) && (
            <div>
              <label className="block text-xs font-medium text-foreground-700 mb-1.5">Приоритет</label>
              <input
                type="number"
                min={0}
                value={recordForm.priority}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  setRecordForm((prev) => ({ ...prev, priority: val }));
                  if (recordErrors) setRecordErrors(validateRecord({ ...recordForm, priority: val }));
                }}
                onBlur={() => handleFieldBlur('priority')}
                className={`w-full rounded-lg border px-3 py-2 text-sm text-foreground-900 bg-background-50 focus:outline-none focus:ring-2 transition-colors ${
                  recordErrors?.priority
                    ? 'border-primary-400 focus:ring-primary-300 focus:border-primary-300'
                    : 'border-background-200 focus:ring-primary-300 focus:border-primary-300'
                }`}
              />
              {recordErrors?.priority && <p className="text-xs text-primary-600 mt-1">{recordErrors.priority}</p>}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Удалить DNS-запись"
        footer={
          <>
            <button
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deletePending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deletePending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletePending ? (
                <>
                  <i className="ri-loader-4-line w-4 h-4 flex items-center justify-center animate-spin"></i>
                  Удаление...
                </>
              ) : (
                'Удалить'
              )}
            </button>
          </>
        }
      >
        <div>
          <p className="text-sm text-foreground-700">
            Вы уверены, что хотите удалить{' '}
            <strong className="text-foreground-900">
              {deletingRecord?.type}
            </strong>{' '}
            запись{' '}
            <strong className="text-foreground-900">
              {deletingRecord?.name}
            </strong>
            {' '}→{' '}
            <code className="text-xs bg-background-100 rounded px-1.5 py-0.5 text-foreground-700">
              {deletingRecord?.value}
            </code>
            ?
          </p>
          <p className="text-xs text-foreground-400 mt-2">
            Это действие нельзя отменить. Запись будет удалена с DNS-серверов провайдера.
          </p>
        </div>
      </Modal>
    </div>
  );
}