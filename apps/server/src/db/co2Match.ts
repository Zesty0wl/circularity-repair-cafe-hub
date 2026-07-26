// =============================================================================
//  Working out what an old repair was
//  ---------------------------------------------------------------------------
//  Repairs recorded before we asked "what kind of thing is it?" have only a
//  line of free text ("Pedestal retro oscillating fan"), a brand, and the skill
//  category a volunteer picked. This reads those three and returns the CO2
//  reference type, so a cafe's history counts towards its total without anyone
//  having to sit down and label hundreds of old records by hand.
//
//  It is deliberately cautious. Where the answer is not clear it returns null,
//  and the repair keeps whatever figure was typed in at the time. A wrong type
//  is worse than no type: the numbers here run from half a kilogram to over six
//  hundred, so a bad guess would move a cafe's published total a long way.
//
//  Order of work:
//    1. The brand, where it settles a question the words cannot. A Marshall
//       "amp" is a guitar amplifier, not a hi-fi one.
//    2. Words, but only against types that sit in the skill category the
//       volunteer already chose. This is what stops a "Remote Control Off Road
//       vehicle" filed under Toys becoming a television accessory.
//    3. Words again, this time against every type, because the category is
//       sometimes missing or too broad.
//    4. The skill category on its own, where that category has one honest
//       average. Electronics does not, so those are left alone.
// =============================================================================

/** A word list that points at one type in `db/co2Factors.ts`. */
interface MatchRule {
  key: string;
  /** Which skill category this type is offered under. Must match co2Factors. */
  category: string;
  phrases: string[];
}

/**
 * Read in order. The first rule with a matching word wins, so anything whose
 * name contains a more general word has to come before that general word.
 * "Coffee machine" before "machine", "fan heater" before "heater".
 */
const RULES: MatchRule[] = [
  // ── Names that contain a more general word ──────────────────────────
  { key: 'sewing_machine', category: 'Clothing & textiles', phrases: ['sewing machine', 'overlocker'] },
  {
    key: 'coffee_maker',
    category: 'Small appliances',
    phrases: ['coffee machine', 'coffee maker', 'coffee grinder', 'espresso machine', 'espresso maker', 'nespresso', 'cafetiere', 'percolator'],
  },
  {
    key: 'large_home_electrical',
    category: 'Small appliances',
    phrases: ['washing machine', 'washer dryer', 'tumble dryer', 'tumble drier', 'dishwasher', 'fridge', 'freezer', 'wine cooler', 'wine fridge', 'oven', 'cooker', 'hob', 'extractor hood'],
  },
  {
    key: 'decorative_or_safety_lights',
    category: 'Small appliances',
    phrases: ['fairy lights', 'christmas lights', 'string lights', 'solar light', 'solar lights', 'night light', 'torch', 'lantern', 'smoke alarm', 'smoke detector'],
  },

  // ── Tools and garden ────────────────────────────────────────────────
  {
    key: 'power_tool',
    category: 'Tools',
    phrases: ['pressure washer', 'jet washer', 'jet wash', 'power washer', 'karcher', 'karacher', 'lawn mower', 'lawnmower', 'mower', 'strimmer', 'hedge trimmer', 'chainsaw', 'drill', 'sander', 'jigsaw', 'circular saw', 'angle grinder', 'power tool', 'soldering iron', 'glue gun', 'nail gun', 'leaf blower', 'hedge cutter'],
  },
  {
    key: 'tool_non_eee',
    category: 'Tools',
    phrases: ['hand tool', 'spanner', 'screwdriver', 'hammer', 'chisel', 'hand saw', 'secateurs', 'shears', 'wheelbarrow', 'garden fork', 'rake', 'spade', 'axe', 'vice'],
  },

  // ── Kitchen and home ────────────────────────────────────────────────
  { key: 'kettle', category: 'Small appliances', phrases: ['kettle'] },
  { key: 'toaster', category: 'Small appliances', phrases: ['toaster', 'toastie maker', 'sandwich maker', 'sandwich toaster'] },
  {
    key: 'blender',
    category: 'Small appliances',
    phrases: ['blender', 'smoothie maker', 'food processor', 'juicer', 'food mixer', 'stand mixer', 'hand mixer'],
  },
  {
    key: 'small_kitchen_item',
    category: 'Small appliances',
    phrases: ['slow cooker', 'rice cooker', 'air fryer', 'deep fat fryer', 'fryer', 'waffle maker', 'bread maker', 'breadmaker', 'can opener', 'tin opener', 'kitchen scales', 'scales', 'ice cream maker', 'soup maker', 'pressure cooker', 'hand whisk'],
  },
  { key: 'iron', category: 'Small appliances', phrases: ['iron', 'steam generator', 'garment steamer', 'clothes steamer'] },
  {
    key: 'vacuum',
    category: 'Small appliances',
    phrases: ['vacuum', 'vacuum cleaner', 'hoover', 'carpet cleaner', 'carpet washer', 'steam mop', 'robot vacuum'],
  },
  { key: 'fan', category: 'Small appliances', phrases: ['fan', 'fan heater', 'desk fan', 'pedestal fan', 'tower fan', 'extractor fan'] },
  {
    key: 'aircon_dehumidifier',
    category: 'Small appliances',
    phrases: ['dehumidifier', 'humidifier', 'air conditioner', 'air conditioning', 'aircon', 'air purifier'],
  },
  {
    key: 'hair_beauty_item',
    category: 'Small appliances',
    phrases: ['hair dryer', 'hairdryer', 'hair straightener', 'straighteners', 'curling tong', 'curling wand', 'hair clippers', 'clippers', 'beard trimmer', 'shaver', 'razor', 'epilator', 'electric toothbrush', 'toothbrush'],
  },
  { key: 'lamp', category: 'Small appliances', phrases: ['lamp', 'lampshade', 'desk light', 'table light', 'floor light', 'light fitting'] },
  { key: 'small_home_electrical', category: 'Small appliances', phrases: ['heater', 'electric blanket', 'doorbell', 'air bed pump'] },

  // ── Musical instruments, before the hi-fi words ─────────────────────
  // "Amp" on its own is ambiguous, so only the clearly musical spellings
  // are listed here. The brand check above catches the rest.
  {
    key: 'musical_instrument',
    category: 'Other',
    phrases: ['guitar', 'guitar amp', 'bass amp', 'combo amp', 'valve amp', 'ukulele', 'violin', 'cello', 'electronic keyboard', 'keyboard piano', 'piano', 'accordion', 'drum kit', 'clarinet', 'flute', 'trumpet', 'saxophone', 'banjo', 'mandolin', 'harmonica'],
  },

  // ── Electronics ─────────────────────────────────────────────────────
  { key: 'laptop_medium', category: 'Electronics', phrases: ['laptop', 'macbook', 'chromebook', 'netbook', 'notebook computer'] },
  {
    key: 'desktop_computer_medium_e_g_all_in_one',
    category: 'Electronics',
    phrases: ['desktop computer', 'desktop pc', 'tower pc', 'pc tower', 'imac'],
  },
  { key: 'tablet', category: 'Electronics', phrases: ['tablet', 'ipad', 'kindle', 'ereader', 'e reader'] },
  { key: 'mobile', category: 'Electronics', phrases: ['mobile phone', 'mobile', 'smartphone', 'iphone'] },
  { key: 'printer_scanner', category: 'Electronics', phrases: ['printer', 'scanner'] },
  { key: 'paper_shredder', category: 'Electronics', phrases: ['shredder'] },
  { key: 'projector', category: 'Electronics', phrases: ['projector'] },
  {
    key: 'games_console',
    category: 'Electronics',
    phrases: ['games console', 'game console', 'playstation', 'xbox', 'nintendo', 'game boy', 'gameboy'],
  },
  {
    // Listed before the hi-fi words: a portable CD player is a pocket thing,
    // not a music system, and the two are worlds apart in what they cost to
    // make. "Portable" is the word that separates them.
    key: 'handheld_entertainment_device',
    category: 'Electronics',
    phrases: ['mp3 player', 'ipod', 'walkman', 'discman', 'handheld console', 'portable dvd player', 'portable cd player', 'personal cd player', 'portable cassette player', 'personal stereo'],
  },
  { key: 'headphones', category: 'Electronics', phrases: ['headphones', 'headphone', 'earphones', 'earbuds', 'headset'] },
  { key: 'dslr_video_camera', category: 'Electronics', phrases: ['dslr', 'camcorder', 'video camera', 'cine camera'] },
  { key: 'digital_compact_camera', category: 'Electronics', phrases: ['camera', 'polaroid'] },
  {
    // One box that does everything.
    key: 'hi_fi_integrated',
    category: 'Electronics',
    phrases: ['hi fi', 'hifi', 'stereo', 'music centre', 'music center', 'radiogram', 'mini system', 'boombox', 'ghetto blaster', 'gramophone'],
  },
  {
    // One box that does one job, so it sits in a stack with others.
    key: 'hi_fi_separates',
    category: 'Electronics',
    phrases: ['record player', 'turntable', 'cd player', 'cassette player', 'tape deck', 'amplifier', 'amp', 'speaker', 'soundbar', 'sub woofer', 'subwoofer', 'tuner'],
  },
  { key: 'portable_radio', category: 'Electronics', phrases: ['radio', 'dab radio', 'transistor radio'] },
  {
    key: 'tv_and_gaming_related_accessories',
    category: 'Electronics',
    phrases: ['vhs', 'video recorder', 'vcr', 'dvd player', 'blu ray', 'bluray', 'set top box', 'freeview box', 'sky box'],
  },
  {
    key: 'battery_charger_adapter',
    category: 'Electronics',
    phrases: ['charger', 'power supply', 'adapter', 'adaptor', 'battery pack', 'extension lead'],
  },
  { key: 'pc_accessory', category: 'Electronics', phrases: ['keyboard', 'computer mouse', 'webcam', 'usb hub', 'docking station', 'hard drive'] },

  // ── Everything else ─────────────────────────────────────────────────
  { key: 'watch_clock', category: 'Other', phrases: ['alarm clock', 'cuckoo clock', 'carriage clock', 'mantel clock', 'wall clock', 'clock', 'wristwatch', 'watch', 'barometer'] },
  { key: 'jewellery', category: 'Jewellery', phrases: ['jewellery', 'necklace', 'bracelet', 'earring', 'brooch', 'pendant'] },
  { key: 'bicycle', category: 'Bicycles', phrases: ['bicycle', 'bike', 'pushbike', 'tricycle'] },
  {
    key: 'clothing_textile',
    category: 'Clothing & textiles',
    phrases: ['trousers', 'jeans', 'jacket', 'coat', 'dress', 'shirt', 'skirt', 'jumper', 'curtain', 'cushion', 'quilt', 'duvet', 'blanket', 'rucksack', 'backpack', 'handbag'],
  },
  {
    key: 'furniture',
    category: 'Furniture & wood',
    phrases: ['chair', 'armchair', 'table', 'stool', 'cabinet', 'wardrobe', 'chest of drawers', 'drawer', 'bookcase', 'bed frame', 'sofa', 'settee', 'footstool', 'picture frame'],
  },
  {
    key: 'toy',
    category: 'Toys',
    phrases: ['toy', 'doll', 'teddy', 'jigsaw puzzle', 'train set', 'lego', 'scalextric', 'ride on', 'remote control car', 'rc car', 'pram'],
  },
];

/**
 * Brands that settle a question the words on their own cannot. Kept short and
 * only for cases where the brand means one thing and one thing only.
 */
const BRAND_RULES: Array<{ key: string; brands: string[]; onlyWhenTextHas?: string[] }> = [
  {
    // A Marshall or Crafter "amp" is a guitar amplifier. A hi-fi amplifier
    // from the same maker does not exist.
    key: 'musical_instrument',
    brands: ['marshall', 'fender', 'crafter', 'orange', 'vox', 'laney', 'blackstar', 'ibanez', 'epiphone', 'gibson', 'squier', 'tanglewood'],
    onlyWhenTextHas: ['amp', 'amplifier', 'guitar', 'combo'],
  },
  { key: 'vacuum', brands: ['dyson', 'henry', 'numatic'], onlyWhenTextHas: ['vacuum', 'hoover', 'cleaner'] },
  { key: 'power_tool', brands: ['karcher', 'karacher', 'kaercher'] },
];

/**
 * One honest average per skill category, used only when nothing else matched.
 * Electronics and "Books & paper" are missing on purpose. Electronics runs
 * from a phone charger to a large television, so a single average would be
 * meaningless, and the reference data has nothing sensible for paper.
 */
const CATEGORY_FALLBACK: Record<string, string> = {
  Bicycles: 'bicycle',
  'Clothing & textiles': 'clothing_textile',
  'Furniture & wood': 'furniture',
  Jewellery: 'jewellery',
  Toys: 'toy',
  Tools: 'tool_non_eee',
  'Small appliances': 'small_home_electrical',
  Other: 'misc_non_eee',
};

/** Lower case, punctuation to spaces, one space between words. */
function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const phrasePatterns = new Map<string, RegExp>();

/**
 * Does this text use that phrase as a whole word? A trailing "s" or "es" is
 * allowed, so "toys" matches "toy" while "lamp" never matches "lamppost".
 */
function hasPhrase(text: string, phrase: string): boolean {
  let pattern = phrasePatterns.get(phrase);
  if (!pattern) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`\\b${escaped}(?:e?s)?\\b`);
    phrasePatterns.set(phrase, pattern);
  }
  return pattern.test(text);
}

export interface Co2MatchInput {
  itemDescription: string | null | undefined;
  itemBrand: string | null | undefined;
  /** The name of the skill category a volunteer chose, if any. */
  categoryName: string | null | undefined;
}

/**
 * The CO2 reference type for a repair, or null when we cannot tell.
 *
 * Returns the `key` from `db/co2Factors.ts`, not a database id, so this stays
 * a plain function anyone can read and test.
 */
export function matchCo2FactorKey(input: Co2MatchInput): string | null {
  const text = normalise(input.itemDescription);
  const brand = normalise(input.itemBrand);
  const category = (input.categoryName ?? '').trim();
  if (!text && !brand && !category) return null;

  // 1. The brand, where it settles the question.
  for (const rule of BRAND_RULES) {
    if (!rule.brands.some((b) => hasPhrase(brand, b) || hasPhrase(text, b))) continue;
    if (rule.onlyWhenTextHas && !rule.onlyWhenTextHas.some((w) => hasPhrase(text, w))) continue;
    return rule.key;
  }

  // 2. Words, against the types offered under the category already chosen.
  if (category) {
    const withinCategory = RULES.filter((r) => r.category === category);
    for (const rule of withinCategory) {
      if (rule.phrases.some((p) => hasPhrase(text, p))) return rule.key;
    }
  }

  // 3. Words, against every type. Categories are sometimes missing or broad,
  //    and a jet washer filed under Small appliances is still a power tool.
  for (const rule of RULES) {
    if (rule.phrases.some((p) => hasPhrase(text, p))) return rule.key;
  }

  // 4. The category on its own, where it has one honest average.
  return CATEGORY_FALLBACK[category] ?? null;
}
