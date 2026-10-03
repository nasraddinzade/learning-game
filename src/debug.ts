/** Dev panel and test hooks are compiled in for dev and for the e2e build (`vite build --mode e2e`). */
export const DEBUG: boolean = import.meta.env.DEV || import.meta.env.MODE === 'e2e'
