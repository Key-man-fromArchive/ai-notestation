import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AttachmentContextMenu, type ContextMenuItem } from '@/components/AttachmentContextMenu'

const makeItems = (overrides: Partial<ContextMenuItem>[] = []): ContextMenuItem[] => {
  const defaults: ContextMenuItem[] = [
    { icon: <span data-testid="icon-ocr">O</span>, label: 'Text recognition', onClick: vi.fn() },
    { icon: <span data-testid="icon-view">V</span>, label: 'View text', onClick: vi.fn() },
  ]
  return defaults.map((item, i) => ({ ...item, ...(overrides[i] || {}) }))
}

const defaultProps = {
  x: 100,
  y: 200,
  onClose: vi.fn(),
}

describe('AttachmentContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all menu items with labels', () => {
    const items = makeItems()
    render(<AttachmentContextMenu {...defaultProps} items={items} />)
    expect(screen.getByText('Text recognition')).toBeInTheDocument()
    expect(screen.getByText('View text')).toBeInTheDocument()
  })

  it('disabled item does not trigger onClick', () => {
    const onClick = vi.fn()
    const items = makeItems([{ disabled: true, onClick }])
    render(<AttachmentContextMenu {...defaultProps} items={items} />)
    const btn = screen.getByText('Text recognition').closest('button')!
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('loading item shows spinner', () => {
    const items = makeItems([{ loading: true }])
    const { container } = render(<AttachmentContextMenu {...defaultProps} items={items} />)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('backdrop click calls onClose', () => {
    const items = makeItems()
    const { container } = render(<AttachmentContextMenu {...defaultProps} items={items} />)
    // Backdrop is fixed inset-0 z-[59]
    const backdrop = container.querySelector('.fixed.inset-0')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})
