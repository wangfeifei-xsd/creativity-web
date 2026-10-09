import { useId } from 'react'

export function BrandMark({ className, variant = 'metal' }: { className?: string; variant?: 'metal' | 'flat' }) {
  const id = useId()
  if (variant === 'flat') return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-blue`} x1="5" y1="13" x2="37" y2="36" gradientUnits="userSpaceOnUse">
        <stop stopColor="#36bfff" /><stop offset=".45" stopColor="#2866ff" /><stop offset="1" stopColor="#4bcff2" />
      </linearGradient>
      <linearGradient id={`${id}-cyan`} x1="13" y1="43" x2="40" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2fb9f1" /><stop offset="1" stopColor="#75e5f4" />
      </linearGradient>
    </defs>
    <path d="M41.34 10.46A22 22 0 1 0 41.34 37.54L32.67 30.77A11 11 0 1 1 32.67 17.23Z" fill={`url(#${id}-blue)`} />
    <path d="M35 4.95A22 22 0 0 1 41.34 10.46L32.67 17.23A11 11 0 0 0 29.5 14.47Z" fill="#63d8f3" />
    <path d="M12.34 42.66A22 22 0 0 0 41.34 37.54L32.67 30.77A11 11 0 0 1 18.17 33.33Z" fill={`url(#${id}-cyan)`} />
  </svg>
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
      <linearGradient id={`${id}-spark`} x1="350" y1="195" x2="393" y2="254" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ff8c79" /><stop offset=".4" stopColor="#e5534e" /><stop offset="1" stopColor="#a52332" />
      </linearGradient>
      <linearGradient id={`${id}-fragment`} x1="388" y1="239" x2="410" y2="281" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fafcfd" /><stop offset=".48" stopColor="#c7ced4" /><stop offset="1" stopColor="#747f89" />
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
    <path d="M184 132H283L329 175" stroke="#b9c1c9" strokeWidth="3" />
    <path d="M184 310H283L329 267" stroke="#77828d" strokeWidth="3" />
    <path d="M314 391V415M143 391V415M49 297V321M397 308V332" stroke="#a2abb2" strokeWidth="1.5" />
    {/* 火花与由小到大的切面沿开口聚合，表达灵感逐渐形成创造。 */}
    <g className="brand-mark-fragments">
      <path d="M389 251L407 266L389 284L373 267Z" fill="#525d68" />
      <path d="M389 243L407 258L389 276L373 259Z" fill={`url(#${id}-fragment)`} stroke="#e8edf1" strokeWidth="1.5" />
      <path d="M389 243V260L373 259Z" fill="#f8fafb" />
      <path d="M389 260L407 258L389 276Z" fill="#89949f" />
      <path d="M422 219L434 229L422 241L411 231Z" fill="#626e79" />
      <path d="M422 215L434 225L422 237L411 227Z" fill="#b8c2cb" stroke="#e6ebef" strokeWidth="1" />
      <path d="M422 215V226L411 227Z" fill="#f2f6f8" />
      <path d="M444 193L451 200L444 207L437 200Z" fill="#a9b6c1" />
      <path d="M444 193V200H437Z" fill="#f5f8fa" />
    </g>
    <g className="brand-mark-spark">
      <path d="M373 196L382 221L407 230L382 239L373 264L364 239L339 230L364 221Z" fill="#822d36" />
      <path d="M373 190L382 215L407 224L382 233L373 258L364 233L339 224L364 215Z" fill={`url(#${id}-spark)`} />
      <path d="M373 190V224H339L364 215Z" fill="#ffb4a0" fillOpacity=".7" />
      <path d="M373 224H407L382 233L373 258Z" fill="#a62533" fillOpacity=".65" />
      <path d="M373 198V224L346 224" stroke="#ffd0be" strokeWidth="1.5" />
    </g>
  </svg>
}
