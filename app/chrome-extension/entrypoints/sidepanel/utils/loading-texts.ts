/**
 * Random loading flavor texts
 * Shown in TimelineStatusStep while the agent is thinking
 */

const loadingTexts = [
  // Classic vibes
  'Should have been smooth sailing...',
  'Now it is chaos and vibes',
  "I know you're in a hurry — just wait",
  'Dog-paddling through the knowledge ocean',
  'Let the bullet fly a little longer',
  'Hand-crafting your answer',
  'Assembling the answer crew',
  'Already writing it (making a new folder)',
  'Sweating through the thinking cap',
  'CPU is running hot for you',
  // Everyday life
  'Slow brew, good things take time',
  'Flipping the knowledge pancake',
  'One more second, then we toast',
  'Putting inspiration in the oven',
  'Letting the answer steep a bit longer',
  'Maxing out the vibe check',
  'Knitting you a sweater made of words',
  // Big brain mode
  'Neurons on the dance floor',
  'Night owl thinking hard',
  'Coloring in the answer',
  'Frantically flipping through the knowledge base',
  'Brain circus is in session',
  'Squishing 0s and 1s together',
  'Charging up a big one',
  'Magnifying glass is a little foggy, wiping it',
  'Attempting to understand this wild request',
  // Mystical
  'Casting a spell, do not disturb',
  'Waking up the silicon friend',
  'Connecting to the wisdom of cyberspace',
  'Traveler, please wait — running simulations',
  'Passing through the knowledge singularity',
  'Reverse-parsing human intent',
  'Crystal ball is blurry, give it a tap',
  // Hustle mode
  'Code running faster than breaking news',
  'Lead agent online, please hold',
  'Galloping to the finish line',
  'Moving knowledge at the speed of light',
  'Finding the last puzzle piece',
  'Answer is almost wrapped',
  'Launch countdown initiated',
  'Target locked',
];

/**
 * Get a random loading flavor text
 */
export function getRandomLoadingText(): string {
  return loadingTexts[Math.floor(Math.random() * loadingTexts.length)];
}
