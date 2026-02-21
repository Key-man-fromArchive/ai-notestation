import { Link } from 'react-router-dom'
import { Bell, MessageCircle, AtSign, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications'
import { useTranslation } from 'react-i18next'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

function NotificationIcon({ type }: { type: NotificationItem['type'] }) {
  if (type === 'comment_added') {
    return <MessageCircle className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
  }
  return <AtSign className="h-4 w-4 text-violet-500 dark:text-violet-400 shrink-0" />
}

export function NotificationSection() {
  const { t } = useTranslation()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()

  if (notifications.length === 0) return null

  const displayItems = notifications.slice(0, 10)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="text-lg font-semibold">{t('notifications.title')}</h3>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      <ul className="space-y-1.5" role="list">
        {displayItems.map((n) => (
          <li key={n.id}>
            <Link
              to={`/notes/${n.synology_note_id}`}
              onClick={() => {
                if (!n.is_read) markRead([n.id])
              }}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border border-border transition-colors duration-200',
                'hover:border-primary/30 hover:bg-muted/30',
                !n.is_read && 'bg-primary/5 dark:bg-primary/10'
              )}
            >
              {/* Unread dot */}
              <div className="flex items-center gap-2 mt-0.5 shrink-0">
                <div className={cn(
                  'h-2 w-2 rounded-full',
                  !n.is_read ? 'bg-blue-500' : 'bg-transparent'
                )} />
                <NotificationIcon type={n.type} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm text-foreground',
                  !n.is_read && 'font-medium'
                )}>
                  <span className="font-semibold">{n.actor_name}</span>
                  {' '}
                  {n.type === 'comment_added'
                    ? t('notifications.commentedOn')
                    : t('notifications.mentionedYouIn')}
                  {' '}
                  <span className="text-primary">{n.note_title}</span>
                </p>
                {n.created_at && (
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(n.created_at)}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {notifications.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('notifications.allCaughtUp')}
        </p>
      )}
    </div>
  )
}
