// @TASK P0-T0.4 - App 컴포넌트 기본 테스트
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#테스트
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('렌더링 시 LabNote AI 제목이 표시되어야 함', () => {
    render(<App />)
    expect(screen.getByText('LabNote AI')).toBeInTheDocument()
  })

  it('메인 설명 텍스트가 표시되어야 함', () => {
    render(<App />)
    expect(
      screen.getByText('Synology NoteStation enhanced with AI'),
    ).toBeInTheDocument()
  })
})
