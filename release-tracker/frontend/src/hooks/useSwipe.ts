import { useRef } from 'react'
import type { TouchEvent } from 'react'

export interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

const MIN_SWIPE_DISTANCE_PX = 50

// Detection de balayage tactile minimale (pas de librairie externe pour ca) :
// mesure juste le deplacement entre le premier et le dernier point de
// contact, retient l'axe dominant (horizontal ou vertical) pour ignorer un
// scroll vertical qui ne devrait pas declencher un swipe horizontal et
// inversement. Ne fait jamais preventDefault, donc n'interfere pas avec le
// scroll/drag natif de l'element - seul un geste clairement horizontal ou
// vertical au-dela de MIN_SWIPE_DISTANCE_PX declenche un callback.
export function useSwipe(handlers: SwipeHandlers) {
  const start = useRef<{ x: number; y: number } | null>(null)

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!start.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    start.current = null

    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) < MIN_SWIPE_DISTANCE_PX) return
      if (dx > 0) handlers.onSwipeRight?.()
      else handlers.onSwipeLeft?.()
    } else {
      if (Math.abs(dy) < MIN_SWIPE_DISTANCE_PX) return
      if (dy > 0) handlers.onSwipeDown?.()
      else handlers.onSwipeUp?.()
    }
  }

  function onTouchCancel() {
    start.current = null
  }

  return { onTouchStart, onTouchEnd, onTouchCancel }
}
