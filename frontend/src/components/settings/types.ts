export interface Setting {
  key: string
  label: string
  type: 'password' | 'text'
  placeholder?: string
  oauthProvider?: string
}

export interface NsxImportStatus {
  status: 'idle' | 'importing' | 'completed' | 'error'
  last_import_at: string | null
  notes_processed: number | null
  images_extracted: number | null
  error_message: string | null
  errors: string[]
}

export const nasSettingsList: Setting[] = [
  {
    key: 'nas_url',
    label: 'Synology NAS URL',
    type: 'text',
    placeholder: 'http://192.168.1.100:5000',
  },
  {
    key: 'nas_user',
    label: 'NAS 사용자 이름',
    type: 'text',
    placeholder: 'admin',
  },
  {
    key: 'nas_password',
    label: 'NAS 비밀번호',
    type: 'password',
    placeholder: '••••••••',
  },
]

export const apiKeySettingsList: Setting[] = [
  {
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    type: 'password',
    placeholder: 'sk-...',
    oauthProvider: 'openai',
  },
  {
    key: 'anthropic_api_key',
    label: 'Anthropic API Key',
    type: 'password',
    placeholder: 'ant-...',
    oauthProvider: 'anthropic',
  },
  {
    key: 'google_api_key',
    label: 'Google API Key (Gemini)',
    type: 'password',
    placeholder: 'AIza...',
    oauthProvider: 'google',
  },
  {
    key: 'zhipuai_api_key',
    label: 'ZhipuAI API Key (GLM)',
    type: 'password',
  },
]
