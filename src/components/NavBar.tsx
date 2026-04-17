import type { AppScreen } from '../types'

type NavBarProps = {
  activeScreen: AppScreen
  isAdminRole: boolean
  onNavigate: (screen: AppScreen) => void
}

export function NavBar({ activeScreen, isAdminRole, onNavigate }: NavBarProps) {
  return (
    <nav className="bottom-nav section-card" aria-label="Primary screens">
      <button
        className={activeScreen === 'home' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('home')}
      >
        🏠 Home
      </button>
      <button
        className={activeScreen === 'deck' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('deck')}
      >
        🃏 Deck
      </button>
      <button
        className={activeScreen === 'battle' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('battle')}
      >
        ⚔️ Battle
      </button>
      <button
        className={activeScreen === 'vault' ? 'nav-chip active' : 'nav-chip'}
        onClick={() => onNavigate('vault')}
      >
        💎 Vault
      </button>
      {isAdminRole && (
        <button
          className={activeScreen === 'ops' ? 'nav-chip active' : 'nav-chip'}
          onClick={() => onNavigate('ops')}
        >
          📊 Ops
        </button>
      )}
    </nav>
  )
}
