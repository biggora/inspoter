import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { mockEmails } from '@/mocks/emails';
import type { Email } from '@/mocks/emails';

type PageState = 'loading' | 'error' | 'ready';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.55 0.18 ${hue})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MailDetailPage() {
  const { emailId } = useParams<{ emailId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [email, setEmail] = useState<Email | null>(null);

  const loadEmail = useCallback(() => {
    setPageState('loading');
    setTimeout(() => {
      const found = mockEmails.find((e) => e.id === emailId);
      if (!found) {
        setPageState('error');
        return;
      }
      setEmail(found);
      setPageState('ready');
    }, 400);
  }, [emailId]);

  useEffect(() => {
    loadEmail();
  }, [loadEmail]);

  const handleBack = () => {
    const params = searchParams.toString();
    navigate(`/mail${params ? `?${params}` : ''}`);
  };

  // Loading skeleton
  if (pageState === 'loading') {
    return (
      <div className="p-6 animate-fade-in">
        <div className="flex items-center gap-2 mb-5">
          <div className="animate-skeleton h-8 w-20 rounded-lg"></div>
        </div>
        <div className="animate-skeleton h-7 w-3/4 rounded mb-4"></div>
        <div className="flex items-center gap-3 mb-6">
          <div className="animate-skeleton w-10 h-10 rounded-full"></div>
          <div className="space-y-1.5">
            <div className="animate-skeleton h-4 w-28 rounded"></div>
            <div className="animate-skeleton h-3 w-36 rounded"></div>
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="animate-skeleton h-4 rounded" style={{ width: `${60 + Math.random() * 40}%` }}></div>
          ))}
        </div>
      </div>
    );
  }

  // Error — email not found
  if (pageState === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-mail-close-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">Письмо не найдено</h3>
          <p className="text-sm text-foreground-500 mb-6">
            Это письмо могло быть удалено или его ID указан неверно.
          </p>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-left-line w-5 h-5 flex items-center justify-center"></i>
            Назад к почте
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-in">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 mb-5 text-xs font-medium text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap"
      >
        <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
        Назад к почте
      </button>

      {/* Subject */}
      <h2 className="font-heading text-lg font-semibold text-foreground-900 mb-4">{email?.subject}</h2>

      {/* Sender info */}
      <div className="flex items-start gap-3 mb-6 pb-5 border-b border-background-100">
        <div
          className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold text-background-50"
          style={{ backgroundColor: email ? stringToColor(email.fromName) : '#999' }}
        >
          {email ? getInitials(email.fromName) : '?'}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground-900">{email?.fromName}</p>
          <p className="text-xs text-foreground-400">{email?.from}</p>
          <p className="text-xs text-foreground-400 mt-0.5">{email ? formatTime(email.receivedAt) : ''}</p>
        </div>
      </div>

      {/* Body */}
      <div
        className="text-sm text-foreground-800 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: email?.bodyHtml || '' }}
      />
    </div>
  );
}