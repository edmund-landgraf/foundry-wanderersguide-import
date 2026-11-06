-- Mirror the live applyImport order. Equipment stays before class.
UPDATE rule_definitions
SET payload = '{"values":["ancestry","heritage","background","equipment","class","feat","spell"]}'::jsonb,
    notes = 'PF2e item creation order. Equipment is before class so an ikon or weapon ChoiceSet can see owned items.',
    updated_at = now()
WHERE rule_key = 'importer.apply_order';
