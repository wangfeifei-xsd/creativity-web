import { useEffect, useRef, type RefObject } from 'react'

export function AuthBackdrop({ pageRef }: { pageRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const page = pageRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!page || !canvas || !context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const style = getComputedStyle(page)
    const accent = style.getPropertyValue('--auth-motion-accent').trim()
    const dotColor = style.getPropertyValue('--auth-dot').trim()
    let width = 0, height = 0, pointerX = .52, pointerY = .47, inside = false, frame = 0

    function draw() {
      frame = 0
      if (!page || !context || !width || !height) return
      const active = inside && !reducedMotion.matches
      page.style.setProperty('--px', `${pointerX * 100}%`)
      page.style.setProperty('--py', `${pointerY * 100}%`)
      context.clearRect(0, 0, width, height)
      const cornerWidth = Math.min(320, width * .22)
      const cornerHeight = Math.min(280, height * .32)
      for (let x = 26; x < width; x += 32) {
        for (let y = 32; y < height; y += 32) {
          const dx = x - pointerX * width, dy = y - pointerY * height
          const distance = Math.hypot(dx, dy)
          const near = active ? Math.max(0, 1 - distance / 210) : 0
          const force = near * near * 17 * .65
          // 静态点阵集中在右上与左下，鼠标经过时才显现其余区域的点阵。
          const topRight = Math.max(0, 1 - (width - x) / cornerWidth) * Math.max(0, 1 - y / cornerHeight)
          const bottomLeft = Math.max(0, 1 - x / cornerWidth) * Math.max(0, 1 - (height - y) / cornerHeight)
          const opacity = Math.max(topRight, bottomLeft) * .5 + near * .36
          if (opacity < .005) continue
          context.fillStyle = near > 0 ? accent : dotColor
          context.globalAlpha = opacity
          context.beginPath()
          context.arc(x + (distance ? dx / distance * force : 0), y + (distance ? dy / distance * force : 0), near ? 1.1 + near * 1.3 : 1.2, 0, Math.PI * 2)
          context.fill()
        }
      }
      context.globalAlpha = 1
    }

    // 仅在指针或尺寸变化时绘制，合并同一帧内的事件，避免持续占用渲染资源。
    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    function reset() {
      inside = false
      pointerX = .52
      pointerY = .47
      schedule()
    }
    function move(event: PointerEvent) {
      if (!page || reducedMotion.matches || event.pointerType === 'touch') return
      const rect = page.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      pointerX = (event.clientX - rect.left) / rect.width
      pointerY = (event.clientY - rect.top) / rect.height
      inside = true
      schedule()
    }
    const observer = new ResizeObserver(() => {
      const rect = page.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      schedule()
    })
    observer.observe(page)
    page.addEventListener('pointermove', move, { passive: true })
    page.addEventListener('pointerleave', reset)
    reducedMotion.addEventListener('change', reset)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      page.removeEventListener('pointermove', move)
      page.removeEventListener('pointerleave', reset)
      reducedMotion.removeEventListener('change', reset)
    }
  }, [pageRef])

  return <div className="auth-backdrop" aria-hidden="true">
    <svg className="auth-waves" viewBox="0 0 1744 904" preserveAspectRatio="none" fill="none">
      <path className="auth-wave-surface" d="M-80 270C65 640 447 814 1170 930H-80Z" />
      <path className="auth-wave-edge" d="M-80 270C65 640 447 814 1170 930" />
      <path className="auth-wave-line" d="M-80 560C149 661 408 770 710 930" />
      <path className="auth-wave-light" d="M-70 612C50 741 205 819 408 930" />
    </svg>
    <div className="auth-halo" /><canvas ref={canvasRef} />
  </div>
}
