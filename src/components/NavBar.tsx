import type { AppScreen } from '../types'

type NavBarProps = {
  activeScreen: AppScreen
  onNavigate: (screen: AppScreen) => void
  /** Measured by the shell so the scene stage can reserve exact chrome height. */
  ref?: React.Ref<HTMLElement>
}

/**
 * Four destinations, down from six.
 *
 * `play` was absorbed into the Home hub as a bottom sheet, and `settings`
 * moved to the top-bar account menu — both standard for the genre, and both
 * bought back the width the bar needed. Six columns on a 360px phone left
 * ~55px per target, which the old CSS then shrank to 40px tall with 0.64rem
 * labels just to fit.
 */
const NAV_ITEMS: Array<{ id: Exclude<AppScreen, 'battle' | 'play' | 'settings'>; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'collection', label: 'Cards' },
  { id: 'shop', label: 'Shop' },
  { id: 'social', label: 'Social' },
]

export function NavBar({ activeScreen, onNavigate, ref }: NavBarProps) {
  return (
    <nav className="scene-rail" aria-label="Primary screens" ref={ref}>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={activeScreen === item.id ? 'scene-link active' : 'scene-link'}
          data-nav={item.id}
          aria-current={activeScreen === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <span className="scene-link-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
