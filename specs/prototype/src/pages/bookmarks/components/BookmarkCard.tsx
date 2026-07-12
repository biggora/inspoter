import { useState, useRef, useEffect } from 'react';
import type { Bookmark } from '@/mocks/bookmarks';

interface BookmarkCardProps {
  bookmark: Bookmark;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

const initialsColors = [
  'bg-primary-100 text-primary-700',
  'bg-accent-100 text-accent-700',
  'bg-secondary-100 text-secondary-700',
];

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % initialsColors.length;
}

export default function BookmarkCard({ bookmark, onEdit, onDelete }: BookmarkCardProps) {
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

  const initials = getInitials(bookmark.name);
  const colorClass = initialsColors[getColorIndex(bookmark.name)];

  return (
    <div className="group relative flex items-start gap-3 p-3 rounded-lg border border-background-200 bg-background-50 hover:border-background-300 transition-colors">
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-sm no-underline cursor-pointer"
        onClick={(e) => {
          if (menuOpen) e.preventDefault();
        }}
      >
        <span className={`w-full h-full rounded-lg flex items-center justify-center font-semibold text-sm ${colorClass}`}>
          {initials}
        </span>
      </a>

      <div className="flex-1 min-w-0">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-medium text-sm text-foreground-900 truncate hover:text-primary-600 transition-colors no-underline"
          onClick={(e) => {
            if (menuOpen) e.preventDefault();
          }}
        >
          {bookmark.name}
        </a>
        {bookmark.description && (
          <p className="text-xs text-foreground-500 mt-0.5 line-clamp-1">{bookmark.description}</p>
        )}
        <p className="text-xs text-foreground-400 mt-1 truncate">{bookmark.url}</p>
      </div>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          aria-label="Меню закладки"
        >
          <i className="ri-more-2-fill text-base"></i>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-background-200 bg-background-50 py-1 shadow-lg animate-scale-in z-30">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onEdit(bookmark);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-edit-line w-5 h-5 flex items-center justify-center"></i>
              Изменить
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(bookmark);
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
  );
}