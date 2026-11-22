// Pokemon and Character Dialogues & Speech lines
window.DIALOGUE = {
  pikachu: {
    welcome: () => 'Pika-pi! Let’s crush this sprint! ⚡',
    pomoWork: () => 'Pika! Focus time, let’s build something epic! 🍅',
    pomoBreak: () => 'Pikachu! Break time, recharge your energy! ⚡',
    water: () => 'Stay hydrated! Pika! 💧',
    taskDone: () => 'Pika-pika! Task complete! +25 XP! 🌟',
    completed: () => 'Thunderbolt celebration! Mission complete! ⚡🏆',
    sleepy: () => 'Pika... zzz... 💤',
    pet: () => 'Pikachuuu! ✨💖',
    berry: () => 'Nom nom nom! Delicious Oran Berry! 🍓'
  },
  charmander: {
    welcome: () => 'Char-char! Fired up for today’s code! 🔥',
    pomoWork: () => 'Flame burning bright! Deep focus time! 🍅',
    pomoBreak: () => 'Char! Take a breather and cool down ☕',
    water: () => 'Stay hydrated! Water for you, flame for me! 💧',
    taskDone: () => 'Ember! Sprint task crushed! +25 XP! 🔥',
    completed: () => 'Flame burst! Sprint milestone reached! 🏆',
    sleepy: () => 'Char... tail flame resting... 💤',
    pet: () => 'Charmander! *happy tail flame flicker* 🔥',
    berry: () => 'Char-char! *munching berry* 🍒'
  },
  squirtle: {
    welcome: () => 'Squirtle! Ready to ride the code wave! 💧',
    pomoWork: () => 'Hydro focus mode activated! 🍅',
    pomoBreak: () => 'Squirt! Time to hydrate and stretch! 💧',
    water: () => 'Hydration reminder! Drink plenty of water! 💧',
    taskDone: () => 'Water Gun! Task checked off! +25 XP! 🌊',
    completed: () => 'Squirtle Squad victory dance! 🕶️🏆',
    sleepy: () => 'Squirt... retreating into shell for nap... 💤',
    pet: () => 'Squirtle squirt! 💖',
    berry: () => 'Nom nom! Sweet berry! 🫐'
  },
  bulbasaur: {
    welcome: () => 'Bulba! Ready to grow some clean code! 🍃',
    pomoWork: () => 'Solar focus charging up! 🍅',
    pomoBreak: () => 'Saur! Rest and take in some fresh air 🌿',
    water: () => 'Plants love water, coders do too! 💧',
    taskDone: () => 'Vine Whip! Task completed! +25 XP! 🌱',
    completed: () => 'Bulbasaur bloom! Sprint goals accomplished! 🌸🏆',
    sleepy: () => 'Bulba... resting under the vines... 💤',
    pet: () => 'Bulba-saur! *happy vine wiggle* 🍃',
    berry: () => 'Saur! Fresh berry energy! 🍊'
  },
  eevee: {
    welcome: () => 'Eev-ee! So many evolutions ahead! ✨',
    pomoWork: () => 'Vee! Focus time, let’s learn something new! 🍅',
    pomoBreak: () => 'Eevee! Fluffy stretch break! 🙆',
    water: () => 'Hydration check! Drink up! 💧',
    taskDone: () => 'Swift! Sprint task finished! +25 XP! ✨',
    completed: () => 'Super Eevee celebration! We did it! 🏆',
    sleepy: () => 'Vee... curled up for a nap... 💤',
    pet: () => 'Eev-ee! *happy tail wag* 💖',
    berry: () => 'Vee nom nom! 🍓'
  },
  gengar: {
    welcome: () => 'Kekeke! Gengar materialized for your sprint! 👻',
    pomoWork: () => 'Shadow focus! Vanish all distractions! 🍅',
    pomoBreak: () => 'Kekeke! Sneak away for a break! ☕',
    water: () => 'Drink water before you turn into a ghost! 💧',
    taskDone: () => 'Shadow Ball! Bug obliterated! +25 XP! 💥',
    completed: () => 'Mischief managed! Epic session! 🏆',
    sleepy: () => 'Melting into the shadows for sleep... 💤',
    pet: () => 'Gengaaar! *big toothy grin* 👻',
    berry: () => 'Chomp! Ghost berry devoured! 🍇'
  },
  snorlax: {
    welcome: () => 'Snoooor... Snorlax woke up to cheer your sprint! 💤',
    pomoWork: () => 'Focus heavy like Body Slam! 🍅',
    pomoBreak: () => 'Snack break! My absolute favorite! 🥪',
    water: () => 'Gotta drink water between naps! 💧',
    taskDone: () => 'Heavy Slam! Task crushed! +25 XP! 💥',
    completed: () => 'Snorlax satisfied! Big celebration! 🏆',
    sleepy: () => 'Zzz... back to sleep... zzz... 💤',
    pet: () => 'Snooor... *happy belly pat* 💤',
    berry: () => 'GULP! Entire berry swallowed whole! 🍉'
  },
  psyduck: {
    welcome: () => 'Psy... duck? Ready for sprint planning! 🌀',
    pomoWork: () => 'Psychic energy focusing... 🍅',
    pomoBreak: () => 'Headache easing... good break! 🦆',
    water: () => 'Water always helps Psyduck feel better! 💧',
    taskDone: () => 'Confusion cleared! Task done! +25 XP! 🌀',
    completed: () => 'Psychic surge victory! 🏆',
    sleepy: () => 'Psy... nap time... 💤',
    pet: () => 'Quack! *happy psychic head pat* 🦆',
    berry: () => 'Psy-duck nom! 🍒'
  },
  jigglypuff: {
    welcome: () => 'Jiggly-puff! Singing for your sprint! 🎵',
    pomoWork: () => 'Tempo set! Stay in the groove! 🍅',
    pomoBreak: () => 'Lullaby intermission! Relax! 🎶',
    water: () => 'Vocal cords need hydration! Drink water! 💧',
    taskDone: () => 'Encore! Task complete! +25 XP! 🎵',
    completed: () => 'Standing ovation! Beautiful code! 🏆',
    sleepy: () => 'Jiggly... puff... zzz... 💤',
    pet: () => 'Jiggly! *soft bouncy hug* 💖',
    berry: () => 'Puff puff nom! 🍓'
  },
  mew: {
    welcome: () => 'Mew! ✨ Legendary code powers activated!',
    pomoWork: () => 'Telepathic deep focus stream! 🍅',
    pomoBreak: () => 'Floating through the cosmos break! ✨',
    water: () => 'Pure hydration for cosmic energy! 💧',
    taskDone: () => 'Genesis burst! Task complete! +25 XP! 🌟',
    completed: () => 'Legendary sprint triumph! 🏆✨',
    sleepy: () => 'Mew... dreaming in the stars... 💤',
    pet: () => 'Mew mew! *floating swirl* ✨',
    berry: () => 'Mew! *delicate berry nibble* 🍓'
  },
  dog: {
    welcome: () => 'Woof! Let’s crush this sprint! 🐾',
    pomoWork: () => 'Focus time! I’ll sit quietly beside you 🍅',
    pomoBreak: () => 'Break time! Time to stretch together 🙆',
    water: () => 'Time to drink some fresh water! Slurp! 💧',
    taskDone: () => 'Yay, good job! *happy tail wags* +25 XP! 🏆',
    completed: () => 'Sprint champion! Good dog! 🏆',
    sleepy: () => 'Yawn… curling up for a nap. 💤',
    pet: () => 'Pant pant! *happy tail wag* 🐶',
    berry: () => 'Crunch crunch! Tasty treat! 🍖'
  }
};
