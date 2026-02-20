import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api'
import { useOAuth } from '@/hooks/useOAuth'
import { cn } from '@/lib/utils'
import {
  Info,
  CheckCircle,
  Unlink,
  Link2,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Smartphone,
  Loader2,
  Key,
} from 'lucide-react'

interface OAuthSectionProps {
  provider: string
  label: string
}

type UIMode = 'browser' | 'device'

export function OAuthSection({ provider, label }: OAuthSectionProps) {
  const { t } = useTranslation()
  const {
    configured,
    connected,
    email,
    authMode,
    isConnecting,
    isDisconnecting,
    connectError,
    connect,
    authUrl,
    authState,
    disconnect,
    exchangeCode,
    isExchangingCode,
    callbackError,
    startDeviceFlow,
    deviceFlowData,
    isStartingDeviceFlow,
    deviceFlowError,
    pollDeviceToken,
    isPollingDevice,
  } = useOAuth(provider)

  const [copied, setCopied] = useState(false)
  const [uiMode, setUiMode] = useState<UIMode>('browser')
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null)
  const [pastedCode, setPastedCode] = useState('')
  const [codeExchangeStatus, setCodeExchangeStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle')
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const pollCountRef = useRef(0)

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }
    pollCountRef.current = 0
  }, [])

  const pollForToken = useCallback(async () => {
    if (!deviceFlowData?.device_code) return

    try {
      const result = await pollDeviceToken(deviceFlowData.device_code)

      if (result.status === 'completed') {
        setDeviceStatus('completed')
        stopPolling()
        return
      }

      if (result.status === 'expired' || result.status === 'denied') {
        setDeviceStatus(result.status)
        stopPolling()
        return
      }

      pollCountRef.current++
      const maxPolls = Math.ceil(
        deviceFlowData.expires_in / deviceFlowData.interval,
      )
      if (pollCountRef.current >= maxPolls) {
        setDeviceStatus('expired')
        stopPolling()
        return
      }

      const interval =
        result.status === 'slow_down'
          ? (deviceFlowData.interval + 5) * 1000
          : deviceFlowData.interval * 1000

      pollingRef.current = setTimeout(pollForToken, interval)
    } catch {
      setDeviceStatus('error')
      stopPolling()
    }
  }, [deviceFlowData, pollDeviceToken, stopPolling])

  useEffect(() => {
    if (deviceFlowData && uiMode === 'device' && !deviceStatus) {
      const initialDelay = deviceFlowData.interval * 1000
      pollingRef.current = setTimeout(pollForToken, initialDelay)
    }
    return () => stopPolling()
  }, [deviceFlowData, uiMode, deviceStatus, pollForToken, stopPolling])

  useEffect(() => {
    if (connected) {
      stopPolling()
      setDeviceStatus(null)
      setPastedCode('')
      setCodeExchangeStatus('idle')
    }
  }, [connected, stopPolling])

  const handleConnect = async () => {
    setCopied(false)
    setPastedCode('')
    setCodeExchangeStatus('idle')
    await connect()
  }

  const handleDeviceConnect = async () => {
    setCopied(false)
    setDeviceStatus(null)
    stopPolling()
    await startDeviceFlow()
  }

  const handleCopy = async (text: string | null) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleCodePasteSubmit = async () => {
    if (!pastedCode.trim() || !authState) return

    try {
      setCodeExchangeStatus('idle')
      await exchangeCode({ code: pastedCode.trim(), state: authState })
      setCodeExchangeStatus('success')
    } catch {
      setCodeExchangeStatus('error')
    }
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/50 border border-input rounded-md">
        <Info
          className="h-4 w-4 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
        <span className="text-sm text-muted-foreground">
          {label} {t('common.oauthNotConfigured', 'OAuth not configured')}
        </span>
      </div>
    )
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-500/10 dark:bg-green-900/30 border border-green-500/20 dark:border-green-700/40 rounded-md">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            {label} {t('common.connected', 'Connected')}
          </span>
          {email && (
            <span className="text-xs text-muted-foreground">({email})</span>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          disabled={isDisconnecting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'border border-destructive/30 text-destructive',
            'hover:bg-destructive/10 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
          {t('common.disconnect', 'Disconnect')}
        </button>
      </div>
    )
  }

  if (authMode === 'api_key') {
    return <ApiKeySection provider={provider} label={label} />
  }

  if (authMode === 'code_paste') {
    return (
      <div className="space-y-3">
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className={cn(
            'flex items-center gap-2 w-full px-4 py-2.5 rounded-md',
            'border border-primary/30 text-primary',
            'hover:bg-primary/5 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {isConnecting ? t('settings.oauthLinkGenerating') : t('settings.oauthConnectWith', { label })}
        </button>

        {authUrl && (
          <div className="p-3 bg-muted/50 border border-input rounded-md space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                {t('settings.oauthStep1')}
              </p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={authUrl}
                  readOnly
                  className="flex-1 px-2 py-1.5 text-xs font-mono bg-background border border-input rounded-md truncate"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => handleCopy(authUrl)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0',
                    'border border-input hover:bg-muted transition-colors',
                    copied && 'text-green-600 border-green-500/30',
                  )}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0 border border-input hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('settings.oauthOpen')}
                </a>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">
                {t('settings.oauthStep2')}
              </p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={pastedCode}
                  onChange={e => setPastedCode(e.target.value)}
                  placeholder={t('settings.oauthCodePlaceholder')}
                  className="flex-1 px-2 py-1.5 text-sm font-mono bg-background border border-input rounded-md"
                  onKeyDown={e => e.key === 'Enter' && handleCodePasteSubmit()}
                />
                <button
                  onClick={handleCodePasteSubmit}
                  disabled={!pastedCode.trim() || isExchangingCode}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 text-xs rounded-md shrink-0',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {isExchangingCode ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {t('common.confirm')}
                </button>
              </div>
            </div>

            {codeExchangeStatus === 'success' && (
              <div className="flex items-center gap-2 p-2 bg-green-500/10 dark:bg-green-900/30 border border-green-500/20 dark:border-green-700/40 rounded-md">
                <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                <span className="text-xs text-green-700 dark:text-green-400">
                  {t('settings.oauthAuthComplete')}
                </span>
              </div>
            )}

            {(codeExchangeStatus === 'error' || callbackError) && (
              <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs text-destructive">
                  {t('settings.oauthCodeExchangeFailed')}
                </span>
              </div>
            )}
          </div>
        )}

        {connectError && (
          <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="text-xs text-destructive">
              {t('settings.oauthConnectionFailed')}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => setUiMode('browser')}
          className={cn(
            'flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors',
            uiMode === 'browser'
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'border-input hover:bg-muted',
          )}
        >
          <Link2 className="h-3.5 w-3.5 inline mr-1.5" aria-hidden="true" />
          {t('settings.oauthBrowserAuth')}
        </button>
        <button
          onClick={() => setUiMode('device')}
          className={cn(
            'flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors',
            uiMode === 'device'
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'border-input hover:bg-muted',
          )}
        >
          <Smartphone className="h-3.5 w-3.5 inline mr-1.5" aria-hidden="true" />
          {t('settings.oauthDeviceAuth')}
        </button>
      </div>

      {uiMode === 'browser' ? (
        <>
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={cn(
              'flex items-center gap-2 w-full px-4 py-2.5 rounded-md',
              'border border-primary/30 text-primary',
              'hover:bg-primary/5 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {isConnecting ? t('settings.oauthLinkGenerating') : t('settings.oauthConnectWith', { label })}
          </button>

          {authUrl && (
            <div className="p-3 bg-muted/50 border border-input rounded-md space-y-2">
              <p className="text-xs text-muted-foreground">
                {t('settings.oauthBrowserInstructions')}
              </p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={authUrl}
                  readOnly
                  className="flex-1 px-2 py-1.5 text-xs font-mono bg-background border border-input rounded-md truncate"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => handleCopy(authUrl)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0',
                    'border border-input hover:bg-muted transition-colors',
                    copied && 'text-green-600 border-green-500/30',
                  )}
                  title={t('common.copy')}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? t('common.copied') : t('common.copy')}
                </button>
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md shrink-0 border border-input hover:bg-muted transition-colors"
                  title={t('settings.oauthOpen')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('settings.oauthOpen')}
                </a>
              </div>
            </div>
          )}

          {connectError && (
            <div
              className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md"
              role="alert"
            >
              <AlertCircle
                className="h-3.5 w-3.5 text-destructive shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs text-destructive">
                {t('settings.oauthConnectionFailed')}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            onClick={handleDeviceConnect}
            disabled={isStartingDeviceFlow || isPollingDevice}
            className={cn(
              'flex items-center gap-2 w-full px-4 py-2.5 rounded-md',
              'border border-primary/30 text-primary',
              'hover:bg-primary/5 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            {isStartingDeviceFlow ? t('settings.oauthDeviceGenerating') : t('settings.oauthDeviceIssue')}
          </button>

          {deviceFlowData && !deviceStatus && (
            <div className="p-4 bg-muted/50 border border-input rounded-md space-y-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  {t('settings.oauthDeviceInstructions')}
                </p>
                <a
                  href={
                    deviceFlowData.verification_uri_complete ||
                    deviceFlowData.verification_uri
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  {deviceFlowData.verification_uri}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('settings.oauthAuthCode')}</p>
                <code className="text-2xl font-bold tracking-widest text-primary">
                  {deviceFlowData.user_code}
                </code>
                <button
                  onClick={() => handleCopy(deviceFlowData.user_code)}
                  className="ml-2 p-1.5 rounded hover:bg-muted transition-colors"
                  title={t('settings.oauthCopyCode')}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('settings.oauthWaitingAuth')}
              </div>
            </div>
          )}

          {deviceStatus === 'completed' && (
            <div className="flex items-center gap-2 p-2 bg-green-500/10 dark:bg-green-900/30 border border-green-500/20 dark:border-green-700/40 rounded-md">
              <CheckCircle
                className="h-3.5 w-3.5 text-green-600 dark:text-green-400"
                aria-hidden="true"
              />
              <span className="text-xs text-green-700 dark:text-green-400">
                {t('settings.oauthAuthComplete')}
              </span>
            </div>
          )}

          {(deviceStatus === 'expired' || deviceStatus === 'denied') && (
            <div
              className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md"
              role="alert"
            >
              <AlertCircle
                className="h-3.5 w-3.5 text-destructive shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs text-destructive">
                {deviceStatus === 'expired'
                  ? t('settings.oauthCodeExpired')
                  : t('settings.oauthAuthDenied')}
              </span>
            </div>
          )}

          {(deviceFlowError || deviceStatus === 'error') && (
            <div
              className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md"
              role="alert"
            >
              <AlertCircle
                className="h-3.5 w-3.5 text-destructive shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs text-destructive">
                {t('settings.oauthDeviceFailed')}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const providerToSettingsKey: Record<string, string> = {
  openai: 'openai_api_key',
  anthropic: 'anthropic_api_key',
  google: 'google_api_key',
  zhipuai: 'zhipuai_api_key',
}

function ApiKeySection({
  provider,
  label,
}: {
  provider: string
  label: string
}) {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const queryClient = useQueryClient()

  const handleSave = async () => {
    if (!apiKey.trim()) return

    setSaving(true)
    setStatus('idle')

    try {
      const settingsKey = providerToSettingsKey[provider] || `${provider}_api_key`
      await apiClient.put(`/settings/${settingsKey}`, { value: apiKey.trim() })
      setStatus('success')
      setApiKey('')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={`${label} API Key`}
          className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md"
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <button
          onClick={handleSave}
          disabled={!apiKey.trim() || saving}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Key className="h-4 w-4" aria-hidden="true" />
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>

      {status === 'success' && (
        <div className="flex items-center gap-2 p-2 bg-green-500/10 dark:bg-green-900/30 border border-green-500/20 dark:border-green-700/40 rounded-md">
          <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <span className="text-xs text-green-700 dark:text-green-400">{t('common.apiKeySaved', 'API key saved')}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="text-xs text-destructive">
            {t('settings.settingsSaveFailed')}
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('common.apiKeyEncrypted', 'API key is encrypted on the server')}
      </p>
    </div>
  )
}
