// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { NavBar } from './NavBar'
import type { AppScreen } from '../types'

function setup(activeScreen: AppScreen = 'home') {
  const onNavigate = vi.fn()
  const view = render(<NavBar activeScreen={activeScreen} onNavigate={onNavigate} />)
  return { onNavigate, ...view }
}

// This project runs vitest without globals, so @testing-library/react cannot
// register its own afterEach hook. Without an explicit cleanup, every render
// accumulates in document.body and `screen` queries match across tests.
afterEach(cleanup)

describe('NavBar', () => {
  it('renders exactly the four shipped destinations', () => {
    const { container } = setup()
    const links = [...container.querySelectorAll('.scene-link')]
    expect(links.map((el) => el.getAttribute('data-nav')))
      .toEqual(['home', 'collection', 'shop', 'social'])
  })

  it('labels the destinations for players, not by internal id', () => {
    setup()
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('Cards')).toBeTruthy()
    expect(screen.getByText('Shop')).toBeTruthy()
    expect(screen.getByText('Social')).toBeTruthy()
  })

  it('is labelled as the primary navigation landmark', () => {
    const { container } = setup()
    const nav = container.querySelector('nav')!
    expect(nav.className).toContain('scene-rail')
    expect(nav.getAttribute('aria-label')).toBe('Primary screens')
  })

  it('marks only the active destination, and moves the marker', () => {
    const { container, rerender } = setup('home')
    const active = () => [...container.querySelectorAll('.scene-link.active')]
      .map((el) => el.getAttribute('data-nav'))
    expect(active()).toEqual(['home'])

    rerender(<NavBar activeScreen="shop" onNavigate={() => {}} />)
    expect(active()).toEqual(['shop'])
  })

  it('sets aria-current only on the active destination', () => {
    const { container } = setup('collection')
    const marked = [...container.querySelectorAll('[aria-current="page"]')]
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('data-nav')).toBe('collection')
  })

  it('navigates by screen id when a destination is pressed', () => {
    const { onNavigate, container } = setup()
    fireEvent.click(container.querySelector('[data-nav="social"]')!)
    expect(onNavigate).toHaveBeenCalledWith('social')
  })

  it('marks nothing active on a screen outside the rail', () => {
    // Battle and settings are reachable but are not nav destinations, so the
    // rail should show no active tab rather than falling back to one.
    const { container } = setup('battle')
    expect(container.querySelectorAll('.scene-link.active')).toHaveLength(0)
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
  })
})
