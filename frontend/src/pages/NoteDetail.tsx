import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useNote } from '@/hooks/useNote'
import { useTabStore } from '@/stores/useTabStore'
import { EditorPane } from '@/components/editor/EditorPane'
import { SplitEditorLayout } from '@/components/editor/SplitEditorLayout'

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: note } = useNote(id)
  const openTab = useTabStore((s) => s.openTab)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activateTab = useTabStore((s) => s.activateTab)
  const splitMode = useTabStore((s) => s.splitMode)
  const leftPaneTabId = useTabStore((s) => s.leftPaneTabId)
  const rightPaneTabId = useTabStore((s) => s.rightPaneTabId)

  // Open/activate tab when note loads
  useEffect(() => {
    if (note) {
      openTab(note.note_id, note.title)
    }
  }, [note, openTab])

  // Sync URL with active tab
  useEffect(() => {
    if (id && activeTabId !== id) {
      activateTab(id)
    }
  }, [id, activeTabId, activateTab])

  // Split view
  if (splitMode === 'horizontal' && leftPaneTabId && rightPaneTabId) {
    return <SplitEditorLayout leftNoteId={leftPaneTabId} rightNoteId={rightPaneTabId} />
  }

  return <EditorPane noteId={id} />
}
