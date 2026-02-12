import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AlertCircle, CheckCircle } from 'lucide-react'

/**
 * OAuth 콜백 페이지
 * - URL에서 code, state 추출
 * - Backend callback API 호출
 * - 성공 시 /settings로 리다이렉트
 * - 실패 시 에러 표시
 */
export default function OAuthCallback() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const provider = sessionStorage.getItem('oauth_provider') || 'google'

    if (!code || !state) {
      setStatus('error')
      setErrorMessage(t('auth.oauthError'))
      return
    }

    const exchange = async () => {
      try {
        await apiClient.post(`/oauth/${provider}/callback`, { code, state })
        sessionStorage.removeItem('oauth_provider')
        setStatus('success')
        // Redirect to settings after short delay
        setTimeout(() => navigate('/settings', { replace: true }), 1500)
      } catch (err) {
        setStatus('error')
        setErrorMessage(
          err instanceof Error ? err.message : t('auth.oauthError')
        )
      }
    }

    exchange()
  }, [searchParams, navigate, t])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      {status === 'processing' && (
        <>
          <LoadingSpinner />
          <p className="text-muted-foreground">{t('auth.oauthProcessing')}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle className="h-12 w-12 text-green-600" />
          <p className="text-lg font-medium">{t('common.saved')}</p>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.goToSettings')}
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-lg font-medium">{t('auth.oauthError')}</p>
          <p className="text-sm text-destructive">{errorMessage}</p>
          <button
            onClick={() => navigate('/settings', { replace: true })}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {t('settings.title')}
          </p>
        </>
      )}
    </div>
  )
}
