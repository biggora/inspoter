import { useState, useCallback, useEffect } from 'react';
import { initialCategories, initialBookmarks } from '@/mocks/bookmarks';
import type { Category, Bookmark } from '@/mocks/bookmarks';
import Modal from '@/components/base/Modal';
import CategorySection from './components/CategorySection';

type DialogState =
  | { type: 'none' }
  | { type: 'category-create' }
  | { type: 'category-rename'; category: Category }
  | { type: 'category-delete'; category: Category }
  | { type: 'bookmark-create'; categoryId: string }
  | { type: 'bookmark-edit'; bookmark: Bookmark }
  | { type: 'bookmark-delete'; bookmark: Bookmark };

interface NotificationState {
  message: string;
  variant: 'success' | 'error';
}

function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function BookmarksPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const [categoryName, setCategoryName] = useState('');
  const [categoryNameError, setCategoryNameError] = useState('');

  const [bmName, setBmName] = useState('');
  const [bmUrl, setBmUrl] = useState('');
  const [bmDescription, setBmDescription] = useState('');
  const [bmCategoryId, setBmCategoryId] = useState('');
  const [bmNameError, setBmNameError] = useState('');
  const [bmUrlError, setBmUrlError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCategories([...initialCategories]);
      setBookmarks([...initialBookmarks]);
      setIsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = useCallback((message: string, variant: 'success' | 'error') => {
    setNotification({ message, variant });
  }, []);

  const closeDialog = useCallback(() => {
    setDialog({ type: 'none' });
    setCategoryName('');
    setCategoryNameError('');
    setBmName('');
    setBmUrl('');
    setBmDescription('');
    setBmCategoryId('');
    setBmNameError('');
    setBmUrlError('');
  }, []);

  // Category handlers
  const handleCreateCategory = useCallback(() => {
    setCategoryName('');
    setCategoryNameError('');
    setDialog({ type: 'category-create' });
  }, []);

  const handleRenameCategory = useCallback((category: Category) => {
    setCategoryName(category.name);
    setCategoryNameError('');
    setDialog({ type: 'category-rename', category });
  }, []);

  const handleDeleteCategory = useCallback((category: Category) => {
    setDialog({ type: 'category-delete', category });
  }, []);

  const submitCategoryCreate = useCallback(() => {
    if (!categoryName.trim()) {
      setCategoryNameError('Название категории обязательно.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      const newCategory: Category = { id: generateId(), name: categoryName.trim() };
      setCategories((prev) => [...prev, newCategory]);
      setIsSubmitting(false);
      closeDialog();
      showNotification('Категория создана.', 'success');
    }, 300);
  }, [categoryName, closeDialog, showNotification]);

  const submitCategoryRename = useCallback(() => {
    const cat = (dialog as { type: 'category-rename'; category: Category }).category;
    if (!categoryName.trim()) {
      setCategoryNameError('Название категории обязательно.');
      return;
    }
    if (categoryName.trim() === cat.name) {
      closeDialog();
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, name: categoryName.trim() } : c))
      );
      setIsSubmitting(false);
      closeDialog();
      showNotification('Категория переименована.', 'success');
    }, 300);
  }, [categoryName, dialog, closeDialog, showNotification]);

  const submitCategoryDelete = useCallback(() => {
    const cat = (dialog as { type: 'category-delete'; category: Category }).category;
    setIsSubmitting(true);
    setTimeout(() => {
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setBookmarks((prev) => prev.filter((b) => b.categoryId !== cat.id));
      setIsSubmitting(false);
      closeDialog();
      showNotification('Категория удалена.', 'success');
    }, 300);
  }, [dialog, closeDialog, showNotification]);

  // Bookmark handlers
  const handleAddBookmark = useCallback((categoryId: string) => {
    setBmName('');
    setBmUrl('');
    setBmDescription('');
    setBmCategoryId(categoryId);
    setBmNameError('');
    setBmUrlError('');
    setDialog({ type: 'bookmark-create', categoryId });
  }, []);

  const handleEditBookmark = useCallback((bookmark: Bookmark) => {
    setBmName(bookmark.name);
    setBmUrl(bookmark.url);
    setBmDescription(bookmark.description || '');
    setBmCategoryId(bookmark.categoryId);
    setBmNameError('');
    setBmUrlError('');
    setDialog({ type: 'bookmark-edit', bookmark });
  }, []);

  const handleDeleteBookmark = useCallback((bookmark: Bookmark) => {
    setDialog({ type: 'bookmark-delete', bookmark });
  }, []);

  const validateBookmark = useCallback((): boolean => {
    let valid = true;
    if (!bmName.trim()) {
      setBmNameError('Название закладки обязательно.');
      valid = false;
    }
    if (!bmUrl.trim()) {
      setBmUrlError('URL обязателен.');
      valid = false;
    } else if (!isValidUrl(bmUrl.trim())) {
      setBmUrlError('Введите корректный URL с http:// или https://.');
      valid = false;
    }
    return valid;
  }, [bmName, bmUrl]);

  const submitBookmarkCreate = useCallback(() => {
    if (!validateBookmark()) return;
    setIsSubmitting(true);
    setTimeout(() => {
      const newBookmark: Bookmark = {
        id: generateId(),
        name: bmName.trim(),
        url: bmUrl.trim(),
        description: bmDescription.trim() || undefined,
        categoryId: bmCategoryId,
      };
      setBookmarks((prev) => [...prev, newBookmark]);
      setIsSubmitting(false);
      closeDialog();
      showNotification('Закладка добавлена.', 'success');
    }, 300);
  }, [bmName, bmUrl, bmDescription, bmCategoryId, validateBookmark, closeDialog, showNotification]);

  const submitBookmarkEdit = useCallback(() => {
    const bm = (dialog as { type: 'bookmark-edit'; bookmark: Bookmark }).bookmark;
    if (!validateBookmark()) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setBookmarks((prev) =>
        prev.map((b) =>
          b.id === bm.id
            ? { ...b, name: bmName.trim(), url: bmUrl.trim(), description: bmDescription.trim() || undefined, categoryId: bmCategoryId }
            : b
        )
      );
      setIsSubmitting(false);
      closeDialog();
      showNotification('Закладка обновлена.', 'success');
    }, 300);
  }, [bmName, bmUrl, bmDescription, bmCategoryId, dialog, validateBookmark, closeDialog, showNotification]);

  const submitBookmarkDelete = useCallback(() => {
    const bm = (dialog as { type: 'bookmark-delete'; bookmark: Bookmark }).bookmark;
    setIsSubmitting(true);
    setTimeout(() => {
      setBookmarks((prev) => prev.filter((b) => b.id !== bm.id));
      setIsSubmitting(false);
      closeDialog();
      showNotification('Закладка удалена.', 'success');
    }, 300);
  }, [dialog, closeDialog, showNotification]);

  // Field blur validation
  const validateCategoryNameBlur = useCallback(() => {
    if (!categoryName.trim()) {
      setCategoryNameError('Название категории обязательно.');
    } else {
      setCategoryNameError('');
    }
  }, [categoryName]);

  const validateBmNameBlur = useCallback(() => {
    if (!bmName.trim()) {
      setBmNameError('Название закладки обязательно.');
    } else {
      setBmNameError('');
    }
  }, [bmName]);

  const validateBmUrlBlur = useCallback(() => {
    if (!bmUrl.trim()) {
      setBmUrlError('URL обязателен.');
    } else if (!isValidUrl(bmUrl.trim())) {
      setBmUrlError('Введите корректный URL с http:// или https://.');
    } else {
      setBmUrlError('');
    }
  }, [bmUrl]);

  const isDialogOpen = dialog.type !== 'none';

  // Loading skeletons
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="animate-fade-in">
            <div className="animate-skeleton h-5 w-32 rounded mb-3"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[1, 2].map((c) => (
                <div key={c} className="animate-skeleton h-20 rounded-lg"></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
            <i className="ri-bookmark-line text-2xl text-secondary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Нет закладок</h3>
          <p className="text-sm text-foreground-500 mb-6">
            Создайте категорию, чтобы начать добавлять закладки.
          </p>
          <button
            onClick={handleCreateCategory}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
            Создать категорию
          </button>
        </div>

        <Modal
          open={dialog.type === 'category-create'}
          onClose={closeDialog}
          title="Новая категория"
          footer={
            <>
              <button
                onClick={closeDialog}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={submitCategoryCreate}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {isSubmitting ? 'Создание...' : 'Создать'}
              </button>
            </>
          }
        >
          <div>
            <label htmlFor="cat-name" className="block text-sm font-medium text-foreground-700 mb-1.5">
              Название
            </label>
            <input
              id="cat-name"
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              onBlur={validateCategoryNameBlur}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 text-sm text-foreground-900 placeholder:text-foreground-300 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
              placeholder="Мониторинг"
            />
            {categoryNameError && (
              <p className="mt-1 text-xs text-primary-600">{categoryNameError}</p>
            )}
          </div>
        </Modal>
      </div>
    );
  }

  // Normal state
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
          <i className={`${notification.variant === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} w-5 h-5 flex items-center justify-center`}></i>
          {notification.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleCreateCategory}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
          Новая категория
        </button>
      </div>

      <div className="space-y-8">
        {categories.map((cat) => (
          <CategorySection
            key={cat.id}
            category={cat}
            bookmarks={bookmarks.filter((b) => b.categoryId === cat.id)}
            onAddBookmark={handleAddBookmark}
            onEditBookmark={handleEditBookmark}
            onDeleteBookmark={handleDeleteBookmark}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
          />
        ))}
      </div>

      {/* Category Create/Rename Dialog */}
      <Modal
        open={dialog.type === 'category-create' || dialog.type === 'category-rename'}
        onClose={closeDialog}
        title={dialog.type === 'category-rename' ? 'Переименовать категорию' : 'Новая категория'}
        footer={
          <>
            <button
              onClick={closeDialog}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={dialog.type === 'category-rename' ? submitCategoryRename : submitCategoryCreate}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {isSubmitting
                ? dialog.type === 'category-rename'
                  ? 'Сохранение...'
                  : 'Создание...'
                : dialog.type === 'category-rename'
                  ? 'Сохранить'
                  : 'Создать'}
            </button>
          </>
        }
      >
        <div>
          <label htmlFor="cat-name-edit" className="block text-sm font-medium text-foreground-700 mb-1.5">
            Название
          </label>
          <input
            id="cat-name-edit"
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            onBlur={validateCategoryNameBlur}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 text-sm text-foreground-900 placeholder:text-foreground-300 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
            placeholder="Название категории"
          />
          {categoryNameError && (
            <p className="mt-1 text-xs text-primary-600">{categoryNameError}</p>
          )}
        </div>
      </Modal>

      {/* Category Delete Confirm */}
      <Modal
        open={dialog.type === 'category-delete'}
        onClose={closeDialog}
        title="Удалить категорию"
        footer={
          <>
            <button
              onClick={closeDialog}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={submitCategoryDelete}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg bg-primary-600 text-sm font-semibold text-background-50 hover:bg-primary-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {isSubmitting ? 'Удаление...' : 'Удалить'}
            </button>
          </>
        }
      >
        {dialog.type === 'category-delete' && (
          <div>
            <p className="text-sm text-foreground-700">
              Вы уверены, что хотите удалить категорию «{dialog.category.name}»?
            </p>
            {bookmarks.filter((b) => b.categoryId === dialog.category.id).length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary-100/50 px-3 py-2.5">
                <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center shrink-0 text-primary-600 mt-0.5"></i>
                <p className="text-xs text-primary-700">
                  Все закладки в этой категории ({bookmarks.filter((b) => b.categoryId === dialog.category.id).length} шт.) будут также удалены. Это действие необратимо.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bookmark Create/Edit Dialog */}
      <Modal
        open={dialog.type === 'bookmark-create' || dialog.type === 'bookmark-edit'}
        onClose={closeDialog}
        title={dialog.type === 'bookmark-edit' ? 'Изменить закладку' : 'Новая закладка'}
        footer={
          <>
            <button
              onClick={closeDialog}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={dialog.type === 'bookmark-edit' ? submitBookmarkEdit : submitBookmarkCreate}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {isSubmitting
                ? dialog.type === 'bookmark-edit'
                  ? 'Сохранение...'
                  : 'Добавление...'
                : dialog.type === 'bookmark-edit'
                  ? 'Сохранить'
                  : 'Добавить'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="bm-name" className="block text-sm font-medium text-foreground-700 mb-1.5">
              Название
            </label>
            <input
              id="bm-name"
              type="text"
              value={bmName}
              onChange={(e) => setBmName(e.target.value)}
              onBlur={validateBmNameBlur}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 text-sm text-foreground-900 placeholder:text-foreground-300 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
              placeholder="Grafana"
            />
            {bmNameError && <p className="mt-1 text-xs text-primary-600">{bmNameError}</p>}
          </div>

          <div>
            <label htmlFor="bm-url" className="block text-sm font-medium text-foreground-700 mb-1.5">
              URL
            </label>
            <input
              id="bm-url"
              type="url"
              value={bmUrl}
              onChange={(e) => setBmUrl(e.target.value)}
              onBlur={validateBmUrlBlur}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 text-sm text-foreground-900 placeholder:text-foreground-300 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
              placeholder="https://example.com"
            />
            {bmUrlError && <p className="mt-1 text-xs text-primary-600">{bmUrlError}</p>}
          </div>

          <div>
            <label htmlFor="bm-desc" className="block text-sm font-medium text-foreground-700 mb-1.5">
              Описание <span className="text-foreground-400 font-normal">(необязательно)</span>
            </label>
            <input
              id="bm-desc"
              type="text"
              value={bmDescription}
              onChange={(e) => setBmDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 text-sm text-foreground-900 placeholder:text-foreground-300 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
              placeholder="Дашборды и визуализация метрик"
            />
          </div>

          {isDialogOpen && (dialog.type === 'bookmark-create' || dialog.type === 'bookmark-edit') && (
            <div>
              <label htmlFor="bm-category" className="block text-sm font-medium text-foreground-700 mb-1.5">
                Категория
              </label>
              <select
                id="bm-category"
                value={bmCategoryId}
                onChange={(e) => setBmCategoryId(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 text-sm text-foreground-900 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50 cursor-pointer"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* Bookmark Delete Confirm */}
      <Modal
        open={dialog.type === 'bookmark-delete'}
        onClose={closeDialog}
        title="Удалить закладку"
        footer={
          <>
            <button
              onClick={closeDialog}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={submitBookmarkDelete}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg bg-primary-600 text-sm font-semibold text-background-50 hover:bg-primary-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {isSubmitting ? 'Удаление...' : 'Удалить'}
            </button>
          </>
        }
      >
        {dialog.type === 'bookmark-delete' && (
          <p className="text-sm text-foreground-700">
            Вы уверены, что хотите удалить закладку «{dialog.bookmark.name}»?
          </p>
        )}
      </Modal>
    </div>
  );
}