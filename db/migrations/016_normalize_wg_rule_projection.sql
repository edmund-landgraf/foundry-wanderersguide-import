-- Indexed/deconstructed projection over wg_keyword_snapshot.
-- The JSON snapshot remains the source copy; these tables are the fast query
-- surface for matching and rule inspection.
CREATE TABLE IF NOT EXISTS wg_rule_objects (
  rule_object_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  wg_id bigint NOT NULL,
  wg_name text,
  wg_type text,
  wg_level integer,
  wg_content_source_id bigint,
  source_term_snapshot_id bigint NOT NULL REFERENCES wg_keyword_snapshot(snapshot_id) ON DELETE CASCADE,
  UNIQUE (source_table, wg_id)
);

CREATE TABLE IF NOT EXISTS wg_rule_operations (
  rule_operation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_object_id bigint NOT NULL REFERENCES wg_rule_objects(rule_object_id) ON DELETE CASCADE,
  operation_index integer NOT NULL,
  operation_id text,
  operation_type text NOT NULL,
  operation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (rule_object_id, operation_index)
);

CREATE TABLE IF NOT EXISTS wg_rule_select_options (
  rule_option_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_operation_id bigint NOT NULL REFERENCES wg_rule_operations(rule_operation_id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  option_id text,
  option_type text,
  option_title text,
  option_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (rule_operation_id, option_index)
);

CREATE INDEX IF NOT EXISTS idx_wg_rule_objects_name
  ON wg_rule_objects(lower(wg_name), source_table);
CREATE INDEX IF NOT EXISTS idx_wg_rule_operations_type
  ON wg_rule_operations(operation_type, operation_id);
CREATE INDEX IF NOT EXISTS idx_wg_rule_select_options_title
  ON wg_rule_select_options(lower(option_title));

INSERT INTO wg_rule_objects
  (source_table, wg_id, wg_name, wg_type, wg_level, wg_content_source_id, source_term_snapshot_id)
SELECT s.source_table, s.wg_id, s.wg_name,
       s.row_data->>'type',
       CASE
         WHEN s.source_table = 'spell' THEN NULLIF(s.row_data->>'rank', '')::integer
         ELSE NULLIF(s.row_data->>'level', '')::integer
       END,
       NULLIF(s.row_data->>'content_source_id', '')::bigint,
       s.snapshot_id
FROM wg_keyword_snapshot s
WHERE s.source_table IN ('class', 'ability_block', 'item', 'spell')
  AND NOT EXISTS (
    SELECT 1 FROM wg_rule_objects o
    WHERE o.source_table = s.source_table AND o.wg_id = s.wg_id
  );

INSERT INTO wg_rule_operations
  (rule_object_id, operation_index, operation_id, operation_type, operation_data)
SELECT o.rule_object_id, x.operation_index - 1,
       x.operation->>'id', x.operation->>'type',
       COALESCE(x.operation->'data', '{}'::jsonb)
FROM wg_rule_objects o
JOIN wg_keyword_snapshot s
  ON s.source_table = o.source_table AND s.wg_id = o.wg_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.row_data->'operations') = 'array'
       THEN s.row_data->'operations' ELSE '[]'::jsonb END
)
  WITH ORDINALITY AS x(operation, operation_index)
WHERE NOT EXISTS (
  SELECT 1 FROM wg_rule_operations r
  WHERE r.rule_object_id = o.rule_object_id
    AND r.operation_index = x.operation_index - 1
);

INSERT INTO wg_rule_select_options
  (rule_operation_id, option_index, option_id, option_type, option_title, option_data)
SELECT r.rule_operation_id, x.option_index - 1,
       x.option->>'id', x.option->>'type', x.option->>'title', x.option
FROM wg_rule_operations r
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(r.operation_data->'optionsPredefined', '[]'::jsonb)
) WITH ORDINALITY AS x(option, option_index)
WHERE r.operation_type = 'select'
  AND NOT EXISTS (
    SELECT 1 FROM wg_rule_select_options o
    WHERE o.rule_operation_id = r.rule_operation_id
      AND o.option_index = x.option_index - 1
  );

