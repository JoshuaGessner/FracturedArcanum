import type { AppScreen } from '../types'

type NavBarProps = {
  activeScreen: AppScreen
  onNavigate: (screen: AppScreen) => void
}

const NAV_ITEMS: Array<{ id: Exclude<AppScreen, 'battle'>; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'play', label: 'Play' },
  { id: 'collection', label: 'Collection' },
  { id: 'social', label: 'Social' },
  { id: 'shop', label: 'Shop' },
  { id: 'settings', label: 'Settings' },
]

export function NavBar({ activeScreen, onNavigate }: NavBarProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary screens">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={activeScreen === item.id ? 'nav-chip active' : 'nav-chip'}
          data-nav={item.id}
          aria-current={activeScreen === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
