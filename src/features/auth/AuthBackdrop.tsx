import { useEffect, useRef, type RefObject } from 'react'

export function AuthBackdrop({ pageRef }: { pageRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const page = pageRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!page || !canvas || !context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const accent = getComputedStyle(page).getPropertyValue('--auth-accent').trim()
    let width = 0, height = 0, pointerX = .38, pointerY = .35, inside = false, frame = 0

    function draw() {
      frame = 0
      if (!page || !context || !width || !height) return
      const active = inside && !reducedMotion.matches
      page.style.setProperty('--px', `${pointerX * 100}%`)
      page.style.setProperty('--py', `${pointerY * 100}%`)
      page.style.setProperty('--mx', `${active ? (pointerX - .5) * 22 : 0}px`)
      page.style.setProperty('--my', `${active ? (pointerY - .5) * 18 : 0}px`)
      context.clearRect(0, 0, width, height)
      context.fillStyle = accent
      context.strokeStyle = accent
      context.lineWidth = .7
      for (let x = 18; x < width; x += 47) {
        for (let y = 13; y < height; y += 47) {
          const dx = x - pointerX * width, dy = y - pointerY * height
          const distance = Math.hypot(dx, dy)
          const near = active ? Math.max(0, 1 - distance / 210) : 0
          const force = near * near * 17 * .65
          context.globalAlpha = .08 + near * .43
          context.beginPath()
          context.arc(x + (distance ? dx / distance * force : 0), y + (distance ? dy / distance * force : 0), near ? 1.1 + near * 1.3 : .9, 0, Math.PI * 2)
          context.fill()
        }
      }
      context.globalAlpha = .13
      for (let line = 0; line < 4; line++) {
        const offset = line * 100 + (active ? pointerX * 26 : 0)
        context.beginPath()
        context.moveTo(width * .6 + offset, -20)
        context.lineTo(width * .1 + offset, height + 20)
        context.stroke()
      }
      context.globalAlpha = 1
    }

    // 仅在指针或尺寸变化时绘制，合并同一帧内的事件，避免持续占用渲染资源。
    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    function reset() {
      inside = false
      pointerX = .38
      pointerY = .35
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
    <div className="auth-grid" /><div className="auth-halo" /><canvas ref={canvasRef} />
  </div>
}
