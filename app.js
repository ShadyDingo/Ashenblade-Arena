import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const SUPABASE_URL = 'https://xnixdnfjafujehdengpl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9SHEEaDSo66P6RnXeCF28g_BQlJm0d2';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const app = document.querySelector('#app');
const accountControls = document.querySelector('#account-controls');

const state = {
  session: null,
  onboarding: null,
  skills: [],
  hub: null,
  loading: true,
  notice: null,
  draft: {
    primary: null,
    secondary: null,
    useSecondary: false,
    supplementals: new Set(),
  },
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setNotice(message, type = 'info') {
  state.notice = message ? { message, type } : null;
}

function noticeMarkup() {
  if (!state.notice) return '';
  return `<div class="notice notice-${state.notice.type}">${escapeHtml(state.notice.message)}</div>`;
}

function friendlyError(error) {
  const message = error?.message || String(error || 'Something went wrong.');
  return message
    .replace('duplicate key value violates unique constraint "profiles_display_name_key"', 'That character name has already been claimed.')
    .replace('Invalid login credentials', 'That email/password combination was not accepted.');
}

function formatRested(seconds = 0) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function skillByKey(key) {
  return state.skills.find((skill) => skill.key === key);
}

function selectedCount() {
  return 1 + (state.draft.useSecondary && state.draft.secondary ? 1 : 0) + state.draft.supplementals.size;
}

function supplementalLimit() {
  return state.draft.useSecondary ? 4 : 5;
}

function isDraftValid() {
  if (!state.draft.primary) return false;
  if (state.draft.useSecondary && !state.draft.secondary) return false;
  return state.draft.supplementals.size === supplementalLimit() && selectedCount() === 6;
}

function hydrateDraftFromLoadout() {
  const loadout = state.onboarding?.loadout || [];
  if (!loadout.length) {
    state.draft = {
      primary: null,
      secondary: null,
      useSecondary: false,
      supplementals: new Set(),
    };
    return;
  }

  const primary = loadout.find((item) => item.slot_role === 'primary')?.skill_key || null;
  const secondary = loadout.find((item) => item.slot_role === 'secondary')?.skill_key || null;
  const supplementals = loadout
    .filter((item) => item.slot_role === 'supplemental')
    .map((item) => item.skill_key);

  state.draft = {
    primary,
    secondary,
    useSecondary: Boolean(secondary),
    supplementals: new Set(supplementals),
  };
}

async function loadGameData() {
  if (!state.session) return;

  await supabase.rpc('refresh_character_rest');

  const [onboardingResult, skillsResult, hubResult] = await Promise.all([
    supabase.rpc('get_onboarding_state'),
    supabase
      .from('combat_skills')
      .select('key,name,family,fantasy,mechanical_identity,slot_type,sort_order')
      .order('sort_order'),
    supabase
      .from('world_cells')
      .select('id,x,y,name,scenery,danger_rating,generated_content,biome_key')
      .eq('x', 0)
      .eq('y', 0)
      .single(),
  ]);

  if (onboardingResult.error) throw onboardingResult.error;
  if (skillsResult.error) throw skillsResult.error;
  if (hubResult.error) throw hubResult.error;

  state.onboarding = onboardingResult.data;
  state.skills = skillsResult.data || [];
  state.hub = hubResult.data;
  hydrateDraftFromLoadout();
}

async function refresh() {
  state.loading = true;
  render();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    state.session = data.session;

    if (state.session) {
      await loadGameData();
    } else {
      state.onboarding = null;
      state.skills = [];
      state.hub = null;
    }
  } catch (error) {
    setNotice(friendlyError(error), 'error');
  } finally {
    state.loading = false;
    render();
  }
}

function renderAccountControls() {
  if (!state.session) {
    accountControls.innerHTML = '';
    return;
  }

  accountControls.innerHTML = `
    <div class="account-chip">
      <span>${escapeHtml(state.session.user.email || 'Adventurer')}</span>
      <button class="btn btn-ghost" id="sign-out" type="button">Sign out</button>
    </div>
  `;

  document.querySelector('#sign-out')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

function renderLoading() {
  app.innerHTML = `
    <section class="loading-card">
      <div class="rune-spinner" aria-hidden="true"></div>
      <p>Opening the gates to Cinderwatch…</p>
    </section>
  `;
}

function renderAuth() {
  app.innerHTML = `
    <section class="panel narrow">
      <p class="eyebrow">The world is waiting</p>
      <h1>Enter Ashenblade.</h1>
      <p class="lede">Sign in to begin a persistent adventure where your build is classless, the world is shared, and the frontier grows one discovery at a time.</p>
      ${noticeMarkup()}
      <form id="auth-form" class="form-stack">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters" />
        </div>
        <div class="button-row">
          <button class="btn btn-primary" type="submit" data-auth-action="signin">Sign in</button>
          <button class="btn btn-secondary" type="button" data-auth-action="signup">Create account</button>
        </div>
      </form>
      <div class="notice notice-info">New accounts may need to confirm their email before entering the game.</div>
    </section>
  `;

  const form = document.querySelector('#auth-form');
  const signUpButton = document.querySelector('[data-auth-action="signup"]');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleAuth('signin', form);
  });

  signUpButton?.addEventListener('click', async () => {
    await handleAuth('signup', form);
  });
}

async function handleAuth(action, form) {
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) return;

  setNotice(null);
  state.loading = true;
  render();

  try {
    if (action === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        state.loading = false;
        setNotice('Account created. Check your email to confirm your address, then sign in.', 'success');
        render();
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }

    await refresh();
  } catch (error) {
    state.loading = false;
    setNotice(friendlyError(error), 'error');
    render();
  }
}

function renderCharacterCreation() {
  app.innerHTML = `
    <section class="panel narrow">
      <p class="eyebrow">Character creation · Step 1</p>
      <h1>Name your legend.</h1>
      <p class="lede">This name will appear on discoveries, records, future social systems, and the history of the shared world.</p>
      ${noticeMarkup()}
      <form id="character-form" class="form-stack">
        <div class="field">
          <label for="display-name">Character name</label>
          <input id="display-name" name="displayName" type="text" minlength="3" maxlength="24" pattern="[A-Za-z0-9 _'-]+" required autocomplete="off" placeholder="Seraphine, Iron Jack, Rowan…" />
        </div>
        <p class="muted small">3–24 characters. Letters, numbers, spaces, apostrophes, underscores, and hyphens are supported.</p>
        <button class="btn btn-primary" type="submit">Claim this name</button>
      </form>
    </section>
  `;

  document.querySelector('#character-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const displayName = String(formData.get('displayName') || '').trim();
    if (!displayName) return;

    state.loading = true;
    setNotice(null);
    render();

    const { error } = await supabase.rpc('create_character', { p_display_name: displayName });
    if (error) {
      state.loading = false;
      setNotice(friendlyError(error), 'error');
      render();
      return;
    }

    await refresh();
  });
}

function skillCard(skill, selected, role) {
  return `
    <button class="skill-card ${selected ? 'selected' : ''}" type="button" data-skill="${escapeHtml(skill.key)}" data-role="${role}">
      <span class="check">✓</span>
      <span class="family">${escapeHtml(skill.family)}</span>
      <strong>${escapeHtml(skill.name)}</strong>
      <p>${escapeHtml(skill.mechanical_identity)}</p>
    </button>
  `;
}

function summarySlot(label, skillKey, roleClass = '') {
  const skill = skillByKey(skillKey);
  if (!skill) return `<div class="summary-slot empty"><b>${escapeHtml(label)}</b>Not selected</div>`;
  return `<div class="summary-slot ${roleClass}"><b>${escapeHtml(label)}</b>${escapeHtml(skill.name)}</div>`;
}

function renderSkillBuilder() {
  const primarySkills = state.skills.filter((skill) => skill.slot_type === 'primary');
  const supplementalSkills = state.skills.filter((skill) => skill.slot_type === 'supplemental');
  const suppLimit = supplementalLimit();
  const total = selectedCount();

  const supplementalSlots = [...state.draft.supplementals];
  while (supplementalSlots.length < suppLimit) supplementalSlots.push(null);

  app.innerHTML = `
    <section class="panel">
      <div class="onboarding-head">
        <div>
          <p class="eyebrow">Character creation · Step 2</p>
          <h2>Choose six combat skills.</h2>
          <p class="lede">Your Primary establishes your core fighting discipline. Add an optional Secondary discipline, then shape the build with Supplemental skills that modify damage, crits, defenses, procs, sustain, summons, and more.</p>
        </div>
        <div class="progress-pill">${total} / 6 selected</div>
      </div>
      ${noticeMarkup()}

      <div class="builder-layout">
        <div>
          <section class="skill-section">
            <div class="section-heading">
              <div>
                <h3>1. Primary discipline</h3>
                <p>Required. This is the core weapon or magic discipline of your build.</p>
              </div>
            </div>
            <div class="skill-grid">
              ${primarySkills.map((skill) => skillCard(skill, state.draft.primary === skill.key, 'primary')).join('')}
            </div>
          </section>

          <section class="skill-section">
            <div class="section-heading">
              <div>
                <h3>2. Secondary discipline</h3>
                <p>Optional. Taking one leaves four Supplemental slots; skipping it leaves five.</p>
              </div>
              <button class="btn ${state.draft.useSecondary ? 'btn-danger' : 'btn-secondary'}" id="toggle-secondary" type="button">
                ${state.draft.useSecondary ? 'Remove Secondary' : 'Add Secondary'}
              </button>
            </div>
            ${state.draft.useSecondary ? `
              <div class="skill-grid">
                ${primarySkills
                  .filter((skill) => skill.key !== state.draft.primary)
                  .map((skill) => skillCard(skill, state.draft.secondary === skill.key, 'secondary'))
                  .join('')}
              </div>
            ` : '<div class="notice notice-info">You are building a focused character with one Primary discipline and five Supplemental skills.</div>'}
          </section>

          <section class="skill-section">
            <div class="section-heading">
              <div>
                <h3>3. Supplemental skills</h3>
                <p>Choose exactly ${suppLimit}. These create the deeper mechanics and identity of your build.</p>
              </div>
            </div>
            <div class="skill-grid">
              ${supplementalSkills.map((skill) => skillCard(skill, state.draft.supplementals.has(skill.key), 'supplemental')).join('')}
            </div>
          </section>
        </div>

        <aside class="builder-summary">
          <p class="eyebrow">Your build</p>
          <h3>${escapeHtml(state.onboarding?.profile?.display_name || 'Adventurer')}</h3>
          <div class="summary-list">
            ${summarySlot('Primary', state.draft.primary, 'primary')}
            ${state.draft.useSecondary ? summarySlot('Secondary', state.draft.secondary, 'secondary') : ''}
            ${supplementalSlots.map((key, index) => summarySlot(`Supplemental ${index + 1}`, key)).join('')}
          </div>
          <div class="warning-copy">For this prototype, beginning your adventure permanently locks these six skills. Respec systems can be designed later.</div>
          <button class="btn btn-primary" id="begin-adventure" type="button" style="width:100%;margin-top:12px" ${isDraftValid() ? '' : 'disabled'}>
            Begin adventure
          </button>
        </aside>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-skill]').forEach((button) => {
    button.addEventListener('click', () => {
      const skillKey = button.dataset.skill;
      const role = button.dataset.role;

      setNotice(null);
      if (role === 'primary') {
        if (state.draft.secondary === skillKey) state.draft.secondary = null;
        state.draft.primary = skillKey;
      } else if (role === 'secondary') {
        if (state.draft.primary === skillKey) return;
        state.draft.secondary = skillKey;
      } else if (role === 'supplemental') {
        if (state.draft.supplementals.has(skillKey)) {
          state.draft.supplementals.delete(skillKey);
        } else if (state.draft.supplementals.size < supplementalLimit()) {
          state.draft.supplementals.add(skillKey);
        } else {
          setNotice(`You can select ${supplementalLimit()} Supplemental skills with this build shape.`, 'error');
        }
      }
      render();
    });
  });

  document.querySelector('#toggle-secondary')?.addEventListener('click', () => {
    state.draft.useSecondary = !state.draft.useSecondary;
    if (!state.draft.useSecondary) state.draft.secondary = null;

    while (state.draft.supplementals.size > supplementalLimit()) {
      const last = [...state.draft.supplementals].at(-1);
      state.draft.supplementals.delete(last);
    }
    setNotice(null);
    render();
  });

  document.querySelector('#begin-adventure')?.addEventListener('click', beginAdventure);
}

async function beginAdventure() {
  if (!isDraftValid()) return;

  state.loading = true;
  setNotice(null);
  render();

  const { error: configureError } = await supabase.rpc('configure_combat_loadout', {
    p_primary: state.draft.primary,
    p_secondary: state.draft.useSecondary ? state.draft.secondary : null,
    p_supplementals: [...state.draft.supplementals],
  });

  if (configureError) {
    state.loading = false;
    setNotice(friendlyError(configureError), 'error');
    render();
    return;
  }

  const { error: lockError } = await supabase.rpc('lock_combat_loadout');
  if (lockError) {
    state.loading = false;
    setNotice(friendlyError(lockError), 'error');
    render();
    return;
  }

  setNotice('Your path is chosen. Welcome to Cinderwatch.', 'success');
  await refresh();
}

function serviceDetails(name) {
  const details = {
    'The Wayfarer Inn': ['♨', 'Rest, rumors, future social services, and a natural home for rested-time systems.'],
    'General Store': ['✦', 'Basic supplies and adventuring essentials. Trading inventory comes in a later slice.'],
    'Blacksmith': ['⚒', 'Weapons, armor, repairs, and eventually player smithing services.'],
    'Notice Board': ['☷', 'Future contracts, local requests, bounties, discoveries, and world events.'],
    'Training Yard': ['⚔', 'Review your combat disciplines and eventually test builds against training targets.'],
  };
  return details[name] || ['◆', 'A Cinderwatch service awaiting further development.'];
}

function renderHub() {
  const profile = state.onboarding.profile;
  const character = state.onboarding.character;
  const loadout = state.onboarding.loadout || [];
  const hub = state.hub || {};
  const content = hub.generated_content || {};
  const amenities = content.amenities || ['The Wayfarer Inn', 'General Store', 'Blacksmith', 'Notice Board', 'Training Yard'];
  const constructionSites = content.construction_sites || [];

  const loadoutChips = loadout.map((item) => {
    const skill = skillByKey(item.skill_key);
    const roleClass = item.slot_role === 'primary' ? 'primary' : item.slot_role === 'secondary' ? 'secondary' : '';
    return `<span class="chip ${roleClass}">${escapeHtml(skill?.name || item.skill_key)} · ${escapeHtml(item.slot_role)}</span>`;
  }).join('');

  app.innerHTML = `
    <section class="hero-panel">
      <div class="hub-hero">
        <div class="hub-title-row">
          <div>
            <p class="eyebrow">Central hub · Coordinate 0, 0</p>
            <h1>${escapeHtml(hub.name || 'Cinderwatch')}</h1>
            <p class="lede">${escapeHtml(hub.scenery || 'A bright frontier settlement gathered around an ancient black-stone beacon.')}</p>
          </div>
          <div class="character-badge">
            <span class="muted small">Adventurer</span>
            <b>${escapeHtml(profile?.display_name || 'Unknown')}</b>
            <span class="small muted">Build locked · 6 disciplines</span>
          </div>
        </div>

        <div class="stat-strip">
          <div class="stat"><span>Adventure level</span><strong>${Number(character.adventure_level || 1)}</strong></div>
          <div class="stat"><span>Rested time</span><strong>${formatRested(character.rested_seconds)}</strong></div>
          <div class="stat"><span>World position</span><strong>${character.current_x}, ${character.current_y}</strong></div>
        </div>
      </div>

      <div class="hub-body">
        ${noticeMarkup()}
        <div class="hub-grid">
          <div>
            <p class="eyebrow">Cinderwatch services</p>
            <h2>A frontier built to grow.</h2>
            <div class="service-grid">
              ${amenities.map((name) => {
                const [icon, copy] = serviceDetails(name);
                return `<article class="service-card"><div class="service-icon">${icon}</div><h3>${escapeHtml(name)}</h3><p class="muted small">${escapeHtml(copy)}</p></article>`;
              }).join('')}
            </div>

            ${constructionSites.length ? `
              <div style="margin-top:24px">
                <p class="eyebrow">Under construction</p>
                <div class="loadout-chips">${constructionSites.map((site) => `<span class="chip">${escapeHtml(site)}</span>`).join('')}</div>
              </div>
            ` : ''}
          </div>

          <aside>
            <div class="builder-summary" style="position:static">
              <p class="eyebrow">Combat identity</p>
              <h3>Your six disciplines</h3>
              <div class="loadout-chips">${loadoutChips}</div>
            </div>

            <div class="builder-summary" style="position:static;margin-top:16px">
              <p class="eyebrow">The frontier</p>
              <h3>Choose a direction.</h3>
              <p class="muted small">The expedition timer and shared world grid are already modeled in the backend. The next playable slice will resolve first-time discoveries into persistent locations.</p>
              <div class="direction-grid" aria-label="Exploration directions">
                <button class="direction north" disabled title="Expedition resolution is the next build">↑ N</button>
                <button class="direction west" disabled title="Expedition resolution is the next build">← W</button>
                <div class="center">◆</div>
                <button class="direction east" disabled title="Expedition resolution is the next build">E →</button>
                <button class="direction south" disabled title="Expedition resolution is the next build">↓ S</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  `;
}

function render() {
  renderAccountControls();

  if (state.loading) {
    renderLoading();
    return;
  }

  if (!state.session) {
    renderAuth();
    return;
  }

  if (!state.onboarding?.character) {
    renderCharacterCreation();
    return;
  }

  if (!state.onboarding.character.combat_loadout_locked_at) {
    renderSkillBuilder();
    return;
  }

  renderHub();
}

supabase.auth.onAuthStateChange((_event, session) => {
  const changed = session?.access_token !== state.session?.access_token;
  state.session = session;
  if (changed) queueMicrotask(() => refresh());
});

refresh();
