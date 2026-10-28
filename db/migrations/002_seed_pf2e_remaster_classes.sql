INSERT INTO rulesets (ruleset_id, system_id, min_version, max_version, status)
VALUES ('pf2e-remaster', 'pf2e', '6.0.0', NULL, 'experimental')
ON CONFLICT (ruleset_id) DO NOTHING;

INSERT INTO classes (class_id, ruleset_id, name, priority, support_status, pf2e_slug)
VALUES
  ('alchemist', 'pf2e-remaster', 'Alchemist', 'P0', 'experimental', 'alchemist'),
  ('animist', 'pf2e-remaster', 'Animist', 'P0', 'experimental', 'animist'),
  ('barbarian', 'pf2e-remaster', 'Barbarian', 'P1', 'experimental', 'barbarian'),
  ('bard', 'pf2e-remaster', 'Bard', 'P0', 'experimental', 'bard'),
  ('champion', 'pf2e-remaster', 'Champion', 'P0', 'experimental', 'champion'),
  ('cleric', 'pf2e-remaster', 'Cleric', 'P0', 'experimental', 'cleric'),
  ('commander', 'pf2e-remaster', 'Commander', 'P0', 'experimental', 'commander'),
  ('druid', 'pf2e-remaster', 'Druid', 'P0', 'experimental', 'druid'),
  ('exemplar', 'pf2e-remaster', 'Exemplar', 'P0', 'experimental', 'exemplar'),
  ('fighter', 'pf2e-remaster', 'Fighter', 'P1', 'experimental', 'fighter'),
  ('guardian', 'pf2e-remaster', 'Guardian', 'P1', 'experimental', 'guardian'),
  ('gunslinger', 'pf2e-remaster', 'Gunslinger', 'P1', 'experimental', 'gunslinger'),
  ('inventor', 'pf2e-remaster', 'Inventor', 'P0', 'experimental', 'inventor'),
  ('investigator', 'pf2e-remaster', 'Investigator', 'P1', 'experimental', 'investigator'),
  ('kineticist', 'pf2e-remaster', 'Kineticist', 'P0', 'experimental', 'kineticist'),
  ('magus', 'pf2e-remaster', 'Magus', 'P0', 'experimental', 'magus'),
  ('monk', 'pf2e-remaster', 'Monk', 'P1', 'experimental', 'monk'),
  ('necromancer', 'pf2e-remaster', 'Necromancer', 'P0', 'experimental', 'necromancer'),
  ('oracle', 'pf2e-remaster', 'Oracle', 'P0', 'experimental', 'oracle'),
  ('psychic', 'pf2e-remaster', 'Psychic', 'P0', 'experimental', 'psychic'),
  ('ranger', 'pf2e-remaster', 'Ranger', 'P0', 'experimental', 'ranger'),
  ('rogue', 'pf2e-remaster', 'Rogue', 'P1', 'experimental', 'rogue'),
  ('runesmith', 'pf2e-remaster', 'Runesmith', 'P0', 'experimental', 'runesmith'),
  ('sorcerer', 'pf2e-remaster', 'Sorcerer', 'P0', 'experimental', 'sorcerer'),
  ('summoner', 'pf2e-remaster', 'Summoner', 'P0', 'experimental', 'summoner'),
  ('swashbuckler', 'pf2e-remaster', 'Swashbuckler', 'P1', 'experimental', 'swashbuckler'),
  ('thaumaturge', 'pf2e-remaster', 'Thaumaturge', 'P0', 'experimental', 'thaumaturge'),
  ('witch', 'pf2e-remaster', 'Witch', 'P0', 'experimental', 'witch'),
  ('wizard', 'pf2e-remaster', 'Wizard', 'P0', 'experimental', 'wizard')
ON CONFLICT (class_id) DO NOTHING;
