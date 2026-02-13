import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExtractedTextModal } from '@/components/ExtractedTextModal'

// Mock MarkdownRenderer to avoid react-markdown complexity in tests
vi.mock('@/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}))

const defaultProps = {
  title: 'test-image.png',
  text: 'Recognized text content',
  onClose: vi.fn(),
}

describe('ExtractedTextModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title and text', () => {
    render(<ExtractedTextModal {...defaultProps} />)
    expect(screen.getByText('test-image.png')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('Recognized text content')
  })

  it('shows page count badge when pageCount provided', () => {
    render(<ExtractedTextModal {...defaultProps} pageCount={5} />)
    expect(screen.getByText('(5p)')).toBeInTheDocument()
  })

  it('hides page count badge when not provided', () => {
    render(<ExtractedTextModal {...defaultProps} />)
    expect(screen.queryByText(/\(\d+p\)/)).not.toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    render(<ExtractedTextModal {...defaultProps} />)
    const closeButton = screen.getByRole('button')
    fireEvent.click(closeButton)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key', () => {
    render(<ExtractedTextModal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click', () => {
    const { container } = render(<ExtractedTextModal {...defaultProps} />)
    // Backdrop is the first child div with bg-black/50
    const backdrop = container.querySelector('.bg-black\\/50')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})
