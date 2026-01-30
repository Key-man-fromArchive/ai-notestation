/// <reference types="vite/client" />

// CSS modules
declare module '*.css' {
  const content: Record<string, string>
  export default content
}
