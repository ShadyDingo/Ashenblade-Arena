# Combat Skill Foundation

Ashenblade Arena uses six selected combat skills rather than fixed classes.

## Loadout rules

Every character locks exactly six combat skills before leaving Cinderwatch:

- **1 Primary** — required. This is the build's core weapon, spell, or combat discipline.
- **0–1 Secondary** — optional. A second primary-capable discipline used for hybrid builds, weapon swaps, or a second combat identity.
- **4–5 Supplemental** — passive or conditional specializations that modify how the chosen disciplines perform.

A build therefore takes one of two shapes:

- `1 Primary + 1 Secondary + 4 Supplemental`
- `1 Primary + 5 Supplemental`

Primary-capable disciplines may be placed in the Primary or Secondary slot. Supplemental skills can only occupy Supplemental slots.

## Skill progression

Every selected combat skill has its own level from **1–100** and its own XP pool. Skill effects scale continuously with level unless a particular skill states otherwise.

A simple normalized scaling value is used throughout the rules:

`skill_power = skill_level / 100`

Examples:

- A +20% maximum damage specialization grants +0.2% at level 1 and +20% at level 100.
- A 25% maximum proc chance grants 0.25% at level 1 and 25% at level 100.
- Accuracy/proficiency skills can compare attacker skill against defender armor proficiency, producing penalties when the attacker is substantially undertrained.

Numbers in the initial catalog are **balance targets, not permanent constants**. They live as data so they can be tuned without restructuring characters.

## Damage vocabulary

The first weapon damage families are:

- Slashing
- Piercing
- Crushing
- Ranged
- Arcane / elemental

Individual weapons can carry one or more tags. Supplemental skills key off those tags rather than being hard-wired to a single item.

## Design goal

The system should support recognizable archetypes while making unusual hybrids legitimate. A sword-and-board guardian, two-handed executioner, bleed duelist, spellblade, frost archer, necromantic polearm fighter, support bard, or alchemical trapper should all emerge from combinations of skills rather than from a class-selection screen.
