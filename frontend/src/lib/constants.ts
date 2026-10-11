export const BUDGETS = [
  { value: 'budget', label: 'Shoestring', hint: 'Hostels, street food, free sights' },
  { value: 'mid', label: 'Comfortable', hint: 'Nice stays, good meals, a few treats' },
  { value: 'luxury', label: 'Splurge', hint: 'Boutique hotels, tasting menus, private tours' },
] as const;

export const INTERESTS = [
  'Food & drink',
  'Culture',
  'History',
  'Nature',
  'Hiking',
  'Beaches',
  'Nightlife',
  'Art & museums',
  'Shopping',
  'Wellness',
  'Photography',
  'Family friendly',
] as const;

export const TRANSPORT_MODES = [
  { value: 'public_transit', label: 'Public transit' },
  { value: 'walking', label: 'On foot' },
  { value: 'car', label: 'Car' },
  { value: 'bike', label: 'Bike' },
  { value: 'mixed', label: 'A bit of everything' },
] as const;

export const DESTINATION_IDEAS = [
  { name: 'Lisbon', country: 'Portugal', blurb: 'Tiled hills, tram 28 and custard tarts.' },
  { name: 'Kyoto', country: 'Japan', blurb: 'Temples, tea houses and quiet lanes.' },
  { name: 'Marrakesh', country: 'Morocco', blurb: 'Souks, riads and rooftop sunsets.' },
  { name: 'Reykjavík', country: 'Iceland', blurb: 'Hot springs, waterfalls and long light.' },
  { name: 'Oaxaca City', country: 'Mexico', blurb: 'Mole, mezcal and market mornings.' },
  { name: 'Hoi An', country: 'Vietnam', blurb: 'Lantern-lit streets and river food.' },
] as const;

export const MAX_TRIP_DAYS = 14;
