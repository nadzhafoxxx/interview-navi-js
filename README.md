# navigator-interview-js

Упрощённая версия `dashboard-engine` из `navigator-dashboard-js` — тестовое приложение
с бекенд-подходами реального сервиса (слои, конфиг, контекст запроса, граф
зависимостей), но без продуктовой специфики АС «Навигатор».

## Запуск

```bash
npm install
npm run start:dev
```

При первом старте создаётся `data/dashboards.duckdb` и наполняется из `data/schema.sql`
и `data/seed.sql` (повторно не наполняется — проверяется по `count(*) from dashboards`).

```bash
npm run build      # сборка
npm test           # тесты (unit + e2e)
npm run clean      # снести dist и БД-файл
```

Требуется Node `>=20 <23`.

## Ручка

```
POST /dashboards/:id/render
Content-Type: application/json

{
  "screen": 10,
  "params": { "region": "MSK" },
  "page": 1,
  "pageSize": 20
}
```

`params` необязателен: ключи сравниваются со `scode` контролов, переданное значение
становится выбранным для контрола (и входным параметром для его детей).

`page` / `pageSize` необязательны и управляют постраничной выдачей виджетов:
по умолчанию `page = 1`, `pageSize = 20`, максимум — 100 (`pageSize > 100` → 400).

```bash
curl -X POST localhost:3030/dashboards/1/render \
  -H 'Content-Type: application/json' \
  -d '{"screen": 10}'
```

Ответ (сокращён):

```json
{
  "dashboard": { "nid": 1, "stitle": "Дашборд «Продажи»" },
  "screen": { "nid": 10, "stitle": "Основной экран" },
  "controls": [
    {
      "nControlObjectID": 11,
      "sCode": "region",
      "sLabel": "Регион",
      "nViewType": 1,
      "nOrd": 1,
      "sValue": "MSK",
      "rs": { "r": [{ "sValue": "NSK" }, { "sValue": "SPB" }, { "sValue": "MSK", "isSelected": 1 }] }
    }
  ],
  "controlsDependency": { "12": "11", "13": "12", "15": "12" },
  "widgets": [
    {
      "nWidgetID": 1001,
      "sTitle": "Продажи",
      "nDatasetID": 1,
      "sDatasetTitle": "Продажи по городам",
      "nOrd": 1,
      "params": { "12": "Москва", "14": "2026-02" },
      "columns": ["Город", "Канал", "Период", "Сумма"],
      "rows": [
        { "Город": "Москва", "Канал": "Розница", "Период": "2026-02", "Сумма": 172000 },
        { "Город": "Москва", "Канал": "Онлайн", "Период": "2026-02", "Сумма": 101000 }
      ],
      "pagination": { "page": 1, "pageSize": 20, "total": 2 }
    }
  ],
  "dtCompileStart": "2026-10-30T12:14:24.837Z",
  "dtCompileEnd": "2026-10-30T12:14:24.918Z"
}
```

`controlsDependency` — карта `ребёнок -> родитель`. `widgets[].params` — какие значения
контролов (по `ncontrolid`) были подставлены в SQL датасета.

### Заголовки

| Заголовок | Назначение |
|---|---|
| `x-request-id` | если это валидный UUID — используется как id запроса, иначе генерируется. Возвращается в ответе и попадает в каждую строку лога |
| `x-user-id` | доступен в контексте запроса как `userId` |

## Модель данных

DuckDB, 7 таблиц:

| Таблица | Поля |
|---|---|
| `dashboards` | `nid`, `stitle` |
| `screens` | `nid`, `ndashboardid`, `stitle`, `norder` |
| `controls` | `nid`, `nscreenid`, `scode`, `slabel`, `nviewtype` (1=DropDown, 2=DatePicker, 3=MultiSelect), `nord`, `nparentcontrolid`, `squery` |
| `control_defaults` | `ncontrolid`, `svalue` |
| `datasets` | `nid`, `stitle`, `ssql` |
| `widgets` | `nid`, `nscreenid`, `ndatasetid`, `stitle`, `nord` |
| `widget_controls` | `nwidgetid`, `ncontrolid`, `nord` |

Зависимость контролов задаётся полем `controls.nparentcontrolid`; `squery` — SQL источника
строк контрола, значение родителя подставляется bind-параметром `?`.

`widget_controls` задаёт два момента сразу: какие значения подставляются в `ssql` датасета
и **в каком порядке** (по `nord`), потому что параметры в SQL обозначены `?`.

### Виджеты и SQL

Виджет — это `датасет + привязанные контролы`. SQL лежит в БД (`datasets.ssql`) и содержит
`?` для параметров; значения контролов уходят **bind-параметрами**, не склейкой:

```ts
// widget.service.ts -> repository
SELECT * FROM (${ssql}) AS dataset_rows LIMIT ? OFFSET ?   // [...bindValues, limit, offset]
SELECT COUNT(*) FROM (${ssql}) AS dataset_rows             // total
```

Лимит строк всегда накладывает код, а не датасет: `ssql` может попросить сколько угодно
строк, наружу уйдёт `pageSize` (≤ 100). Тело оборачивается в подзапрос, поэтому `ORDER BY`
и агрегаты внутри датасета продолжают работать.

Если у виджета есть привязка к контролу, а значение не посчиталось — ответ `400`
`Нет значения контрола <id> для виджета <id>`, а не молча пустая таблица.

### Тестовые дашборды

| id | Состав |
|---|---|
| 1 | контролы 11–15: цепочка `11 -> 12 -> 13`, независимый `14`, ромб (`12` — родитель `13` и `15`); виджеты 1001/1002 |
| 2 | контролы 101–105: ветвление `101 -> 102 -> 104` и `101 -> 103`, независимый `105`; виджет 2001 |
| 3 | контролы 21 и 22: `21 <-> 22` |

### Тестовые виджеты

| Виджет | Датасет | Экран | Параметры (по `nord`) |
|---|---|---|---|
| 1001 «Продажи» | 1 | 10 | `city`, `period` |
| 1002 «Менеджеры» | 2 | 10 | `city` |
| 2001 «Сделки» | 3 | 20 | `segment` |

## Устройство

```
src/
├── main.ts                 конфиг -> приложение -> пайпы/фильтры/интерсепторы/логгер
├── app.module.ts
├── common/
│   ├── context/            CLS-контекст запроса (ReqCtxService, ReqCtxInterceptor)
│   ├── filters/            AllExceptionsFilter
│   └── interceptors/       RemoveUndefinedInterceptor
├── config/                 js-yaml -> TypeBox (Convert/Default/Check/Clean/Decode)
├── database/               DuckDB: соединение, bootstrap схемы и сида
└── modules/
    ├── dashboard/          controller -> service (оркестратор) -> entity (агрегат)
    ├── dashboard-repository/  все SQL, типы строк объявлены здесь
    └── builders/           ControlGraph (ядро) + ControlService + WidgetService
```

Поток рендера:

1. `DashboardController` → валидация DTO, `RenderDashboardService`.
2. `DashboardService.initDashboard` — параллельные чтения дашборда, экранов, контролов
   и виджетов; вторым шагом — привязки виджетов к контролам и дефолты контролов.
3. `ControlGraph` строится по `nparentcontrolid`.
4. `graph.processViews` вычисляет контролы: DFS от листьев, родители ждутся через
   `Promise.all`, каждая нода вычисляется ровно один раз (мемоизация промиса).
5. Значения контролов по `ncontrolid` уходят в `WidgetService`, виджеты считаются
   параллельно: `COUNT(*)` и страница строк — два независимых запроса на виджет.
6. Ответ сортируется по `nOrd` (контролы и виджеты).

Дефолты контролов из `control_defaults` не перекрывают `params` запроса и не применяются
к контролу, если запрос переопределил его предка: при `params: { "region": "SPB" }`
город по умолчанию пересчитывается по источнику, а не остаётся «Москвой».

### Логи

Логи — стандартный логгер Nest (`ConsoleLogger`): `Logger` в сервисах пишет в stdout.
`requestId` из контекста запроса передаётся в фильтре исключений отдельной строкой
(`requestId=...`), глобального формата логов проект не настраивает.

### Конфигурация

`config.yml` читается **до** создания Nest-приложения (нужны порт и CORS).
Путь переопределяется переменной `CONFIG_FILE`. Отсутствующие необязательные поля
заполняются дефолтами из TypeBox-схемы.

## Тесты

```bash
npm test
```

- `src/modules/builders/control.graph.spec.ts` — построение связей, порядок,
  однократность вычисления общего родителя, параллельность веток, проброс ошибки.
- `src/config/base-config.service.spec.ts` — дефолты, приведение типов, ошибки валидации.
- `test/dashboard.e2e-spec.ts` — рендер, `controlsDependency`, передача значения родителя
  ребёнку, `x-request-id`, 404/400.
- `test/widgets.e2e-spec.ts` — виджеты: порядок по `nOrd`, колонки и строки, подстановка
  значений контролов в SQL датасета, пагинация (`page`/`pageSize`, `total`), пустая страница
  за пределами данных, отказ при `pageSize > 100`, отсутствие инъекции через параметр.

### Отладка экранов через живой сервис

```bash
npm run start:dev        # в одном терминале
npm run test:live        # в другом
```

`test/live.e2e-spec.ts` — три запроса, по одному на дашборд из `data/seed.sql`
(экраны 10, 20, 30). Сервис не запускается и не гасится: тест ходит в уже запущенный
`localhost:3000` (адрес меняется через `LIVE_BASE_URL`), ответ ждёт не дольше 5 секунд.
В `npm test` этот файл не входит.
