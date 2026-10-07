// =============================================================================
//  What a new hub starts with
//  ---------------------------------------------------------------------------
//  The default skill categories and the wording on the home page and the Linux
//  page. Kept apart from migrate.ts so the Cloudflare edition (apps/cloudflare)
//  seeds a new hub with exactly the same content. Nothing in here may import
//  Postgres or Node, because the Cloudflare Worker imports this file too.
// =============================================================================

export const DEFAULT_CATEGORIES: Array<{ name: string; icon: string; colour: string }> = [
  { name: 'Electronics', icon: 'cpu', colour: '#0ea5e9' },
  { name: 'Small appliances', icon: 'plug', colour: '#f97316' },
  { name: 'Clothing & textiles', icon: 'shirt', colour: '#ec4899' },
  { name: 'Bicycles', icon: 'bike', colour: '#22c55e' },
  { name: 'Furniture & wood', icon: 'armchair', colour: '#a16207' },
  { name: 'Toys', icon: 'toy-brick', colour: '#eab308' },
  { name: 'Tools', icon: 'wrench', colour: '#6366f1' },
  { name: 'Jewellery', icon: 'gem', colour: '#8b5cf6' },
  { name: 'Books & paper', icon: 'book-open', colour: '#0d9488' },
  { name: 'Other', icon: 'help-circle', colour: '#64748b' },
];

/**
 * Default editable home-page content seeded on first run.
 * Admins can edit any of these fields under Admin → Settings → Home page.
 */
export const DEFAULT_HOME_PAGE = {
  intro: {
    heading: 'What & Who',
    body:
      'We are a volunteer-powered Repair Cafe designed to help our community ' +
      'repair, reuse, and recycle. Bring along your broken or damaged item (small ' +
      'electronics, clothing, bikes, furniture, toys) and our skilled volunteers ' +
      'will do their best to fix it with you, for free.\n\n' +
      'It is also a great place to meet, drink tea, and learn a few repair skills. ' +
      'New volunteer repairers are always welcome.',
  },
  howItWorks: [
    { title: 'Bring it along', body: 'Turn up at one of our sessions with your broken item.' },
    { title: 'Check it in', body: 'A volunteer will sign your item in and add it to the queue.' },
    { title: 'Repair together', body: 'Our repairers work with you to diagnose and fix it.' },
    { title: 'Take it home', body: 'You leave with a working item, fewer things in landfill, and new skills.' },
  ],
  whatToBring: {
    heading: 'What to bring',
    body:
      '• The item you want repaired (and any unusual cables, batteries, or parts)\n' +
      '• Any tools or attachments specific to it\n' +
      '• Your patience. Repairs take time, and we work alongside you, not for you',
  },
  faqs: [
    {
      q: 'How much does it cost?',
      a: 'Nothing! Repairs are free. Donations to cover hall hire and consumables are very welcome.',
    },
    {
      q: 'Will you guarantee the repair?',
      a: 'No. We do our best, but repairs are carried out by volunteers and we can\'t offer a warranty. We\'ll always be honest about what we can and can\'t fix.',
    },
    {
      q: 'Can you fix anything?',
      a: 'We try! Some things are too hazardous (microwaves, anything with a sealed gas system) or genuinely beyond economic repair, but we\'ll always have a look.',
    },
  ],
};

/**
 * Default wording for the Linux Repair Cafe page.
 *
 * Seeded once, then owned by the cafe: every field is editable under Admin,
 * Settings, Linux Repair Cafe. The page itself only appears once an admin
 * turns the feature on, so this text sits unused until somebody wants it.
 *
 * The dates are the real ones. Microsoft stopped supporting Windows 10 on
 * 14 October 2025, and the paid extension for home users runs out on
 * 12 October 2027.
 */
export const DEFAULT_LINUX_PAGE = {
  navLabel: 'Linux Repair Cafe',
  hero: {
    heading: 'Linux Repair Cafe',
    tagline: 'Give your old computer years more life, for free.',
  },
  intro: {
    heading: 'What is a Linux Repair Cafe?',
    body:
      'Microsoft stopped supporting Windows 10 in October 2025. Millions of computers ' +
      'that still work perfectly well are now called too old, and many of them will be ' +
      'thrown away.\n\n' +
      'They do not have to be. Linux is a free operating system that runs happily on ' +
      'older machines, and it keeps getting updates for as long as you use it. You can ' +
      'try Linux on one of our computers, ask us anything, and have it installed on your ' +
      'own laptop, free of charge.\n\n' +
      'This runs as part of our ordinary repair sessions, at the same place and the same ' +
      'time. Come along with your computer, the same as anybody bringing a broken lamp.\n\n' +
      'You can do everything on a Linux computer that you can do on any other one: ' +
      'browse the web, send email, write letters, watch videos, and print.',
  },
  howItWorks: [
    { title: 'Come to any session', body: 'We run Linux help at our normal repair sessions. Try Linux on one of our computers first. There is no need to decide anything on the day.' },
    { title: 'Back up your files', body: 'Copy your photos and documents to a USB stick or a hard drive before you come. Installing Linux erases the computer.' },
    { title: 'We install it with you', body: 'A volunteer installs Linux on your laptop and sets it up while you watch, so you know what is happening.' },
    { title: 'Take it home and use it', body: 'We show you round the desktop, help you find your programs, and tell you where to get help later.' },
  ],
  whatToBring: {
    heading: 'What to bring',
    body:
      '• Your laptop or computer, and its power supply\n' +
      '• A backup of everything you want to keep. Installing Linux erases the whole computer\n' +
      '• Your wifi password, so we can get the machine online\n' +
      '• Any passwords you need for email or websites you use\n' +
      '• Time. An install usually takes about an hour',
  },
  faqs: [
    {
      q: 'Will I lose my files?',
      a: 'Yes, unless you copy them somewhere else first. Installing Linux wipes the computer completely. Please back up your photos, documents and anything else you care about before you come. Bring the backup with you and we will help you copy it back afterwards.',
    },
    {
      q: 'Is Linux free?',
      a: 'Yes. Linux costs nothing, and so does our help. There is no licence to buy and no subscription. Donations towards the hall and the tea are always welcome.',
    },
    {
      q: 'Can I still use my usual programs?',
      a: 'Most of what people do every day works straight away: the web, email, documents, spreadsheets, photos, music and video. Some Windows-only programs do not run on Linux, and there is usually a free alternative. Tell us what you use and we will check before you commit.',
    },
    {
      q: 'Is my computer too old?',
      a: 'Probably not. Linux runs well on computers that Windows 11 will not accept. Bring it along and we will tell you honestly if it is not worth it.',
    },
    {
      q: 'What if I do not like it?',
      a: 'Try it first. We can run Linux from a USB stick without changing anything on your computer, so you can have a proper look before you decide.',
    },
    {
      q: 'Is this a separate event?',
      a: 'No. Linux help runs at our normal repair sessions, at the same place and the same time. Check our list of dates, bring your computer along, and ask for the Linux table.',
    },
  ],
  homeCard: {
    heading: 'We are a Linux Repair Cafe',
    body:
      'Is your computer too old for Windows 11? We can put Linux on it instead, for free. ' +
      'It keeps working, it keeps getting updates, and it stays out of the bin.',
    ctaLabel: 'Find out about Linux',
  },
  showStats: true,
};
