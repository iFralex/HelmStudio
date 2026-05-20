export const IN_SCOPE_CATEGORY_IDS = [
  '2', // Autos & Vehicles
  '17', // Sports
  '19', // Travel & Events
  '20', // Gaming
  '22', // People & Blogs
  '23', // Comedy
  '24', // Entertainment
  '25', // News & Politics
  '26', // Howto & Style
  '27', // Education
  '28', // Science & Technology
] as const;

export type CategoryId = (typeof IN_SCOPE_CATEGORY_IDS)[number];
