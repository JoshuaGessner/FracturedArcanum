# Release Checklist

## Product

- PWA enabled
- guest play enabled
- original branding in place
- ranked and local play modes available

## Quality

- automated tests
- lint checks
- production build
- health endpoint for backend

## Device validation

- iPhone Safari: long-press inspect stays in-app and no browser context menu escapes
- iPhone Home Screen install: icon, safe-area spacing, top chrome, and bottom nav all remain reachable
- Android Chrome: install prompt appears, queue overlays behave, and battle drag remains reliable
- Installed PWA on both platforms: reward cinema, pack reveal, and settings/shop subviews remain contained
- Narrow phones at 375px: no clipped back actions, no horizontal spill, and no unreachable CTA rows

## Before public launch

- deploy production host
- verify real mobile devices against the device validation checklist above
- add privacy policy and support email if accounts are introduced later
- replace any remaining placeholder UI with approved final art where desired
