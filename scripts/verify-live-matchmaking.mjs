import { io } from 'socket.io-client'

const port = Number(process.env.FA_PORT ?? '43277')
const base = `http://127.0.0.1:${port}`
const password = 'ArenaTest123x'
const deckConfig = {
  'spark-imp': 2,
  'shade-fox': 1,
  'ironbark-guard': 1,
  'dawn-healer': 1,
  'rune-scholar': 1,
  'sky-raider': 2,
  'moonwell-sage': 1,
  'ember-witch': 1,
  'void-leech': 1,
  'venom-drake': 1,
  'tide-caller': 1,
}

async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json()
}

async function signupAndLogin(username) {
  const signupData = await post('/api/auth/signup', {
    username,
    password,
    displayName: username,
    deviceFingerprint: `fp-${username}`,
  })

  if (!signupData.ok) {
    throw new Error(`signup failed for ${username}: ${JSON.stringify(signupData)}`)
  }

  const loginData = await post('/api/auth/login', { username, password })
  if (!loginData.ok || !loginData.token) {
    throw new Error(`login failed for ${username}: ${JSON.stringify(loginData)}`)
  }

  return loginData.token
}

const stamp = Date.now()
const [tokenA, tokenB] = await Promise.all([
  signupAndLogin(`arenaa${stamp}`),
  signupAndLogin(`arenab${stamp}`),
])

const results = []
await new Promise((resolve, reject) => {
  const sockets = []
  let starts = 0
  let settled = false

  const finish = (error) => {
    if (settled) return
    settled = true
    sockets.forEach((socket) => socket.disconnect())
    if (error) reject(error)
    else resolve()
  }

  const makeSocket = (token, rating, label, surrenderOnStart = false) => {
    const socket = io(base, { auth: { token }, transports: ['websocket'] })
    sockets.push(socket)

    socket.on('connect', () => {
      socket.emit('queue:join', {
        rank: 'Silver Division',
        rating,
        deckConfig,
      })
    })

    socket.on('game:start', (payload) => {
      results.push(`${label}:${payload.state.mode}:${payload.state.player.name} vs ${payload.state.enemy.name}`)
      starts += 1
      if (surrenderOnStart) {
        setTimeout(() => {
          socket.emit('game:action', { action: { type: 'surrender' } })
        }, 300)
      }
    })

    socket.on('game:over', () => {
      if (starts >= 2) {
        finish()
      }
    })

    socket.on('connect_error', (error) => finish(error))
    socket.on('game:error', (error) => finish(new Error(JSON.stringify(error))))
  }

  makeSocket(tokenA, 1200, 'playerA')
  makeSocket(tokenB, 1210, 'playerB', true)
  setTimeout(() => finish(new Error('timed out waiting for the live ranked match to resolve')), 10000)
})

const profileA = await fetch(base + '/api/me', {
  headers: { Authorization: `Bearer ${tokenA}` },
}).then((response) => response.json())
const profileB = await fetch(base + '/api/me', {
  headers: { Authorization: `Bearer ${tokenB}` },
}).then((response) => response.json())
const leaderboardResponse = await fetch(base + '/api/leaderboard')
const leaderboard = await leaderboardResponse.json()
console.log(JSON.stringify({
  ok: true,
  results,
  ratingA: profileA.profile?.seasonRating ?? 0,
  ratingB: profileB.profile?.seasonRating ?? 0,
  leaderboardCount: leaderboard.entries?.length ?? 0,
}))
