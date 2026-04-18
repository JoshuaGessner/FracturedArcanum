import type { AppScreen } from '../types'

type NavBarProps = {
  activeScreen: AppScreen
  onNavigate: (screen: AppScreen) => void
}

export function NavBar({ activeScreen, onNavigate }: NavBarProps) {
  return (
    <nav className="bottom-nav section-card" aria-label="Primary screens">
      <button
        className={activeScreen === 'home' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('home')}
      >
        🏠 Home
      </button>
      <button
        className={activeScreen === 'collection' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('collection')}
      >
        📚 Collection
      </button>
      <button
        className={activeScreen === 'battle' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('battle')}
      >
        ⚔️ Battle
      </button>
      <button
        className={activeScreen === 'shop' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('shop')}
      >
        🛒 Shop
      </button>
      <button
        className={activeScreen === 'settings' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('settings')}
      >
        ⚙️ Settings
      </button>
    </nav>
  )
}
