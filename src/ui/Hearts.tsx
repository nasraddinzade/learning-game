interface Props {
  hp: number
  maxHp: number
}

export function Hearts({ hp, maxHp }: Props) {
  return (
    <div className="flex items-center gap-1" aria-label={`Здоровье ${hp} из ${maxHp}`} data-testid="hearts" data-hp={hp}>
      {Array.from({ length: maxHp }).map((_, i) => (
        <svg key={i} width="22" height="20" viewBox="0 0 24 22" aria-hidden="true">
          <path
            d="M12 21 C5 15 1 11 1 6.5 C1 3.5 3.5 1 6.5 1 C8.8 1 10.8 2.3 12 4.2 C13.2 2.3 15.2 1 17.5 1 C20.5 1 23 3.5 23 6.5 C23 11 19 15 12 21Z"
            fill={i < hp ? 'var(--color-hp)' : 'var(--color-line)'}
          />
        </svg>
      ))}
    </div>
  )
}
