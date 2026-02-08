// @TASK P4-T4.4 - DiscoveryGraph Component Tests
// @TEST frontend/src/components/DiscoveryGraph.tsx

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)

import { DiscoveryGraph, CLUSTER_COLORS, UNCLUSTERED_COLOR, getClusterColor } from '@/components/DiscoveryGraph'
import * as useDiscoveryModule from '@/hooks/useDiscovery'

vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(({ graphData, nodeColor, onNodeClick }) => (
    <div data-testid="force-graph-2d">
      <div data-testid="node-count">{graphData.nodes.length}</div>
      <div data-testid="link-count">{graphData.links.length}</div>
      {graphData.nodes.map((node: { id: number; label: string; cluster_id: number }) => (
        <button
          key={node.id}
          data-testid={`node-${node.id}`}
          data-color={nodeColor(node)}
          onClick={() => onNodeClick?.(node)}
        >
          {node.label}
        </button>
      ))}
    </div>
  )),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('DiscoveryGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner when data is loading', () => {
    vi.spyOn(useDiscoveryModule, 'useGraphData').mockReturnValue({
      nodes: [],
      links: [],
      totalNotes: 0,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    render(<DiscoveryGraph notebookId={1} />, { wrapper: createWrapper() })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows error message when fetch fails', () => {
    vi.spyOn(useDiscoveryModule, 'useGraphData').mockReturnValue({
      nodes: [],
      links: [],
      totalNotes: 0,
      isLoading: false,
      error: new Error('Network error'),
      refetch: vi.fn(),
    })

    render(<DiscoveryGraph notebookId={1} />, { wrapper: createWrapper() })

    expect(screen.getByText('그래프를 불러오는 중 오류가 발생했습니다.')).toBeInTheDocument()
  })

  it('shows empty state when no nodes', () => {
    vi.spyOn(useDiscoveryModule, 'useGraphData').mockReturnValue({
      nodes: [],
      links: [],
      totalNotes: 0,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<DiscoveryGraph notebookId={1} />, { wrapper: createWrapper() })

    expect(screen.getByText('노트가 없습니다')).toBeInTheDocument()
    expect(screen.getByText('노트북에 노트를 추가하면 그래프가 표시됩니다.')).toBeInTheDocument()
  })

  it('renders graph with nodes and links', () => {
    vi.spyOn(useDiscoveryModule, 'useGraphData').mockReturnValue({
      nodes: [
        { id: 1, label: 'Note 1', cluster_id: 0 },
        { id: 2, label: 'Note 2', cluster_id: 1 },
        { id: 3, label: 'Note 3', cluster_id: -1 },
      ],
      links: [
        { source: 1, target: 2, weight: 0.5 },
        { source: 2, target: 3, weight: 0.3 },
      ],
      totalNotes: 10,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<DiscoveryGraph notebookId={1} />, { wrapper: createWrapper() })

    expect(screen.getByTestId('force-graph-2d')).toBeInTheDocument()
    expect(screen.getByTestId('node-count')).toHaveTextContent('3')
    expect(screen.getByTestId('link-count')).toHaveTextContent('2')
  })

  it('displays note count indicator', () => {
    vi.spyOn(useDiscoveryModule, 'useGraphData').mockReturnValue({
      nodes: [
        { id: 1, label: 'Note 1', cluster_id: 0 },
        { id: 2, label: 'Note 2', cluster_id: 1 },
      ],
      links: [],
      totalNotes: 50,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<DiscoveryGraph notebookId={1} />, { wrapper: createWrapper() })

    expect(screen.getByText('2 / 50 노트')).toBeInTheDocument()
  })

  it('calls onNodeClick when node is clicked', async () => {
    const handleNodeClick = vi.fn()

    vi.spyOn(useDiscoveryModule, 'useGraphData').mockReturnValue({
      nodes: [
        { id: 1, label: 'Note 1', cluster_id: 0 },
        { id: 2, label: 'Note 2', cluster_id: 1 },
      ],
      links: [],
      totalNotes: 2,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<DiscoveryGraph notebookId={1} onNodeClick={handleNodeClick} />, {
      wrapper: createWrapper(),
    })

    const node1Button = screen.getByTestId('node-1')
    node1Button.click()

    expect(handleNodeClick).toHaveBeenCalledWith(1)
  })

  it('colors nodes based on cluster_id', () => {
    vi.spyOn(useDiscoveryModule, 'useGraphData').mockReturnValue({
      nodes: [
        { id: 1, label: 'Note 1', cluster_id: 0 },
        { id: 2, label: 'Note 2', cluster_id: 1 },
        { id: 3, label: 'Note 3', cluster_id: -1 },
      ],
      links: [],
      totalNotes: 3,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<DiscoveryGraph notebookId={1} />, { wrapper: createWrapper() })

    expect(screen.getByTestId('node-1')).toHaveAttribute('data-color', CLUSTER_COLORS[0])
    expect(screen.getByTestId('node-2')).toHaveAttribute('data-color', CLUSTER_COLORS[1])
    expect(screen.getByTestId('node-3')).toHaveAttribute('data-color', UNCLUSTERED_COLOR)
  })
})

describe('getClusterColor', () => {
  it('returns unclustered color for negative cluster_id', () => {
    expect(getClusterColor(-1)).toBe(UNCLUSTERED_COLOR)
    expect(getClusterColor(-5)).toBe(UNCLUSTERED_COLOR)
  })

  it('returns correct color for valid cluster_id', () => {
    expect(getClusterColor(0)).toBe(CLUSTER_COLORS[0])
    expect(getClusterColor(1)).toBe(CLUSTER_COLORS[1])
    expect(getClusterColor(5)).toBe(CLUSTER_COLORS[5])
  })

  it('wraps around for cluster_id >= CLUSTER_COLORS.length', () => {
    expect(getClusterColor(10)).toBe(CLUSTER_COLORS[0])
    expect(getClusterColor(11)).toBe(CLUSTER_COLORS[1])
    expect(getClusterColor(20)).toBe(CLUSTER_COLORS[0])
  })
})

describe('CLUSTER_COLORS', () => {
  it('has 10 distinct colors', () => {
    expect(CLUSTER_COLORS).toHaveLength(10)
    const uniqueColors = new Set(CLUSTER_COLORS)
    expect(uniqueColors.size).toBe(10)
  })

  it('contains valid hex color codes', () => {
    const hexColorPattern = /^#[0-9a-fA-F]{6}$/
    CLUSTER_COLORS.forEach(color => {
      expect(color).toMatch(hexColorPattern)
    })
  })
})
