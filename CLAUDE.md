# CLAUDE.md

Личная PWA-игра для английского (Nemesis). Полная спецификация в [SPEC.md](SPEC.md). Этот файл — краткая памятка, чтобы не держать SPEC в контексте.

## Стек

Vite 8 + React 19 + TypeScript strict. Zustand, Dexie (IndexedDB), ts-fsrs, motion, canvas-confetti, Tailwind 4 (`@tailwindcss/vite`), vite-plugin-pwa, react-router-dom 7. Тесты: Vitest (движок), Playwright (e2e и самопроверка). Линтер: oxlint.

Запрещено: three.js, transformers.js, WebLLM, платные API, тяжёлые UI-киты. Первый экран до 250 КБ gzip, бой и сцены грузятся лениво.

## Команды

```bash
npm run dev          # dev-сервер (порт 5173)
npm run typecheck    # tsc -b --noEmit
npm run lint         # oxlint
npm test             # vitest run
npm run build        # production-сборка в dist/
npm run preview      # раздать dist/ (порт 4173), нужно для проверки PWA/офлайн
npm run e2e          # playwright (сам собирает `build:e2e` и поднимает preview)
npm run check        # typecheck + lint + test + build
```

e2e гоняются против `vite build --mode e2e`: это production-сборка, в которой остаются dev-панель и хук `window.__nemesis` (`state()` стор похода, `answer()` ожидаемый ответ текущего задания, `trap()` текущее упражнение Ловушки с решением). Хуки ставит `src/debugHooks.ts`, флаг `DEBUG` в `src/debug.ts`. В обычной `npm run build` ничего этого нет. Помощники для сценариев в `e2e/helpers.ts`: `autopilot` проходит поход через UI (карта, бой, усиление, привал), `answerCurrent`, `answerTrap`, `wipeAll`, `shiftDays`.

## Поход (этап 2)

Один стор `src/store/run.ts` ведёт весь поход: `run.phase` (`map | battle | rest | boon | summary`) решает экран, `routeForRun(run)` даёт маршрут, каждый экран при расхождении редиректит. Чистая логика похода в `src/game/run.ts` (создание, содержимое узлов, слияние боя, привал, усиления), карта в `map.ts`, Эхо в `echo.ts`, усиления в `boons.ts`. Бой (`combat.ts`) получает `CombatOptions { boons, flags }` и меняет только руны и здоровье. Встречи (`encounter`) на карту не ставятся до этапа 5 (`allowEncounter`).

## Звук и речь (этап 3)

`src/speech/tts.ts` и `recognition.ts` оборачивают Web Speech API и принимают подмену (`setSpeaker`, `setRecognizer`), которой пользуются тестовые хуки `fakeSpeech`. `src/ui/fx.ts` синтезирует звуки через Web Audio и вибрирует, читая выключатели из настроек. Приёмы На слух и Диктант доступны только при озвучке (`moves/availability.ts`), Голос без распознавания идёт через самооценку, Экспромт даёт 6 секунд на старт (`balance.improv`). В e2e `wipeAll` всегда ставит фальшивую речь, `__nemesis.forceMove(move)` задаёт приём следующего задания.

## Немезиды и развитие (этап 4)

Профиль (`src/db/profileRepo.ts`) хранит `camp` (уровни улучшений), `freezes`, `trophyLog`, `unlockedLands`, `heroLook`, `theme`. Улучшения в `src/game/upgrades.ts` (цены в `balance.upgrades`): `heroMaxHp`, `boonChoices`, `hasStartBoon` читает стор похода при старте. Серия дней с заморозками в `engine/streak.ts` (`advanceStreak`), открытие земель в `engine/lands.ts` (следующая земля после `balance.lands.unlockAfter` встреченных фраз), планировщик вводит новые фразы только из открытых земель (`unlockedLands`). Немезида после третьего дня побед уничтожается: `nemesisResult` в фидбеке боя, трофей в `trophyLog`. Празднования (`ui/Celebration.tsx`, оверлей `data-testid="celebration-*"`) показывает Summary (Эхо, уровень, земля) и Battle (немезида, трофей); тема применяется через `data-theme` на `<html>`. В e2e `dismissCelebrations` закрывает оверлеи, автопилот пишет `celebration:<id>` в trail и принимает `onCelebration` для скриншотов.

## Режим чтения (шаг 2а, SPEC §9.3)

Чистая логика в `src/reading/text.ts` (абзацы и токены, правило выделения до `balance.reading.maxWords` слов, предложение вокруг выделения, поиск уже существующих фраз). Тексты в таблице `texts` (Dexie v2), фразы из текста создаёт `addLifeItem` в `src/db/textRepo.ts`: `source: 'life'`, `land: 'life'`, один контекст, остальное пустое до ИИ, `canUse` сам ограничивает приёмы. Экраны `Library` (`/read`) и ленивый `Reader` (`/read/:id`): протяжка начинается только с выделенного слова (`touch-action: none` на нём), панель позиционируется от `getBoundingClientRect` выделения. В e2e слова адресуются как `[data-testid=reader-word][data-p][data-w]`.

## ИИ (этап 5, SPEC §8, §9.2, §10)

`src/ai/ai.ts` единственный вход: `checkProduction`, `sceneTurn`, `freshContexts`, `fromLife`, `mnemonic`, `ping`; каждая задача возвращает `null`, если ИИ не настроен, на паузе, офлайн или ответил не по схеме, и игра молча идёт без него. Провайдеры `gemini.ts` (ключ в заголовке) и `groq.ts`, очередь `queue.ts` (один запрос за раз, пауза `balance.ai.minGapMs`, лимит в день, повтор после 429), кэш и счётчик дня в таблице `aiCache` (`cache.ts`), промпты, схемы и валидаторы в `prompts.ts`. `fake.ts` детерминированный двойник для dev и e2e: `__nemesis.fakeAI()` (хранится в sessionStorage), правила: «he work» → sv-agreement, «I can drink» → habit, «mistake» → ошибка без pattern. Ежедневная работа `daily.ts` запускается из `camp.refresh` (свежие контексты на завтра, досоздание фраз из жизни, мнемоники немезид). Приёмы Своя фраза и Экспромт зовут `moves/production.ts`; исправления попадают в `Feedback.corrections`, а `store/run.ts: materialize` превращает их в элементы `ai-correction` (`pool.materialized`) или будит pattern и ставит Хамелеона (`pool.chameleons`, враг `kind: 'chameleon'`, задача `trap`, временный элемент `pattern:<id>`). Встреча: `game/encounter.ts` + `content/scenes.ts`, фаза `encounter`, экран `/encounter`; без ИИ сцена идёт по сценарию с самооценкой. «Из жизни»: экран `/life/:mode` (say, extract, manual). В e2e `__nemesis.setNodeType` подменяет узел карты, `sceneSample` даёт образец реплики.

## Полировка и деплой (этап 6)

Недельный отчёт считает `engine/stats.ts` (чистая агрегация попыток, прогресса, pattern и походов), резервная копия в `db/backup.ts` (ключи ИИ в файл не уходят, импорт заменяет таблицы в одной транзакции). Клавиши через `ui/keys.ts` (не срабатывают в полях ввода). Первый чанк это только Лагерь: остальные экраны ленивые, спрайт врага на CSS-анимациях, земли в лёгком `content/lands.ts` (seed с фразами ленивый, `seed.test.ts` сверяет их), сцены Встреч и `ai/daily` грузятся динамически. Проверка размера: сумма gzip всего, что `index.html` грузит сразу (скрипт в отчёте этапа 6), лимит 250 КБ. Деплой: Vercel из GitHub, `https://learning-game-five.vercel.app/`, `vercel.json` перенаправляет все пути на `index.html` для глубоких ссылок. `BASE_PATH` в `vite.config.ts` остался на случай GitHub Pages (в Git Bash нужен `MSYS_NO_PATHCONV=1`; превью `pages` в `.claude/launch.json`).

## Структура

```
src/engine/   чистая учебная логика без React: scheduler, debt, nemesis, grading, answerCheck. Время передаётся параметром.
src/game/     игровая логика: run, map, combat, boons, balance.ts (все числа баланса), enemyLook
src/moves/    по папке на приём, ленивый импорт
src/ai/       AIProvider, gemini, groq, queue, prompts, cache
src/speech/   tts, recognition
src/db/       Dexie схема и репозитории
src/content/seed/  JSON: земли, pattern, сцены
src/ui/       общие компоненты, анимации, звуки, DevPanel
src/screens/  экраны (по одному файлу)
src/store/    Zustand
e2e/          Playwright-сценарии (регресс, гонять на каждом этапе)
docs/verification/  отчёты самопроверки stage-N.md и скриншоты
```

`engine/` ничего не знает про `game/`. `game/` вызывает `engine/` и никогда не подменяет его оценки.

## Правила кода

- TS strict, без `any`. Интерфейс на русском, код и комментарии на английском.
- Три закона игры: каждое действие в бою это ответ на английском; игровые эффекты не меняют оценку FSRS; проигранный поход не отнимает выученное.
- Mobile-first 393×873, управление одной рукой, цели касания ≥ 48px. Тёмная тема по умолчанию, только inline SVG и эмодзи.
- Поля ввода: `autoCorrect="off" autoCapitalize="off" spellCheck={false}`.
- Анимации через transform/opacity, уважать `prefers-reduced-motion`.
- Игра обязана полностью работать без ИИ и без сети. Ключи ИИ только в IndexedDB, никогда в репозитории.
- Числа баланса только в `src/game/balance.ts`.

## Самопроверка (обязательна после каждого этапа, SPEC §16)

Этап не готов, пока приложение не запущено и не пройдено руками в браузере. Порядок:
1. `npm run check` без ошибок.
2. Ручной проход через Playwright (393×873 touch, плюс 360×800 и 1280×800): реальный сценарий кликами, не одна страница.
3. Скриншоты каждого экрана, открыть и посмотреть глазами: обрезанный текст, наложения, мелкие кнопки, контраст, горизонтальный скролл. Честно оценить: игра или форма с кнопками.
4. Консоль без ошибок и предупреждений React, без упавших запросов.
5. Исправить и повторить. Сценарии в `e2e/` сохраняются как регресс.
6. Отчёт `docs/verification/stage-N.md` + чек-лист для проверки на реальном телефоне.
7. Пуш только после этого.

Нельзя сообщать «готово» только потому, что код собирается.

## Git (SPEC §19)

- Remote: `https://github.com/nasraddinzade/learning-game.git`, ветка `main`.
- Conventional commits на английском (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Небольшие осмысленные коммиты по ходу работы.
- Пуш в `main` после каждого этапа после самопроверки, тег `stage-N`. В отчёте указывать хеш и подтверждение пуша.
- Никогда: `push --force`, переписывание истории, изменение глобальных настроек git, коммит ключей. Перед пушем проверять diff на секреты.
- Если пуш не проходит из-за доступа: остановиться и сказать. Токен в чат не просить, в файлы не писать.

## Этапы (SPEC §17)

0 каркас → 1 один бой (после него обязательная пауза на игру пользователя) → 2 поход → 3 звук и речь → 4 немезиды и развитие → 2а режим чтения без ИИ (SPEC §9.3, добавлен позже, идёт после 4) → 5 ИИ → 6 полировка и деплой.
