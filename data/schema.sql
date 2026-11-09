-- Схема упрощённого дашборда.
-- Имена полей сохранены в венгерской нотации как в оригинальном проекте.

CREATE TABLE IF NOT EXISTS dashboards (
  nid INTEGER PRIMARY KEY,
  stitle VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS screens (
  nid INTEGER PRIMARY KEY,
  ndashboardid INTEGER NOT NULL,
  stitle VARCHAR,
  norder INTEGER
);

CREATE TABLE IF NOT EXISTS controls (
  nid INTEGER PRIMARY KEY,
  nscreenid INTEGER NOT NULL,
  scode VARCHAR NOT NULL,
  slabel VARCHAR,
  nviewtype INTEGER NOT NULL,      -- 1 = DropDown, 2 = DatePicker, 3 = MultiSelect
  nord INTEGER,
  nparentcontrolid INTEGER,        -- ссылка на контрол-родитель (NULL — независимый)
  squery VARCHAR NOT NULL          -- SQL источника строк контрола: value/name для клиента, key для фильтра детей, значение родителя подставляется через ?
);

-- Значение контрола по умолчанию. Применяется только к контролам,
-- чью зависимость не переопределил запрос (см. dashboard.service.ts):
-- явный параметр региона означает, что город по умолчанию нужно выбрать заново.
CREATE TABLE IF NOT EXISTS control_defaults (
  ncontrolid INTEGER NOT NULL,
  svalue VARCHAR NOT NULL
);

-- Датасет: именованный SQL-источник данных для виджетов.
-- Параметры в ssql обозначаются `?` и заполняются значениями контролов,
-- за которыми закреплён виджет. Порядок `?` = порядок scode в widget_controls.
CREATE TABLE IF NOT EXISTS datasets (
  nid INTEGER PRIMARY KEY,
  stitle VARCHAR NOT NULL,
  ssql VARCHAR NOT NULL
);

-- Виджет на экране. Данные берёт из датасета, фильтры — из привязанных контролов.
CREATE TABLE IF NOT EXISTS widgets (
  nid INTEGER PRIMARY KEY,
  nscreenid INTEGER NOT NULL,
  ndatasetid INTEGER NOT NULL,
  stitle VARCHAR,
  nord INTEGER
);

-- Привязка виджета к контролам: значения этих контролов подставляются
-- в ssql датасета как bind-параметры, в порядке nord.
CREATE TABLE IF NOT EXISTS widget_controls (
  nwidgetid INTEGER NOT NULL,
  ncontrolid INTEGER NOT NULL,
  nord INTEGER
);
