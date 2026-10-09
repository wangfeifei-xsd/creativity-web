export function AuthIcon({ name }: { name: 'layers' | 'document' | 'channels' | 'user' | 'lock' | 'shield' | 'eye' | 'eye-off' | 'arrow' | 'check' | 'refresh' }) {
  const paths = {
    layers: <><path d="m12 2 10 6-10 6L2 8Z" /><path d="m2 12 10 6 10-6M2 16l10 6 10-6" /></>,
    document: <><rect x="3.5" y="1.5" width="17" height="21" rx="2.5" /><path d="M8 7h8M8 12h8M8 17h4" /></>,
    channels: <><circle cx="12" cy="4.5" r="3.5" /><circle cx="5" cy="18" r="3.5" /><circle cx="19" cy="18" r="3.5" /><path d="M8.5 18h7" /></>,
    user: <><circle cx="12" cy="6.5" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0Z" /></>,
    lock: <><rect x="4.5" y="10" width="15" height="11" rx="1.8" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v3" /><circle cx="12" cy="14.5" r="1.2" fill="currentColor" stroke="none" /></>,
    shield: <><path d="m12 2 8 3.5v6c0 5-4.8 8.8-8 10.5-3.2-1.7-8-5.5-8-10.5v-6Z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></>,
    eye: <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="3.3" /></>,
    'eye-off': <><path d="M9 5.8a12 12 0 0 1 3-.3c6.5 0 10 6.5 10 6.5s-3.5 6.5-10 6.5a11 11 0 0 1-3-.4M5.8 7.2A20 20 0 0 0 2 12s.9 1.7 2.7 3.4M15 10.5a3.3 3.3 0 0 1-4.5 4.5M3 21 21 3" /></>,
    arrow: <path d="m9 6 6 6-6 6" />,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    refresh: <><path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" /></>,
  }
  return <svg className="auth-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
