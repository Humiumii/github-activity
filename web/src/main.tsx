import { useState } from 'react'
import type { SubmitEventHandler } from 'react'
import { createRoot } from 'react-dom/client'
import { eventLabel, fetchActivity, repositoryUrl } from './events'
import type { GitHubEvent } from './events'
import './style.css'

const example = 'Humiumii'
const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })

type SearchResult =
  | { status: 'idle' }
  | { status: 'loading'; username: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; username: string; events: GitHubEvent[] }

function Timeline({ events }: { events: GitHubEvent[] }) {
  return (
    <ol className="timeline" role="list">
      {events.map(event => (
        <li key={event.id} className="event" data-kind={event.type}>
          <span className="marker" aria-hidden="true" />
          <div className="event-content">
            <strong>{eventLabel(event.type)}</strong>
            {typeof event.payload.action === 'string' && <span className="action">{event.payload.action}</span>}
            <a className="event-repo" href={repositoryUrl(event.repo.name)}>{event.repo.name}</a>
          </div>
          <time dateTime={event.created_at}>{dateFormat.format(new Date(event.created_at))}</time>
        </li>
      ))}
    </ol>
  )
}

function Results({ username, events }: { username: string; events: GitHubEvent[] }) {
  const [repository, setRepository] = useState('')
  const [type, setType] = useState('')

  const repositories = new Map<string, GitHubEvent[]>()
  for (const event of events) {
    const name = event.repo.name
    const group = repositories.get(name)
    if (group) group.push(event)
    else repositories.set(name, [event])
  }

  const scope = repositories.get(repository) ?? events
  const types = [...new Set(scope.map(event => event.type))]
    .sort((a, b) => eventLabel(a).localeCompare(eventLabel(b), 'es'))
  const filtered = type ? scope.filter(event => event.type === type) : scope

  function selectRepository(name: string) {
    if (name === repository) return
    setRepository(name)
    setType('')
  }

  return (
    <section className="results" aria-labelledby="activity-title">
      <header className="result-heading">
        <div>
          <a className="handle" href={'https://github.com/' + encodeURIComponent(username)}>@{username}</a>
          <h2 id="activity-title">Línea de tiempo</h2>
        </div>
        <span className="count">{events.length} {events.length === 1 ? 'evento' : 'eventos'} · {repositories.size} {repositories.size === 1 ? 'repositorio' : 'repositorios'}</span>
      </header>
      {events.length === 0 ? <p className="notice">Sin actividad pública reciente.</p> : (
        <div className="results-layout">
          <nav className="repositories" aria-labelledby="repos-title">
            <h3 id="repos-title">Repositorios</h3>
            <ul role="list">
              {['', ...repositories.keys()].map(name => (
                <li key={name}>
                  <button type="button" aria-pressed={repository === name} aria-controls="repository-timeline"
                    onClick={() => selectRepository(name)}>
                    <span>{name || 'Todos los repositorios'}</span>
                    <span className="repo-count">{repositories.get(name)?.length ?? events.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <section id="repository-timeline" className="feed" aria-labelledby="feed-title">
            <div className="feed-toolbar">
              <div>
                <h3 id="feed-title">{repository || 'Toda la actividad'}</h3>
                <span role="status" className="count">
                  {filtered.length} de {scope.length} {scope.length === 1 ? 'evento' : 'eventos'}
                </span>
              </div>
              <div className="type-control">
                <label htmlFor="event-type">Tipo de evento</label>
                <select id="event-type" value={type} onChange={event => setType(event.target.value)}>
                  <option value="">Todos los tipos</option>
                  {types.map(kind => <option key={kind} value={kind}>{eventLabel(kind)}</option>)}
                </select>
              </div>
            </div>
            <Timeline events={filtered} />
          </section>
        </div>
      )}
    </section>
  )
}

function App() {
  const [result, setResult] = useState<SearchResult>({ status: 'idle' })

  const search: SubmitEventHandler<HTMLFormElement> = async event => {
    event.preventDefault()
    if (result.status === 'loading') return
    const username = String(new FormData(event.currentTarget).get('username')).trim()
    setResult({ status: 'loading', username })
    try {
      const events = await fetchActivity(username)
      setResult({ status: 'ready', username, events })
    } catch (error) {
      setResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'No se pudo completar la búsqueda.',
      })
    }
  }

  return (
    <>
      <header className="masthead">
        <div className="wrap wordmark"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span> Bitácora GitHub</div>
      </header>
      <main>
        <div className="hero">
          <div className="wrap hero-layout">
            <div>
              <h1>Actividad pública<br />en GitHub</h1>
              <p>Explora los eventos recientes de un usuario.</p>
            </div>
            <search>
              <form action="./" method="get" onSubmit={search}>
                <label htmlFor="username">Usuario de GitHub</label>
                <div className="search-row">
                  <input id="username" name="username" type="search" defaultValue={example}
                    required maxLength={39} pattern="[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*"
                    title="Letras, números y guiones entre caracteres"
                    autoComplete="off" autoCorrect="off" autoCapitalize="none"
                    spellCheck={false} enterKeyHint="search" />
                  <button className="primary" type="submit" aria-disabled={result.status === 'loading'}>Buscar</button>
                </div>
              </form>
            </search>
          </div>
        </div>
        <div className="wrap content">
          <div role="status">
            {result.status === 'idle' && <p className="notice">Busca un usuario para ver su línea de tiempo.</p>}
            {result.status === 'loading' && <p className="notice">Buscando actividad de @{result.username}…</p>}
            {result.status === 'ready' && <p className="sr-only">{result.events.length} eventos encontrados para {result.username}.</p>}
          </div>
          {result.status === 'error' && <p className="notice error" role="alert">{result.message}</p>}
          {result.status === 'ready' && <Results key={result.username} username={result.username} events={result.events} />}
        </div>
      </main>
      <footer className="wrap footer">
        <a href="https://docs.github.com/en/rest/activity/events#list-public-events-for-a-user">GitHub REST API</a>
        <span>Hasta 100 eventos por búsqueda</span>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
