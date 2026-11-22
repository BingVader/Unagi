// Pokemon Roster & Companion Characters
const POKEMON_BASE = window.__POKEMON_BASE_URI__ || 'pokemon/';

window.POKEMON = {
  pikachu: {
    name: 'Pikachu',
    type: 'Electric ⚡',
    cry: 'Pika-pi! ⚡',
    color: '#ffcb05',
    sprite: 'pikachu.gif',
    width: 60,
    height: 60
  },
  charmander: {
    name: 'Charmander',
    type: 'Fire 🔥',
    cry: 'Char-char! 🔥',
    color: '#f08030',
    sprite: 'charmander.gif',
    width: 58,
    height: 58
  },
  squirtle: {
    name: 'Squirtle',
    type: 'Water 💧',
    cry: 'Squirtle-squirt! 💧',
    color: '#6890f0',
    sprite: 'squirtle.gif',
    width: 58,
    height: 58
  },
  bulbasaur: {
    name: 'Bulbasaur',
    type: 'Grass 🍃',
    cry: 'Bulba-saur! 🍃',
    color: '#78c850',
    sprite: 'bulbasaur.gif',
    width: 56,
    height: 56
  },
  eevee: {
    name: 'Eevee',
    type: 'Normal ✨',
    cry: 'Eev-ee! ✨',
    color: '#c69956',
    sprite: 'eevee.gif',
    width: 58,
    height: 58
  },
  gengar: {
    name: 'Gengar',
    type: 'Ghost 👻',
    cry: 'Gen-gaaar! 👻',
    color: '#705898',
    sprite: 'gengar.gif',
    width: 62,
    height: 62
  },
  snorlax: {
    name: 'Snorlax',
    type: 'Normal 💤',
    cry: 'Snoooor... 💤',
    color: '#4a6b6c',
    sprite: 'snorlax.gif',
    width: 72,
    height: 68
  },
  psyduck: {
    name: 'Psyduck',
    type: 'Water 🌀',
    cry: 'Psy... duck? 🌀',
    color: '#ecd060',
    sprite: 'psyduck.gif',
    width: 58,
    height: 58
  },
  jigglypuff: {
    name: 'Jigglypuff',
    type: 'Fairy 🎵',
    cry: 'Jiggly-puff! 🎵',
    color: '#f8a8b8',
    sprite: 'jigglypuff.gif',
    width: 54,
    height: 54
  },
  mew: {
    name: 'Mew',
    type: 'Psychic 🌟',
    cry: 'Mew! ✨',
    color: '#f85888',
    sprite: 'mew.gif',
    width: 56,
    height: 56
  }
};

window.getPokemonSprite = function (id) {
  const p = window.POKEMON[id] || window.POKEMON.pikachu;
  return `${POKEMON_BASE}${p.sprite}`;
};

const SPRITE_BASE = window.__SPRITES_BASE_URI__ || 'sprites/';
window.spriteUrl = (id, pose) => {
  const sp = window.CHARACTERS[id]?.sprite;
  if (!sp) return null;
  return `${SPRITE_BASE}${id}/${sp[pose] || sp.idle}`;
};

// Legacy and meme character fallbacks
window.CHARACTERS = {
  dog: {
    name: 'Cute Dog',
    upright: false,
    svg: `<svg viewBox="0 0 160 130"><ellipse cx="70" cy="74" rx="46" ry="26" fill="#e8994a"/><circle cx="118" cy="44" r="24" fill="#e8994a"/><circle cx="126" cy="40" r="4" fill="#2b1d14"/></svg>`
  },
  tom: {
    name: 'Cartoon Cat',
    upright: false,
    svg: `<svg viewBox="0 0 160 130"><ellipse cx="70" cy="74" rx="46" ry="26" fill="#8d99ae"/><circle cx="118" cy="44" r="24" fill="#8d99ae"/></svg>`
  },
  mohanlal: {
    name: 'Mohanlal',
    upright: true,
    svg: `<svg viewBox="0 0 160 130"><ellipse cx="78" cy="44" rx="16" ry="20" fill="#d49b6a"/><rect x="65" y="46" width="26" height="32" fill="#9d0208"/></svg>`
  },
  cj: {
    name: 'CJ',
    upright: true,
    svg: `<svg viewBox="0 0 160 130"><ellipse cx="78" cy="44" rx="16" ry="20" fill="#72492f"/><rect x="65" y="46" width="26" height="32" fill="#f8f9fa"/></svg>`
  }
};

window.ACCESSORIES = {};
window.buddyMarkup = function (id, accessory) {
  if (window.POKEMON[id]) {
    const poke = window.POKEMON[id];
    const src = window.getPokemonSprite(id);
    return `<div class="pokemon-container">
      <img class="pokemon-sprite" src="${src}" alt="${poke.name}" />
      <div class="shadow-ellipse"></div>
    </div>`;
  }
  const c = window.CHARACTERS[id] || window.CHARACTERS.dog;
  return c.svg || '';
};
