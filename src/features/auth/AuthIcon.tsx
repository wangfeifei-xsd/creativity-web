export function AuthIcon({ name }: { name: 'user' | 'lock' | 'shield' | 'arrow' | 'check' | 'refresh' }) {
  const paths = {
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    arrow: <path d="m9 6 6 6-6 6" />,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    refresh: <><path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" /></>,
  }
  return <svg className="auth-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
