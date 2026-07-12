import { useState, useRef, useEffect } from 'react';
import type { Bookmark, Category } from '@/mocks/bookmarks';
import BookmarkCard from './BookmarkCard';

interface CategorySectionProps {
  category: Category;
  bookmarks: Bookmark[];
  onAddBookmark: (categoryId: string) => void;
  onEditBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  onRenameCategory: (category: Category) => void;
  onDeleteCategory: (category: Category) => void;
}

export default function CategorySection({
  category,
  bookmarks,
  onAddBookmark,
  onEditBookmark,
  onDeleteBookmark,
  onRenameCategory,
  onDeleteCategory,
}: CategorySectionProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <section className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-heading text-sm font-semibold text-foreground-800">{category.name}</h4>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAddBookmark(category.id)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
            Добавить
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer"
              aria-label="Меню категории"
            >
              <i className="ri-more-2-fill text-base"></i>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-background-200 bg-background-50 py-1 shadow-lg animate-scale-in z-20">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onRenameCategory(category);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-edit-line w-5 h-5 flex items-center justify-center"></i>
                  Переименовать
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteCategory(category);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-delete-bin-line w-5 h-5 flex items-center justify-center"></i>
                  Удалить
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {bookmarks.length === 0 ? (
        <p className="text-xs text-foreground-400 py-3">Нет закладок в этой категории</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {bookmarks.map((bm) => (
            <BookmarkCard
              key={bm.id}
              bookmark={bm}
              onEdit={onEditBookmark}
              onDelete={onDeleteBookmark}
            />
          ))}
        </div>
      )}
    </section>
  );
}