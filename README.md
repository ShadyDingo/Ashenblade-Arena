# Ashenblade Arena

Ashenblade Arena is a browser-based online high-fantasy RPG/MMO built around classless character builds, persistent shared exploration, PvE progression, crafting and gathering, and eventually competitive PvP.

## Core pillars

- **Classless builds:** characters choose six combat skills that define their fighting style instead of selecting a fixed class.
- **Persistent shared world:** the world expands on a grid. The first player to discover a coordinate permanently reveals that generated location for everyone.
- **Meaningful exploration:** distance from civilization increases travel time, danger, rewards, resources, monsters, secrets, and unusual encounters.
- **Universal professions:** all noncombat skills can be trained by every character.
- **Rested progression:** rested play earns 150% XP; after rested time is depleted, play may continue at 50% XP.
- **Living hub:** Cinderwatch begins as the central settlement with essential services and construction sites that can support future systems.

## Visual direction

Ashenblade Arena uses **bright, vivid high fantasy** as its baseline. Environments, creatures, equipment, spells, resources, and UI art should have strong silhouettes, rich color separation, readable lighting, and visually memorable details. Dark, eerie, tragic, volcanic, cursed, or horrific places are welcome, but darkness is contrast—not the default treatment of the entire world.

The target is adventurous and visually appealing rather than uniformly grimdark.

## Technology

- ChatGPT Sites / web client
- Supabase: Auth, Postgres, RLS, Realtime and server-authoritative game operations
- GitHub: source control and project history

Replit is not part of the stack.

## Current foundation

The connected Supabase project already contains the initial persistent models for accounts/characters, level progression, rested time, combat and noncombat skills, Cinderwatch, biome transitions, world cells, discovery credit, timed grid travel and XP event auditing.

The immediate development target is the first playable loop:

1. Sign in
2. Choose a character name
3. Choose and lock six combat skills
4. Enter Cinderwatch
5. Inspect hub services
6. Explore north/south/east/west
7. Resolve a timed expedition
8. Reveal or revisit a persistent world cell
9. Encounter monsters/resources/secrets
10. Gain progression and return to the hub
