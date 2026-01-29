// @TASK P0-T0.4 - 유틸리티 함수
// @SPEC docs/plans/2026-01-29-labnote-ai-design.md#프론트엔드
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * TailwindCSS 클래스 병합 유틸리티
 * clsx + tailwind-merge를 결합하여 조건부 클래스와 충돌 해결을 동시에 처리
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
