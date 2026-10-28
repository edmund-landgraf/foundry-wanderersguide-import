-- A non-invasive mirror of the current runtime constants. The importer does
-- not read this table yet; later refactor PRs can migrate one rule family at
-- a time and compare database output with the existing code.

CREATE TABLE IF NOT EXISTS rule_definitions (
  rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_key text NOT NULL UNIQUE,
  rule_kind text NOT NULL,
  source_file text NOT NULL,
  source_symbol text,
  class_id text REFERENCES classes(class_id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('mirror-only', 'proposed', 'active', 'retired')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_definitions_kind ON rule_definitions(rule_kind);
CREATE INDEX IF NOT EXISTS idx_rule_definitions_class ON rule_definitions(class_id);

INSERT INTO rule_definitions (rule_key, rule_kind, source_file, source_symbol, payload, status, notes)
VALUES
('mapping.skip_items', 'item-filter', 'scripts/mapping.js', 'SKIP_ITEMS', '{"names":["fist"]}', 'mirror-only', 'Built-in strike is not imported as an item.'),
('mapping.attribute_keys', 'attribute-map', 'scripts/mapping.js', 'ATTR_KEYS', '{"STR":"str","DEX":"dex","CON":"con","INT":"int","WIS":"wis","CHA":"cha"}', 'mirror-only', 'WG attribute identifiers to PF2e short keys.'),
('mapping.feat_groups', 'source-groups', 'scripts/mapping.js', 'buildPlan', '{"groups":["ancestryFeats","classFeats","generalAndSkillFeats","otherFeats"]}', 'mirror-only', 'WG content groups treated as feat entries.'),
('mapping.property_runes', 'equipment-rune-list', 'scripts/mapping.js', 'PROPERTY_RUNES', '{"values":["anarchic","axiomatic","ancestral echoing","anchoring","astral","bane","bloodbane","brilliant","conducting","corrosive","crushing","cunning","dancing","disrupting","energizing","fearsome","flaming","frost","ghost touch","grievous","hauling","holy","impactful","keen","kin-warding","pacifying","returning","serrating","shifting","shock","speed","spell-storing","thundering","unholy","vorpal","wounding","energy-resistant","fortification","glamered","invisibility","ready","shadow","slick"]}', 'mirror-only', 'Names accepted while parsing composed equipment names.'),
('mapping.materials', 'equipment-material-map', 'scripts/mapping.js', 'MATERIALS', '{"cold iron":"cold-iron","silver":"silver","adamantine":"adamantine","mithral":"dawnsilver","dawnsilver":"dawnsilver","orichalcum":"orichalcum","darkwood":"duskwood","duskwood":"duskwood","dragonhide":"dragonhide","sovereign steel":"sovereign-steel","djezet":"djezet","inubrix":"inubrix","noqual":"noqual","siccatite":"siccatite","sisterstone":"sisterstone","warpglass":"warpglass","peachwood":"peachwood","abysium":"abysium"}', 'mirror-only', 'WG material names to PF2e slugs.'),
('mapping.material_grades', 'equipment-grade-map', 'scripts/mapping.js', 'GRADES', '{"low-grade":"low","standard-grade":"standard","high-grade":"high","low":"low","standard":"standard","high":"high"}', 'mirror-only', 'WG material grade names to normalized grades.'),
('mapping.rune_tiers', 'equipment-rune-tier-map', 'scripts/mapping.js', 'TIER', '{"":"1","greater":"2","major":"3"}', 'mirror-only', 'Fundamental rune tier mapping.'),
('mapping.kind_types', 'item-type-map', 'scripts/mapping.js', 'KIND_TYPES', '{"ancestry":["ancestry"],"heritage":["heritage"],"background":["background"],"class":["class"],"feat":["feat","action"],"spell":["spell"],"equipment":["weapon","armor","shield","equipment","consumable","treasure","backpack","kit"]}', 'mirror-only', 'Allowed PF2e item types by planned entry kind.'),
('mapping.fallback_image', 'default-value', 'scripts/mapping.js', 'FALLBACK_IMG', '{"value":"icons/svg/mystery-man.svg"}', 'mirror-only', 'Fallback actor portrait.'),
('selections.uuid_pattern', 'selection-parser', 'scripts/selections.js', 'UUID', '{"regex":"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$","flags":"i"}', 'mirror-only', 'WG selection-key UUID recognition.'),
('selections.owner_scopes', 'selection-parser', 'scripts/selections.js', 'selectOpIndex', '{"scopes":["ancestry","background","class"],"feature_collection":"content.feats_features","max_depth":8}', 'mirror-only', 'Owners and recursion bound used to index select operations.'),
('selections.key_scopes', 'selection-parser', 'scripts/selections.js', 'parseSelectionKey', '{"prefixes":["class-feature-<id>","ancestry-section-<id>","<scope>"],"nested_separator":"_","index_suffix":"-N"}', 'mirror-only', 'WG selection-key grammar.'),
('selections.variable_prefixes', 'selection-classifier', 'scripts/selections.js', 'classifySelection', '{"attribute":"ATTRIBUTE_","skill":"SKILL_"}', 'mirror-only', 'WG adjValue prefixes and current handling policy.'),
('selections.computed_language_rule', 'selection-classifier', 'scripts/selections.js', 'classifySelection', '{"list":"LANGUAGE_IDS","scope":"ancestry","nested":false,"status":"included","target":"content.languages"}', 'mirror-only', 'Special computed-state language handling.'),
('coverage.derived_fields', 'coverage-classification', 'scripts/coverage.js', 'DERIVED', '{"values":["ac","proficiencies","senses","speeds","weapons","total_bulk","size","resist_weaks","shield_item","armor_item","character_traits","spell_raw_data","spells"]}', 'mirror-only', 'WG-derived fields PF2e recalculates.'),
('coverage.library_fields', 'coverage-classification', 'scripts/coverage.js', 'LIBRARY', '{"values":["_README","all_traits","all_sources","all_spells","raw_data_dump"]}', 'mirror-only', 'Reference/library data rather than character state.'),
('coverage.metadata_fields', 'coverage-classification', 'scripts/coverage.js', 'META', '{"values":["created_at","updated_at","user_id"]}', 'mirror-only', 'Export metadata.'),
('coverage.expanded_content', 'coverage-classification', 'scripts/coverage.js', 'EXPANDED_CONTENT', '{"values":["focus_spells","innate_spells","inventory_flat"]}', 'mirror-only', 'Content collections expanded into source-path ledger rows.'),
('coverage.class_support_note', 'report-text', 'scripts/coverage.js', 'CLASS_SUPPORT_NOTE', '{"text":"Class support: experimental for every class. No class is verified against WG (see docs/CLASS_COVERAGE.md)."}', 'mirror-only', 'Current release disclaimer.'),
('importer.pack_types', 'compendium-filter', 'scripts/importer.js', 'PACK_TYPES', '{"values":["ancestry","heritage","background","class","feat","spell","weapon","armor","shield","equipment","consumable","treasure","backpack","kit"]}', 'mirror-only', 'Pack item types indexed for matching.'),
('importer.kind_item_types', 'item-type-map', 'scripts/importer.js', 'KIND_ITEM_TYPES', '{"ancestry":["ancestry"],"heritage":["heritage"],"background":["background"],"class":["class"],"feat":["feat","action"],"spell":["spell"]}', 'mirror-only', 'Foundry item types accepted for same-item/grant comparisons.'),
('importer.apply_order', 'apply-order', 'scripts/importer.js', 'applyImport', '{"values":["ancestry","heritage","background","class","feat","spell","equipment"]}', 'mirror-only', 'PF2e item creation order.'),
('importer.choice_policy', 'choice-policy', 'scripts/importer.js', 'resolveChoiceSet', '{"wg_answer":"exactly_one_legal_option","existing_foundry":"reuse_if_still_legal","otherwise":"unresolved_and_pf2e_prompt"}', 'mirror-only', 'Safety policy for ChoiceSet prefill.'),
('importer.grant_policy', 'grant-policy', 'scripts/importer.js', 'explicitGrants', '{"evidence":["pf2e.grantedBy","pf2e.itemGrants","system.location"],"dedupe":"only_same_item_explicitly_granted_by_this_run"}', 'mirror-only', 'Safe duplicate-grant policy.'),
('importer.spell_slot_range', 'spellcasting-policy', 'scripts/importer.js', 'applyImport', '{"min_rank":0,"max_rank":10}', 'mirror-only', 'Spellcasting entry slot construction range.'),
('constants.module', 'module-config', 'scripts/constants.js', 'MODULE_ID', '{"module_id":"foundry-wanderersguide-import","homebrew_folder":"Wanderer\u0027s Guide Homebrew"}', 'mirror-only', 'Module-owned namespace and folder name.'),
('constants.api_hosts', 'integration-config', 'scripts/constants.js', 'FUNCTIONS_URLS', '{"local":"http://127.0.0.1:8000/functions/v1","production":"https://amba.wandersguide.site/functions/v1"}', 'mirror-only', 'API endpoints; credentials are intentionally excluded.'),
('api.error_labels', 'api-error-map', 'scripts/api.js', 'friendlyError', '{"401":"API key rejected","403":"Not allowed for this API key","404":"Function not found on this WG server (is wgui-ext deployed?)","429":"Rate limited"}', 'mirror-only', 'User-facing API error labels.'),
('api.functions', 'api-endpoints', 'scripts/api.js', 'API_CALLS', '{"list_characters":"wgui-ext-list-key-characters","list_campaigns":"wgui-ext-find-key-campaigns","get_campaign":"wgui-ext-find-key-campaigns","export_character":"wgui-export-character"}', 'mirror-only', 'WGUI function names used by the module; no keys or secrets.'),
('dialog.options', 'ui-policy', 'scripts/dialog.js', 'flagsFrom', '{"review_default":true,"parity_default":false,"dry_run_supported":true,"campaign_art_optional":true}', 'mirror-only', 'Import dialog defaults and optional features.')
ON CONFLICT (rule_key) DO UPDATE SET payload = EXCLUDED.payload, notes = EXCLUDED.notes, updated_at = now();
