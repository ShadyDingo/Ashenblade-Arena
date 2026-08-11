# Backend Foundation

Supabase project: **Ashenblade Arena**

## Authority model

The browser may request actions; the backend decides outcomes.

Client code must not be trusted to directly determine or mutate authoritative values such as:

- Character coordinates
- Rested-time balances
- XP awards
- Skill XP awards
- First-discovery ownership
- Generated world-cell content
- Travel completion
- Combat outcomes
- Item creation or loot rolls

Supabase RLS protects exposed player data. Privileged mutations are kept behind validated database/server operations.

## Current persistent systems

- Profiles and unique display names
- One character per account for the initial prototype
- Adventure level 1–100
- Rested progression state
- Combat skill selection and 1–100 progression
- Universal noncombat skill progression
- Cinderwatch at `(0, 0)`
- Persistent world cells
- Biomes and allowed biome transitions
- First discoverer attribution
- Per-character cell discovery
- Timed grid travel
- XP event audit trail
- Data-driven exploration timing
- Data-driven global art direction

## Combat loadout contract

Exactly six combat skills are locked before leaving Cinderwatch.

Valid shapes:

- 1 Primary + 5 Supplemental
- 1 Primary + 1 Secondary + 4 Supplemental

A Primary/Secondary must reference a primary-capable discipline. Supplemental slots must reference supplemental skills. Database constraints and triggers enforce these rules.

## Current catalog size

- 19 primary-capable combat disciplines
- 40 supplemental combat skills
- 59 total selectable combat skills

All combat skills progress independently from level 1 to level 100.

## Skill effect data

Each catalog row includes:

- `slot_type`
- `weapon_tags`
- `max_effect` JSON containing level-100 tuning targets
- `formula_key` describing the scaling/evaluation family

This deliberately separates balance values from combat-engine code.

## Initial combat-skill XP curve

The current 1–100 skill curve reaches approximately 1.805 million cumulative XP at level 100. This is an early tuning baseline and should be adjusted after actual progression loops exist.

## Security and performance

Supabase's security advisor currently reports no security lints.

Foreign-key indexes flagged by the performance advisor were added. Remaining performance notices are unused-index notices, which are expected while the game database contains effectively no player activity yet and should not be treated as reasons to prematurely remove indexes needed by planned access patterns.
