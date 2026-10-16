export const THEME_STORAGE_KEY = 'muni.theme'
export type ThemeChoice = 'light' | 'dark' | 'system'

/**
 * Inline script for <head>: applies the stored theme before first paint so a dark-mode
 * visitor never sees a light flash. 'system' leaves data-theme unset (tokens follow the OS).
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})()`
