export type GitHubEvent = {
  id: string
  type: string
  repo: { name: string }
  created_at: string
  payload: { action?: string; ref?: string }
}

const labels: Record<string, string> = {
  PushEvent: 'Push',
  PullRequestEvent: 'Pull request',
  IssuesEvent: 'Issue',
  IssueCommentEvent: 'Comentario en issue',
  PullRequestReviewEvent: 'Revisión de PR',
  PullRequestReviewCommentEvent: 'Comentario en PR',
  CreateEvent: 'Creación de rama o tag',
  DeleteEvent: 'Eliminación de rama o tag',
  ForkEvent: 'Fork',
  WatchEvent: 'Estrella',
  ReleaseEvent: 'Release',
}

export function eventLabel(type: string) {
  return Object.hasOwn(labels, type) ? labels[type] : type
}

export function repositoryUrl(name: string) {
  return 'https://github.com/' + name.split('/').map(encodeURIComponent).join('/')
}

function isEvent(value: unknown): value is GitHubEvent {
  const event = value as Partial<GitHubEvent> | null
  return typeof event?.id === 'string' && typeof event.type === 'string' &&
    typeof event.repo?.name === 'string' && typeof event.created_at === 'string' &&
    Number.isFinite(Date.parse(event.created_at)) &&
    !!event.payload && typeof event.payload === 'object'
}

export async function fetchActivity(username: string) {
  const url = new URL('https://api.github.com/users/' + encodeURIComponent(username) + '/events/public')
  url.searchParams.set('per_page', '100')
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new Error('No se pudo conectar a GitHub. Revisa tu conexión y vuelve a intentar.')
  }

  if (response.status === 404) throw new Error('No encontramos ese usuario de GitHub.')
  if (response.status === 403 || response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const remaining = response.headers.get('X-RateLimit-Remaining')
    const secondary = /secondary rate limit/i.test(await response.text().catch(() => ''))
    if (response.status === 429 || remaining === '0' || retryAfter || secondary) {
      const wait = retryAfter && /^\d+$/.test(retryAfter)
        ? ' Vuelve a intentar en ' + retryAfter + ' segundos.'
        : ' Espera antes de volver a intentar.'
      throw new Error('GitHub alcanzó su límite de solicitudes.' + wait)
    }
  }
  if (!response.ok) throw new Error('GitHub respondió con el código HTTP ' + response.status + '.')

  const data: unknown = await response.json().catch(() => null)
  if (!Array.isArray(data) || !data.every(isEvent)) {
    throw new Error('GitHub devolvió una respuesta inesperada.')
  }
  return data.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}
