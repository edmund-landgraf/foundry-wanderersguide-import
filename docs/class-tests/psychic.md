# Psychic (Cha key) - WG 100 "Mirelle Quietvoice"

Imported 2026-10-27 on origin/main e8daedd (worktree D:\repos\fwi-main, junction swapped for the run and restored), GM campaign 42 flow.

Build: Halfling (Twilight), Scholar (Occultism, Assurance Occultism), Psychic L1. The Distant Grasp, Emotional Acceptance, ancestry feat Halfling Luck. Repertoire: Daze, Detect Magic, Message; Force Barrage, Fear.

## Stats (WG vs Foundry)

| | WG | Foundry |
|---|---|---|
| HP | 13 | 13 |
| AC | 15 | 15 |
| Perception | +6 | +6 |
| Fort/Ref/Will | +4/+5/+8 | +4/+5/+8 |
| Class DC / spell DC | 17 / 17 (Cha) | 17 (+7) |
| STR/DEX/CON/INT/WIS/CHA | -1/2/1/0/3/4 | -1/2/1/0/3/4 |
| Slots | cantrip 3, rank-1 1 | Psychic Spells spontaneous occult, slot0 3, slot1 1 |

## Predictions vs result

| Prediction | Result |
|---|---|
| Key Cha on class item (keyAbility.selected) | FAIL: details.keyability cha, but class keyAbility {value:[], selected:null}. Same gap as closed #32. |
| Focus max 2 | PASS: focus 2/2. |
| Unleash Psyche once | PASS (feature + one granted action). |
| Repertoire 2 rank-1 + cantrips | PASS: Daze, Detect Magic, Message, Force Barrage, Fear. Kinetic Ram also present (compendium; check whether The Distant Grasp grants it). |
| Psi cantrips Telekinetic Hand/Projectile/Rend | PARTIAL: Telekinetic Rend from compendium; Telekinetic Hand (Psi) and Telekinetic Projectile (Psi) created as homebrew (no compendium source). |

Unresolved prompts: Assurance (WG Occultism; feat did end up "Assurance (Occultism)", ledger still lists unresolved) and The Distant Grasp dedicationCantrip.

Screenshots: D:\tmp\wgui-newpc\100-{sheet-after,feats,actions,spells-after,import-report}.png