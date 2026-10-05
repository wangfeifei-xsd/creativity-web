import { useId } from 'react'

export function BrandMark({ className }: { className?: string }) {
  const id = useId()
  return <svg className={className} viewBox="0 0 460 460" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-metal`} x1="92" y1="76" x2="342" y2="377" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fcfdfe" /><stop offset=".28" stopColor="#b5bbc1" />
        <stop offset=".5" stopColor="#f8f9fa" /><stop offset=".69" stopColor="#949da5" /><stop offset="1" stopColor="#dee2e5" />
      </linearGradient>
      <linearGradient id={`${id}-edge`} x1="50" y1="115" x2="392" y2="370" gradientUnits="userSpaceOnUse">
        <stop stopColor="#59616a" /><stop offset=".44" stopColor="#14191f" /><stop offset=".76" stopColor="#7c848b" /><stop offset="1" stopColor="#272e34" />
      </linearGradient>
      <linearGradient id={`${id}-light`} x1="85" y1="105" x2="312" y2="284" gradientUnits="userSpaceOnUse">
        <stop stopColor="white" /><stop offset="1" stopColor="#b5bdc4" />
      </linearGradient>
    </defs>
    <path d="M143 77H314L397 160L334 222L286 174H184L150 208V284L184 318H286L334 270L397 332L314 415H143L49 321V171Z" fill={`url(#${id}-edge)`} stroke="#454c54" strokeWidth="2" />
    <path d="M143 53H314L397 136L334 198L286 150H184L150 184V260L184 294H286L334 246L397 308L314 391H143L49 297V147Z" fill={`url(#${id}-metal)`} stroke="#dbe0e4" strokeWidth="2" />
    <path d="M143 53L164 101H294L314 53H143Z" fill={`url(#${id}-light)`} />
    <path d="M314 53L397 136L356 135L294 101Z" fill="#747e87" />
    <path d="M397 136L334 198L334 165L356 135Z" fill="#2c333b" />
    <path d="M334 165L279 116H171L116 171V274L171 329H279L334 279V246L286 294H184L150 260V184L184 150H286L334 198Z" fill={`url(#${id}-edge)`} />
    <path d="M143 53L49 147L98 166L164 101Z" fill="#f7f9fa" />
    <path d="M49 147V297L98 277V166Z" fill="#a4adb5" />
    <path d="M49 297L143 391L164 343L98 277Z" fill="#69737d" />
    <path d="M143 391H314L294 343H164Z" fill="#eef1f3" />
    <path d="M314 391L397 308L356 309L294 343Z" fill="#909aa4" />
    <path d="M334 246L397 308L356 309L334 279Z" fill="#fcfdfe" />
    <path d="M164 101L98 166V277L164 343H294L356 309L334 279L279 329H171L116 274V171L171 116H279L334 165L356 135L294 101Z" stroke="#f2f4f6" strokeWidth="1.5" />
    <path d="M69 155V289L151 371" stroke="#e5e9ec" strokeWidth="2" />
    <path d="M184 132H283L329 175" stroke="#e74948" strokeWidth="4" />
    <path d="M184 310H283L329 267" stroke="#a9282e" strokeWidth="4" />
    <path d="M314 391V415M143 391V415M49 297V321M397 308V332" stroke="#a2abb2" strokeWidth="1.5" />
  </svg>
}
