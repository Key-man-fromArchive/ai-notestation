import { Group, Panel, Separator } from 'react-resizable-panels'
import { EditorPane } from './EditorPane'

interface SplitEditorLayoutProps {
  leftNoteId: string
  rightNoteId: string
}

export function SplitEditorLayout({ leftNoteId, rightNoteId }: SplitEditorLayoutProps) {
  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={50} minSize={30}>
        <EditorPane noteId={leftNoteId} />
      </Panel>
      <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors data-[active]:bg-primary" />
      <Panel defaultSize={50} minSize={30}>
        <EditorPane noteId={rightNoteId} />
      </Panel>
    </Group>
  )
}
