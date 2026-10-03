import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasBoon, BOONS } from '@/game/boons'
import { NODE_HINT_RU, NODE_ICON, NODE_LABEL_RU, reachableNodes, visibleSteps } from '@/game/map'
import { lands } from '@/content/lands'
import { routeForRun, useRunStore } from '@/store/run'
import { useProfileStore } from '@/store/profile'
import { Button } from '@/ui/Button'
import { Hearts } from '@/ui/Hearts'
import type { MapNode, NodeType } from '@/types'

const W = 360
const ROW = 76
const R = 22

function colX(count: number, i: number): number {
  const gap = W / (count + 1)
  return gap * (i + 1)
}

function nodeColor(type: NodeType): string {
  switch (type) {
    case 'lair':
    case 'echo':
      return 'var(--color-danger)'
    case 'rest':
      return 'var(--color-accent)'
    case 'ambush':
      return 'var(--color-fg-muted)'
    default:
      return 'var(--color-line)'
  }
}

/**
 * The run map (SPEC §5.2): six steps bottom to top, the Echo on top. Reachable nodes pulse and
 * open a confirmation card; steps beyond sight are drawn as fog.
 */
export function MapScreen() {
  const navigate = useNavigate()
  const s = useRunStore()
  const [picked, setPicked] = useState<{ step: number; node: number } | null>(null)
  const unlockedLands = useProfileStore((p) => p.profile?.unlockedLands ?? ['smalltalk'])
  const land = lands.find((l) => l.id === unlockedLands[unlockedLands.length - 1]) ?? lands[0]

  useEffect(() => {
    void s.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!s.loaded) return
    const route = routeForRun(s.run)
    if (route !== '/run') navigate(route, { replace: true })
  }, [s.run, s.loaded, navigate])

  const run = s.run
  if (!run || run.phase !== 'map') {
    return (
      <main data-testid="screen-map" className="flex min-h-full items-center justify-center text-fg-muted">
        …
      </main>
    )
  }

  const reachable = reachableNodes(run.map, run.position)
  const currentStep = run.position ? run.position.step : -1
  const horizon = currentStep + visibleSteps(hasBoon(run.boons, 'pathfinder'))
  const rows = run.map.length
  const H = rows * ROW + 40
  const y = (step: number) => H - 48 - step * ROW
  const pickedNode: MapNode | undefined = picked ? run.map[picked.step]?.[picked.node] : undefined

  return (
    <main data-testid="screen-map" className="safe-top safe-bottom mx-auto flex min-h-full w-full max-w-[440px] flex-col gap-3 px-4 pb-6">
      <header className="flex h-14 items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="В лагерь"
            onClick={() => navigate('/')}
            className="tap -ml-3 flex items-center justify-center rounded-full text-fg-muted"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-xl font-bold tracking-tight">Поход</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Hearts hp={run.hp} maxHp={run.maxHp} />
          <span className="font-semibold text-accent" data-testid="run-runes">
            ◆ {run.runes}
          </span>
        </div>
      </header>

      {run.boons.length > 0 ? (
        <div className="flex flex-wrap gap-1" data-testid="run-boons">
          {run.boons.map((b) => (
            <span key={b} className="rounded-full bg-bg-card px-2 py-0.5 text-xs text-fg-muted" title={BOONS[b].text}>
              {BOONS[b].icon} {BOONS[b].name}
            </span>
          ))}
        </div>
      ) : null}

      <p className="text-sm text-fg-muted" data-testid="map-land">
        {land ? `${land.emoji} ${land.name}. ` : ''}
        {run.position === null ? 'Выбери, куда идти. Видно на два шага вперёд.' : 'Следующий узел. Повторений не избежать, но путь твой.'}
      </p>

      <div className="rounded-card bg-bg-card p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label="Карта похода" data-testid="map-svg">
          {run.map.map((step, si) =>
            step.map((n, ni) =>
              n.next.map((j) => {
                const nextStep = run.map[si + 1]
                if (!nextStep) return null
                const visible = si <= horizon
                const active =
                  (run.position && si === run.position.step && ni === run.position.node) || (run.position === null && si === -1)
                return (
                  <line
                    key={`${si}-${ni}-${j}`}
                    x1={colX(step.length, ni)}
                    y1={y(si)}
                    x2={colX(nextStep.length, j)}
                    y2={y(si + 1)}
                    stroke={active ? 'var(--color-accent)' : 'var(--color-line)'}
                    strokeWidth={active ? 3 : 2}
                    strokeDasharray={visible ? undefined : '4 6'}
                    opacity={visible ? 1 : 0.4}
                  />
                )
              }),
            ),
          )}
          {run.map.map((step, si) =>
            step.map((n, ni) => {
              const cx = colX(step.length, ni)
              const cy = y(si)
              const isCurrent = run.position !== null && si === run.position.step && ni === run.position.node
              const canGo = (run.position === null ? si === 0 : si === currentStep + 1) && reachable.includes(ni)
              const fog = si > horizon
              const label = fog ? '?' : NODE_ICON[n.type]
              return (
                <g
                  key={`${si}-${ni}`}
                  role={canGo ? 'button' : undefined}
                  tabIndex={canGo ? 0 : undefined}
                  aria-label={fog ? 'Неизвестно' : NODE_LABEL_RU[n.type]}
                  data-testid={canGo ? 'map-node-go' : 'map-node'}
                  data-type={fog ? 'fog' : n.type}
                  data-step={si}
                  data-node={ni}
                  onClick={() => canGo && setPicked({ step: si, node: ni })}
                  onKeyDown={(e) => {
                    if (canGo && (e.key === 'Enter' || e.key === ' ')) setPicked({ step: si, node: ni })
                  }}
                  style={{ cursor: canGo ? 'pointer' : 'default' }}
                >
                  {canGo ? (
                    // Pulses by opacity, not radius: a stable bounding box keeps taps (and Playwright) reliable.
                    <circle cx={cx} cy={cy} r={R + 9} fill="var(--color-accent)" opacity="0.18">
                      <animate attributeName="opacity" values="0.1;0.3;0.1" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                  ) : null}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={R}
                    fill={n.done ? 'var(--color-bg-raised)' : 'var(--color-bg)'}
                    stroke={isCurrent ? 'var(--color-accent)' : canGo ? 'var(--color-accent)' : fog ? 'var(--color-line)' : nodeColor(n.type)}
                    strokeWidth={isCurrent || canGo ? 3 : 2}
                    opacity={fog ? 0.6 : n.done ? 0.5 : 1}
                  />
                  <text x={cx} y={cy + 7} textAnchor="middle" fontSize="20" opacity={n.done ? 0.5 : 1}>
                    {n.done ? '✓' : label}
                  </text>
                  {!fog ? (
                    <text x={cx} y={cy + R + 14} textAnchor="middle" fontSize="11" fill="var(--color-fg-muted)">
                      {NODE_LABEL_RU[n.type]}
                    </text>
                  ) : null}
                </g>
              )
            }),
          )}
        </svg>
      </div>

      {pickedNode && picked ? (
        <div className="rounded-card border border-accent/40 bg-bg-card p-4" data-testid="map-pick">
          <p className="text-lg font-bold">
            {NODE_ICON[pickedNode.type]} {NODE_LABEL_RU[pickedNode.type]}
          </p>
          <p className="text-sm text-fg-muted">{NODE_HINT_RU[pickedNode.type]}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setPicked(null)}>
              Назад
            </Button>
            <Button full data-testid="map-go" onClick={() => void s.enterNode(picked.step, picked.node)}>
              Идти
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  )
}
