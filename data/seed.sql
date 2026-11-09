-- Тестовые данные. Наполняются один раз при первом старте (если БД пуста).

INSERT INTO dashboards (nid, stitle) VALUES
  (1, 'Дашборд «Продажи»'),
  (2, 'Дашборд «Широкая аналитика»'),
  (3, 'Дашборд «Сложная аналитика»');

INSERT INTO screens (nid, ndashboardid, stitle, norder) VALUES
  (10, 1, 'Основной экран', 1),
  (20, 2, 'Основной экран', 1),
  (30, 3, 'Основной экран', 1);

-- ---------------------------------------------------------------------------
-- Дашборд 1: линейная цепочка 11 -> 12 -> 13 и независимый контрол 14.
-- У контрола 12 два ребёнка (13 и 15): в графе это ромб, общий родитель
-- должен посчитаться ровно один раз.
--
-- Источник строк контрола отдаёт `value` (что видит клиент) и `key` (что
-- уходит в `?` фильтров детей). Они разные: город «Москва» фильтруется
-- по региону «MSK». Если `key` нет — ключом становится `value`.
-- ---------------------------------------------------------------------------
INSERT INTO controls (nid, nscreenid, scode, slabel, nviewtype, nord, nparentcontrolid, squery) VALUES
  (11, 10, 'region',  'Регион',           1, 1, NULL, 'SELECT DISTINCT region AS value FROM (VALUES (''MSK''), (''SPB''), (''NSK'')) AS t(region) ORDER BY region'),
  (12, 10, 'city',    'Город',            1, 2, 11,   'SELECT DISTINCT city AS value, region AS key FROM (VALUES (''Москва'', ''MSK''), (''Санкт-Петербург'', ''SPB''), (''Новосибирск'', ''NSK'')) AS t(city, region) WHERE region = ? ORDER BY city'),
  (13, 10, 'channel', 'Канал продаж',     1, 3, 12,   'SELECT DISTINCT channel AS value, city AS key FROM (VALUES (''Розница'', ''Москва''), (''Онлайн'', ''Москва''), (''Партнёры'', ''Новосибирск'')) AS t(channel, city) WHERE city = ? ORDER BY channel'),
  (14, 10, 'period',  'Период',           2, 4, NULL, 'SELECT DISTINCT period AS value FROM (VALUES (''2026-01''), (''2026-02''), (''2026-03'')) AS t(period) ORDER BY period'),
  (15, 10, 'manager', 'Менеджер',         3, 5, 12,   'SELECT DISTINCT manager AS value, city AS key FROM (VALUES (''Иванов'', ''Москва''), (''Петров'', ''Москва''), (''Сидоров'', ''Санкт-Петербург'')) AS t(manager, city) WHERE city = ? ORDER BY manager');

INSERT INTO control_defaults (ncontrolid, svalue) VALUES
  (11, 'MSK'),
  (12, 'Москва'),
  (13, 'Онлайн'),
  (14, '2026-02');

-- ---------------------------------------------------------------------------
-- Дашборд 2: широкий граф с ветвлением (10..15).
--   101 -> 102 -> 104
--   101 -> 103 -> 104
--   105 независимый
-- ---------------------------------------------------------------------------
INSERT INTO controls (nid, nscreenid, scode, slabel, nviewtype, nord, nparentcontrolid, squery) VALUES
  (101, 20, 'country',  'Страна',        1, 1, NULL, 'SELECT DISTINCT country AS value FROM (VALUES (''RU''), (''KZ'')) AS t(country) ORDER BY country'),
  (102, 20, 'segment',  'Сегмент',       1, 2, 101,  'SELECT DISTINCT segment AS value, country AS key FROM (VALUES (''Retail'', ''RU''), (''SMB'', ''RU''), (''Retail'', ''KZ'')) AS t(segment, country) WHERE country = ? ORDER BY segment'),
  (103, 20, 'product',  'Продукт',       1, 3, 101,  'SELECT DISTINCT product AS value, country AS key FROM (VALUES (''Карта'', ''RU''), (''Кредит'', ''RU''), (''Карта'', ''KZ'')) AS t(product, country) WHERE country = ? ORDER BY product'),
  (104, 20, 'contract', 'Тип договора',  1, 4, 102,  'SELECT DISTINCT contract AS value, segment AS key FROM (VALUES (''Основной'', ''Retail''), (''Доп.'', ''Retail''), (''Основной'', ''SMB'')) AS t(contract, segment) WHERE segment = ? ORDER BY contract'),
  (105, 20, 'date',     'Дата отчёта',   2, 5, NULL, 'SELECT DISTINCT dt AS value FROM (VALUES (''2026-03-01''), (''2026-03-02'')) AS t(dt) ORDER BY dt');

INSERT INTO control_defaults (ncontrolid, svalue) VALUES
  (101, 'RU'),
  (102, 'Retail'),
  (104, 'Основной');

-- ---------------------------------------------------------------------------
-- Дашборд 3: 
-- ---------------------------------------------------------------------------
INSERT INTO controls (nid, nscreenid, scode, slabel, nviewtype, nord, nparentcontrolid, squery) VALUES
  (21, 30, 'a', 'A', 1, 1, 22, 'SELECT ''a'' AS value'),
  (22, 30, 'b', 'B', 1, 2, 21, 'SELECT ''b'' AS value');

-- ---------------------------------------------------------------------------
-- Датасеты и виджеты.
--
-- ssql — SQL, живущий в БД. Параметры обозначаются `?` и заполняются
-- значениями контролов из widget_controls (в порядке nord). Никакой склейки
-- строк со значениями контролов: значения уходят bind-параметрами.
-- ---------------------------------------------------------------------------
INSERT INTO datasets (nid, stitle, ssql) VALUES
  (1, 'Продажи по городам', '
    SELECT city AS "Город", channel AS "Канал", period AS "Период", amount AS "Сумма"
      FROM (VALUES
        (''Москва'', ''Розница'', ''2026-01'', 150000),
        (''Москва'', ''Онлайн'',  ''2026-01'',  90000),
        (''Москва'', ''Розница'', ''2026-02'', 172000),
        (''Москва'', ''Онлайн'',  ''2026-02'', 101000),
        (''Москва'', ''Розница'', ''2026-03'', 160000),
        (''Москва'', ''Онлайн'',  ''2026-03'', 133000),
        (''Санкт-Петербург'', ''Розница'', ''2026-01'', 84000),
        (''Санкт-Петербург'', ''Розница'', ''2026-02'',  79000),
        (''Санкт-Петербург'', ''Розница'', ''2026-03'',  95000),
        (''Новосибирск'', ''Партнёры'', ''2026-01'', 41000),
        (''Новосибирск'', ''Партнёры'', ''2026-02'', 38000),
        (''Новосибирск'', ''Партнёры'', ''2026-03'', 52000)
      ) AS t(city, channel, period, amount)
     WHERE city = ? AND period = ?
     ORDER BY amount DESC'),
  (2, 'Менеджеры по городам', '
    SELECT manager AS "Менеджер", city AS "Город", deals AS "Сделок"
      FROM (VALUES
        (''Иванов'',  ''Москва'', 24),
        (''Петров'',  ''Москва'', 18),
        (''Сидоров'', ''Санкт-Петербург'', 11)
      ) AS t(manager, city, deals)
     WHERE city = ?
     ORDER BY deals DESC'),
  (3, 'Сделки по сегментам', '
    SELECT segment AS "Сегмент", product AS "Продукт", cnt AS "Количество"
      FROM (VALUES
        (''Retail'', ''Карта'',  120),
        (''Retail'', ''Кредит'',  45),
        (''SMB'',    ''Карта'',   30),
        (''SMB'',    ''Кредит'',  12)
      ) AS t(segment, product, cnt)
     WHERE segment = ?
     ORDER BY cnt DESC');

-- widget_controls определяет, какие значения подставляются в `?` и в каком порядке.
INSERT INTO widgets (nid, nscreenid, ndatasetid, stitle, nord) VALUES
  (1001, 10, 1, 'Продажи',      1),
  (1002, 10, 2, 'Менеджеры',    2),
  (2001, 20, 3, 'Сделки',       1);

INSERT INTO widget_controls (nwidgetid, ncontrolid, nord) VALUES
  (1001, 12, 1),   -- city   -> первый ?
  (1001, 14, 2),   -- period -> второй ?
  (1002, 12, 1),   -- city   -> первый ?
  (2001, 102, 1);  -- segment -> первый ?
