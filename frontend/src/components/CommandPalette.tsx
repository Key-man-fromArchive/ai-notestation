// @TASK v3.0.0-T3 - Command Palette Component
// @SPEC docs/roadmap/UI_UX_INNOVATION_ROADMAP.md#foundation-ux

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Command } from 'cmdk'
import {
  Home,
  FileText,
  BookOpen,
  Search,
  BookOpenCheck,
  Sparkles,
  Settings,
  Users,
  Activity,
  Network,
  PlusCircle,
  RefreshCw,
} from 'lucide-react'
import { useQuickSearch } from '@/hooks/useQuickSearch'
import { cn } from '@/lib/utils'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Command Palette component using cmdk
 * - Keyboard-driven command interface
 * - Page navigation
 * - Quick note search
 * - Quick actions (New Note, Sync)
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { data: quickSearchData } = useQuickSearch(search)

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setSearch('')
    }
  }, [open])

  const pages = [
    { to: '/', icon: Home, label: t('sidebar.dashboard') },
    { to: '/notes', icon: FileText, label: t('sidebar.notes') },
    { to: '/notebooks', icon: BookOpen, label: t('sidebar.notebooks') },
    { to: '/search', icon: Search, label: t('sidebar.search') },
    { to: '/ai', icon: Sparkles, label: t('sidebar.aiAnalysis') },
    { to: '/graph', icon: Network, label: t('sidebar.graph') },
    { to: '/librarian', icon: BookOpenCheck, label: t('sidebar.librarian') },
    { to: '/members', icon: Users, label: t('sidebar.members') },
    { to: '/settings', icon: Settings, label: t('sidebar.settings') },
    { to: '/operations', icon: Activity, label: t('sidebar.operations') },
  ]

  const handleSelectPage = (to: string) => {
    navigate(to)
    onOpenChange(false)
  }

  const handleSelectNote = (noteId: string) => {
    navigate(`/notes/${noteId}`)
    onOpenChange(false)
  }

  const handleNewNote = () => {
    navigate('/notes')
    onOpenChange(false)
    // TODO: Trigger new note creation modal/action
  }

  const handleSync = () => {
    onOpenChange(false)
    // TODO: Trigger sync action
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]"
      label={t('commandPalette.placeholder')}
    >
      <div className="max-w-lg w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <Command className="w-full">
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder={t('commandPalette.placeholder')}
            className="w-full border-b border-border px-4 py-3 text-sm bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
          />

          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('commandPalette.noResults')}
            </Command.Empty>

            {/* Pages Group */}
            <Command.Group
              heading={t('commandPalette.pages')}
              className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {pages.map((page) => (
                <Command.Item
                  key={page.to}
                  value={`${page.label} ${page.to}`}
                  onSelect={() => handleSelectPage(page.to)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 text-sm cursor-pointer rounded-lg',
                    'text-foreground',
                    'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                    'transition-colors duration-150'
                  )}
                >
                  <page.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{page.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Quick Actions Group */}
            <Command.Group
              heading={t('commandPalette.quickActions')}
              className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              <Command.Item
                value="new-note"
                onSelect={handleNewNote}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 text-sm cursor-pointer rounded-lg',
                  'text-foreground',
                  'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                  'transition-colors duration-150'
                )}
              >
                <PlusCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('commandPalette.newNote')}</span>
              </Command.Item>

              <Command.Item
                value="sync"
                onSelect={handleSync}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 text-sm cursor-pointer rounded-lg',
                  'text-foreground',
                  'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                  'transition-colors duration-150'
                )}
              >
                <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Sync</span>
              </Command.Item>
            </Command.Group>

            {/* Notes Search Results (only when searching) */}
            {search.length >= 2 && quickSearchData && quickSearchData.items.length > 0 && (
              <Command.Group
                heading={t('commandPalette.notes')}
                className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {quickSearchData.items.map((note) => (
                  <Command.Item
                    key={note.note_id}
                    value={`note-${note.note_id} ${note.title}`}
                    onSelect={() => handleSelectNote(note.note_id)}
                    className={cn(
                      'flex flex-col gap-0.5 px-4 py-2 text-sm cursor-pointer rounded-lg',
                      'text-foreground',
                      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                      'transition-colors duration-150'
                    )}
                  >
                    <div className="font-medium">{note.title}</div>
                    {note.notebook && (
                      <div className="text-xs text-muted-foreground">{note.notebook}</div>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </Command.Dialog>
  )
}
