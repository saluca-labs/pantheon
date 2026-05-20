/**
 * Creator OS — Curated BISAC subject code reference.
 *
 * BISAC (Book Industry Standards and Communications) codes are used by
 * KDP, Lulu, IngramSpark, and most distributors for category placement.
 *
 * This file is a *curated subset* of the most-used codes for indie
 * publishing, not the full BISG reference list. Heavier coverage of:
 *   - Technology / Computers (COM)
 *   - Business & Economics (BUS)
 *   - Fiction (FIC)
 *   - Self-Help / Reference
 *
 * If a user needs a code that isn't here, the picker accepts free-text
 * entry and stores the raw code on the publishing target. The full
 * BISAC list is updated annually by BISG — to refresh this subset,
 * cross-reference KDP and Lulu's published category pages.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

export interface BisacCode {
  /** 9-character BISAC code, e.g. "COM051000" */
  code: string;
  /** Human-readable label, " / "-separated category path */
  label: string;
  /** 3-letter top-level prefix (COM, BUS, FIC, ...) */
  group: string;
}

export const BISAC_CODES: readonly BisacCode[] = [
  // ─── Antiques & Collectibles ────────────────────────────────────────────────
  { code: 'ANT000000', label: 'Antiques & Collectibles / General', group: 'ANT' },

  // ─── Architecture ───────────────────────────────────────────────────────────
  { code: 'ARC000000', label: 'Architecture / General', group: 'ARC' },

  // ─── Art ────────────────────────────────────────────────────────────────────
  { code: 'ART000000', label: 'Art / General', group: 'ART' },
  { code: 'ART015000', label: 'Art / History / General', group: 'ART' },

  // ─── Bibles ─────────────────────────────────────────────────────────────────
  { code: 'BIB000000', label: 'Bibles / General', group: 'BIB' },

  // ─── Biography & Autobiography ──────────────────────────────────────────────
  { code: 'BIO000000', label: 'Biography & Autobiography / General', group: 'BIO' },
  { code: 'BIO022000', label: 'Biography & Autobiography / Personal Memoirs', group: 'BIO' },
  { code: 'BIO026000', label: 'Biography & Autobiography / Business', group: 'BIO' },
  { code: 'BIO017000', label: 'Biography & Autobiography / Science & Technology', group: 'BIO' },

  // ─── Body, Mind & Spirit ────────────────────────────────────────────────────
  { code: 'OCC000000', label: 'Body, Mind & Spirit / General', group: 'OCC' },

  // ─── Business & Economics ─────────────────────────────────────────────── BUS
  { code: 'BUS000000', label: 'Business & Economics / General', group: 'BUS' },
  { code: 'BUS001000', label: 'Business & Economics / Accounting / General', group: 'BUS' },
  { code: 'BUS007000', label: 'Business & Economics / Banks & Banking', group: 'BUS' },
  { code: 'BUS012000', label: 'Business & Economics / Careers / General', group: 'BUS' },
  { code: 'BUS017000', label: 'Business & Economics / Consulting', group: 'BUS' },
  { code: 'BUS019000', label: 'Business & Economics / Decision-Making & Problem Solving', group: 'BUS' },
  { code: 'BUS020000', label: 'Business & Economics / Development / Business Development', group: 'BUS' },
  { code: 'BUS025000', label: 'Business & Economics / Entrepreneurship', group: 'BUS' },
  { code: 'BUS027000', label: 'Business & Economics / Finance / General', group: 'BUS' },
  { code: 'BUS030000', label: 'Business & Economics / Free Enterprise & Capitalism', group: 'BUS' },
  { code: 'BUS035000', label: 'Business & Economics / Human Resources & Personnel Management', group: 'BUS' },
  { code: 'BUS037020', label: 'Business & Economics / Information Management', group: 'BUS' },
  { code: 'BUS040000', label: 'Business & Economics / Investments & Securities / General', group: 'BUS' },
  { code: 'BUS041000', label: 'Business & Economics / Management', group: 'BUS' },
  { code: 'BUS043000', label: 'Business & Economics / Marketing / General', group: 'BUS' },
  { code: 'BUS046000', label: 'Business & Economics / Negotiating', group: 'BUS' },
  { code: 'BUS049000', label: 'Business & Economics / Personal Finance / General', group: 'BUS' },
  { code: 'BUS050000', label: 'Business & Economics / Personal Success', group: 'BUS' },
  { code: 'BUS052000', label: 'Business & Economics / Production & Operations Management', group: 'BUS' },
  { code: 'BUS055000', label: 'Business & Economics / Project Management', group: 'BUS' },
  { code: 'BUS058000', label: 'Business & Economics / Sales & Selling / General', group: 'BUS' },
  { code: 'BUS063000', label: 'Business & Economics / Strategic Planning', group: 'BUS' },
  { code: 'BUS066000', label: 'Business & Economics / Leadership', group: 'BUS' },
  { code: 'BUS068000', label: 'Business & Economics / Workplace Culture', group: 'BUS' },
  { code: 'BUS071000', label: 'Business & Economics / Mentoring & Coaching', group: 'BUS' },
  { code: 'BUS082000', label: 'Business & Economics / Industries / Computers & Information Technology', group: 'BUS' },
  { code: 'BUS099000', label: 'Business & Economics / Time Management', group: 'BUS' },
  { code: 'BUS104000', label: 'Business & Economics / Corporate Governance', group: 'BUS' },
  { code: 'BUS109000', label: 'Business & Economics / Workplace Harassment & Discrimination', group: 'BUS' },

  // ─── Comics & Graphic Novels ────────────────────────────────────────────────
  { code: 'CGN000000', label: 'Comics & Graphic Novels / General', group: 'CGN' },

  // ─── Computers ────────────────────────────────────────────────────────── COM
  { code: 'COM000000', label: 'Computers / General', group: 'COM' },
  { code: 'COM004000', label: 'Computers / Intelligence (AI) & Semantics', group: 'COM' },
  { code: 'COM005000', label: 'Computers / Enterprise Applications / Business Intelligence Tools', group: 'COM' },
  { code: 'COM010000', label: 'Computers / Computer Engineering', group: 'COM' },
  { code: 'COM011000', label: 'Computers / Systems Architecture / General', group: 'COM' },
  { code: 'COM012040', label: 'Computers / Cloud Computing', group: 'COM' },
  { code: 'COM013000', label: 'Computers / Data Visualization', group: 'COM' },
  { code: 'COM014000', label: 'Computers / Computer Science', group: 'COM' },
  { code: 'COM015000', label: 'Computers / Computer Graphics / General', group: 'COM' },
  { code: 'COM018000', label: 'Computers / Data Science / Data Modeling & Design', group: 'COM' },
  { code: 'COM020030', label: 'Computers / Data Transmission Systems / Wireless', group: 'COM' },
  { code: 'COM021000', label: 'Computers / Databases / General', group: 'COM' },
  { code: 'COM032000', label: 'Computers / Information Technology', group: 'COM' },
  { code: 'COM036000', label: 'Computers / Internet / General', group: 'COM' },
  { code: 'COM037000', label: 'Computers / Machine Theory', group: 'COM' },
  { code: 'COM043050', label: 'Computers / Networking / Vendor Specific', group: 'COM' },
  { code: 'COM044000', label: 'Computers / Neural Networks', group: 'COM' },
  { code: 'COM046000', label: 'Computers / Operating Systems / General', group: 'COM' },
  { code: 'COM046030', label: 'Computers / Operating Systems / Linux', group: 'COM' },
  { code: 'COM046070', label: 'Computers / Operating Systems / Macintosh', group: 'COM' },
  { code: 'COM046080', label: 'Computers / Operating Systems / Windows Desktop', group: 'COM' },
  { code: 'COM051000', label: 'Computers / Programming / General', group: 'COM' },
  { code: 'COM051010', label: 'Computers / Programming Languages / General', group: 'COM' },
  { code: 'COM051070', label: 'Computers / Programming Languages / Python', group: 'COM' },
  { code: 'COM051200', label: 'Computers / Programming Languages / JavaScript', group: 'COM' },
  { code: 'COM051240', label: 'Computers / Programming Languages / Rust', group: 'COM' },
  { code: 'COM051310', label: 'Computers / Programming / Algorithms', group: 'COM' },
  { code: 'COM051360', label: 'Computers / Programming / Open Source', group: 'COM' },
  { code: 'COM051370', label: 'Computers / Programming / Object Oriented', group: 'COM' },
  { code: 'COM051400', label: 'Computers / Programming / Functional', group: 'COM' },
  { code: 'COM053000', label: 'Computers / Security / General', group: 'COM' },
  { code: 'COM053010', label: 'Computers / Security / Cryptography & Encryption', group: 'COM' },
  { code: 'COM060040', label: 'Computers / Web / Site Design', group: 'COM' },
  { code: 'COM060080', label: 'Computers / Web / User Generated Content', group: 'COM' },
  { code: 'COM060100', label: 'Computers / Web / Search Engines', group: 'COM' },
  { code: 'COM060130', label: 'Computers / Web / User Interface (UI) & Usability', group: 'COM' },
  { code: 'COM067000', label: 'Computers / Information Theory', group: 'COM' },
  { code: 'COM072000', label: 'Computers / Quality Assurance & Testing', group: 'COM' },
  { code: 'COM077000', label: 'Computers / Social Aspects / General', group: 'COM' },
  { code: 'COM083000', label: 'Computers / Software Development & Engineering / General', group: 'COM' },
  { code: 'COM083030', label: 'Computers / Software Development & Engineering / Project Management', group: 'COM' },
  { code: 'COM083040', label: 'Computers / Software Development & Engineering / Tools', group: 'COM' },
  { code: 'COM088000', label: 'Computers / Security / Online Safety & Privacy', group: 'COM' },
  { code: 'COM089000', label: 'Computers / Security / Network Security', group: 'COM' },
  { code: 'COM094000', label: 'Computers / Mobile & Wireless Communications', group: 'COM' },

  // ─── Cooking ────────────────────────────────────────────────────────────────
  { code: 'CKB000000', label: 'Cooking / General', group: 'CKB' },

  // ─── Crafts & Hobbies ───────────────────────────────────────────────────────
  { code: 'CRA000000', label: 'Crafts & Hobbies / General', group: 'CRA' },

  // ─── Design ─────────────────────────────────────────────────────────────────
  { code: 'DES000000', label: 'Design / General', group: 'DES' },

  // ─── Drama ──────────────────────────────────────────────────────────────────
  { code: 'DRA000000', label: 'Drama / General', group: 'DRA' },

  // ─── Education ──────────────────────────────────────────────────────────────
  { code: 'EDU000000', label: 'Education / General', group: 'EDU' },

  // ─── Family & Relationships ─────────────────────────────────────────────────
  { code: 'FAM000000', label: 'Family & Relationships / General', group: 'FAM' },
  { code: 'FAM034000', label: 'Family & Relationships / Parenting / General', group: 'FAM' },

  // ─── Fiction ───────────────────────────────────────────────────────────── FIC
  { code: 'FIC000000', label: 'Fiction / General', group: 'FIC' },
  { code: 'FIC002000', label: 'Fiction / Action & Adventure', group: 'FIC' },
  { code: 'FIC003000', label: 'Fiction / African American & Black / General', group: 'FIC' },
  { code: 'FIC004000', label: 'Fiction / Classics', group: 'FIC' },
  { code: 'FIC008000', label: 'Fiction / Sagas', group: 'FIC' },
  { code: 'FIC009000', label: 'Fiction / Fantasy / General', group: 'FIC' },
  { code: 'FIC009020', label: 'Fiction / Fantasy / Epic', group: 'FIC' },
  { code: 'FIC009030', label: 'Fiction / Fantasy / Historical', group: 'FIC' },
  { code: 'FIC009070', label: 'Fiction / Fantasy / Dark Fantasy', group: 'FIC' },
  { code: 'FIC010000', label: 'Fiction / Fairy Tales, Folk Tales, Legends & Mythology', group: 'FIC' },
  { code: 'FIC014000', label: 'Fiction / Historical / General', group: 'FIC' },
  { code: 'FIC015000', label: 'Fiction / Horror', group: 'FIC' },
  { code: 'FIC016000', label: 'Fiction / Humorous / General', group: 'FIC' },
  { code: 'FIC019000', label: 'Fiction / Literary', group: 'FIC' },
  { code: 'FIC022000', label: 'Fiction / Mystery & Detective / General', group: 'FIC' },
  { code: 'FIC022040', label: 'Fiction / Mystery & Detective / Police Procedural', group: 'FIC' },
  { code: 'FIC027000', label: 'Fiction / Romance / General', group: 'FIC' },
  { code: 'FIC027020', label: 'Fiction / Romance / Contemporary', group: 'FIC' },
  { code: 'FIC027050', label: 'Fiction / Romance / Historical / General', group: 'FIC' },
  { code: 'FIC028000', label: 'Fiction / Science Fiction / General', group: 'FIC' },
  { code: 'FIC028020', label: 'Fiction / Science Fiction / Hard Science Fiction', group: 'FIC' },
  { code: 'FIC028030', label: 'Fiction / Science Fiction / Space Opera', group: 'FIC' },
  { code: 'FIC028070', label: 'Fiction / Science Fiction / Apocalyptic & Post-Apocalyptic', group: 'FIC' },
  { code: 'FIC028120', label: 'Fiction / Science Fiction / Cyberpunk', group: 'FIC' },
  { code: 'FIC029000', label: 'Fiction / Short Stories (single author)', group: 'FIC' },
  { code: 'FIC030000', label: 'Fiction / Thrillers / General', group: 'FIC' },
  { code: 'FIC031000', label: 'Fiction / Thrillers / Suspense', group: 'FIC' },
  { code: 'FIC031060', label: 'Fiction / Thrillers / Crime', group: 'FIC' },
  { code: 'FIC031070', label: 'Fiction / Thrillers / Espionage', group: 'FIC' },
  { code: 'FIC031080', label: 'Fiction / Thrillers / Technological', group: 'FIC' },
  { code: 'FIC040000', label: 'Fiction / Coming of Age', group: 'FIC' },
  { code: 'FIC042000', label: 'Fiction / Christian / General', group: 'FIC' },
  { code: 'FIC050000', label: 'Fiction / Crime', group: 'FIC' },
  { code: 'FIC059000', label: 'Fiction / Mashups', group: 'FIC' },
  { code: 'FIC061000', label: 'Fiction / Magical Realism', group: 'FIC' },
  { code: 'FIC066000', label: 'Fiction / Dystopian', group: 'FIC' },
  { code: 'FIC074000', label: 'Fiction / Diversity & Multicultural', group: 'FIC' },

  // ─── Foreign Language Study ─────────────────────────────────────────────────
  { code: 'FOR000000', label: 'Foreign Language Study / General', group: 'FOR' },

  // ─── Games ──────────────────────────────────────────────────────────────────
  { code: 'GAM000000', label: 'Games & Activities / General', group: 'GAM' },
  { code: 'GAM004000', label: 'Games & Activities / Video & Mobile', group: 'GAM' },

  // ─── Gardening ──────────────────────────────────────────────────────────────
  { code: 'GAR000000', label: 'Gardening / General', group: 'GAR' },

  // ─── Health & Fitness ───────────────────────────────────────────────────────
  { code: 'HEA000000', label: 'Health & Fitness / General', group: 'HEA' },
  { code: 'HEA007000', label: 'Health & Fitness / Exercise / General', group: 'HEA' },
  { code: 'HEA010000', label: 'Health & Fitness / Diet & Nutrition / General', group: 'HEA' },
  { code: 'HEA024000', label: 'Health & Fitness / Sleep', group: 'HEA' },
  { code: 'HEA042000', label: 'Health & Fitness / Healthy Living', group: 'HEA' },

  // ─── History ────────────────────────────────────────────────────────────────
  { code: 'HIS000000', label: 'History / General', group: 'HIS' },
  { code: 'HIS036000', label: 'History / United States / General', group: 'HIS' },

  // ─── House & Home ───────────────────────────────────────────────────────────
  { code: 'HOM000000', label: 'House & Home / General', group: 'HOM' },

  // ─── Humor ──────────────────────────────────────────────────────────────────
  { code: 'HUM000000', label: 'Humor / General', group: 'HUM' },

  // ─── Juvenile Fiction ───────────────────────────────────────────────────────
  { code: 'JUV000000', label: 'Juvenile Fiction / General', group: 'JUV' },

  // ─── Juvenile Non-Fiction ───────────────────────────────────────────────────
  { code: 'JNF000000', label: 'Juvenile Non-Fiction / General', group: 'JNF' },

  // ─── Language Arts & Disciplines ────────────────────────────────────────────
  { code: 'LAN000000', label: 'Language Arts & Disciplines / General', group: 'LAN' },
  { code: 'LAN005000', label: 'Language Arts & Disciplines / Composition & Creative Writing', group: 'LAN' },
  { code: 'LAN023000', label: 'Language Arts & Disciplines / Writing / Fiction Writing', group: 'LAN' },
  { code: 'LAN027000', label: 'Language Arts & Disciplines / Writing / Nonfiction (incl. Memoirs)', group: 'LAN' },

  // ─── Law ────────────────────────────────────────────────────────────────────
  { code: 'LAW000000', label: 'Law / General', group: 'LAW' },

  // ─── Literary Collections ───────────────────────────────────────────────────
  { code: 'LCO000000', label: 'Literary Collections / General', group: 'LCO' },

  // ─── Literary Criticism ─────────────────────────────────────────────────────
  { code: 'LIT000000', label: 'Literary Criticism / General', group: 'LIT' },

  // ─── Mathematics ────────────────────────────────────────────────────────────
  { code: 'MAT000000', label: 'Mathematics / General', group: 'MAT' },
  { code: 'MAT008000', label: 'Mathematics / Probability & Statistics / General', group: 'MAT' },

  // ─── Medical ────────────────────────────────────────────────────────────────
  { code: 'MED000000', label: 'Medical / General', group: 'MED' },

  // ─── Music ──────────────────────────────────────────────────────────────────
  { code: 'MUS000000', label: 'Music / General', group: 'MUS' },

  // ─── Nature ─────────────────────────────────────────────────────────────────
  { code: 'NAT000000', label: 'Nature / General', group: 'NAT' },

  // ─── Performing Arts ────────────────────────────────────────────────────────
  { code: 'PER000000', label: 'Performing Arts / General', group: 'PER' },

  // ─── Pets ───────────────────────────────────────────────────────────────────
  { code: 'PET000000', label: 'Pets / General', group: 'PET' },

  // ─── Philosophy ─────────────────────────────────────────────────────────────
  { code: 'PHI000000', label: 'Philosophy / General', group: 'PHI' },

  // ─── Photography ────────────────────────────────────────────────────────────
  { code: 'PHO000000', label: 'Photography / General', group: 'PHO' },

  // ─── Poetry ─────────────────────────────────────────────────────────────────
  { code: 'POE000000', label: 'Poetry / General', group: 'POE' },

  // ─── Political Science ──────────────────────────────────────────────────────
  { code: 'POL000000', label: 'Political Science / General', group: 'POL' },

  // ─── Psychology ─────────────────────────────────────────────────────────────
  { code: 'PSY000000', label: 'Psychology / General', group: 'PSY' },
  { code: 'PSY008000', label: 'Psychology / Developmental / Child', group: 'PSY' },
  { code: 'PSY013000', label: 'Psychology / Cognitive Psychology & Cognition', group: 'PSY' },
  { code: 'PSY031000', label: 'Psychology / Industrial & Organizational Psychology', group: 'PSY' },
  { code: 'PSY036000', label: 'Psychology / Personality', group: 'PSY' },

  // ─── Reference ──────────────────────────────────────────────────────────────
  { code: 'REF000000', label: 'Reference / General', group: 'REF' },

  // ─── Religion ───────────────────────────────────────────────────────────────
  { code: 'REL000000', label: 'Religion / General', group: 'REL' },

  // ─── Science ────────────────────────────────────────────────────────────────
  { code: 'SCI000000', label: 'Science / General', group: 'SCI' },
  { code: 'SCI008000', label: 'Science / Life Sciences / Biology', group: 'SCI' },
  { code: 'SCI013000', label: 'Science / Chemistry / General', group: 'SCI' },
  { code: 'SCI028000', label: 'Science / Mechanics / General', group: 'SCI' },
  { code: 'SCI055000', label: 'Science / Physics / General', group: 'SCI' },
  { code: 'SCI075000', label: 'Science / Philosophy & Social Aspects', group: 'SCI' },

  // ─── Self-Help ──────────────────────────────────────────────────────────────
  { code: 'SEL000000', label: 'Self-Help / General', group: 'SEL' },
  { code: 'SEL004000', label: 'Self-Help / Communication & Social Skills', group: 'SEL' },
  { code: 'SEL024000', label: 'Self-Help / Personal Growth / General', group: 'SEL' },
  { code: 'SEL027000', label: 'Self-Help / Personal Growth / Success', group: 'SEL' },
  { code: 'SEL030000', label: 'Self-Help / Motivational & Inspirational', group: 'SEL' },
  { code: 'SEL031000', label: 'Self-Help / Time Management', group: 'SEL' },
  { code: 'SEL040000', label: 'Self-Help / Creativity', group: 'SEL' },
  { code: 'SEL045000', label: 'Self-Help / Mood Disorders / Depression', group: 'SEL' },

  // ─── Social Science ─────────────────────────────────────────────────────────
  { code: 'SOC000000', label: 'Social Science / General', group: 'SOC' },
  { code: 'SOC052000', label: 'Social Science / Media Studies', group: 'SOC' },
  { code: 'SOC071000', label: 'Social Science / Privacy & Surveillance', group: 'SOC' },

  // ─── Sports & Recreation ────────────────────────────────────────────────────
  { code: 'SPO000000', label: 'Sports & Recreation / General', group: 'SPO' },

  // ─── Study Aids ─────────────────────────────────────────────────────────────
  { code: 'STU000000', label: 'Study Aids / General', group: 'STU' },

  // ─── Technology & Engineering ───────────────────────────────────────────────
  { code: 'TEC000000', label: 'Technology & Engineering / General', group: 'TEC' },
  { code: 'TEC008000', label: 'Technology & Engineering / Electronics / General', group: 'TEC' },
  { code: 'TEC009000', label: 'Technology & Engineering / Engineering (General)', group: 'TEC' },
  { code: 'TEC035000', label: 'Technology & Engineering / Robotics', group: 'TEC' },
  { code: 'TEC052000', label: 'Technology & Engineering / Power Resources / Renewable', group: 'TEC' },

  // ─── Transportation ─────────────────────────────────────────────────────────
  { code: 'TRA000000', label: 'Transportation / General', group: 'TRA' },

  // ─── Travel ─────────────────────────────────────────────────────────────────
  { code: 'TRV000000', label: 'Travel / General', group: 'TRV' },

  // ─── True Crime ─────────────────────────────────────────────────────────────
  { code: 'TRU000000', label: 'True Crime / General', group: 'TRU' },

  // ─── Young Adult Fiction ────────────────────────────────────────────────────
  { code: 'YAF000000', label: 'Young Adult Fiction / General', group: 'YAF' },

  // ─── Young Adult Non-Fiction ────────────────────────────────────────────────
  { code: 'YAN000000', label: 'Young Adult Non-Fiction / General', group: 'YAN' },
];

/**
 * BISAC code-format check: 3 letters + 6 digits.
 * Does NOT verify the code exists in BISG's registry — free-text codes
 * that pass this regex are accepted (publishers will reject unknown
 * codes at upload time).
 */
export function isValidBisacFormat(code: string): boolean {
  return /^[A-Z]{3}\d{6}$/.test(code);
}

/**
 * Lookup a label by code; returns undefined for codes not in the
 * curated list. Callers should fall back to displaying the raw code.
 */
export function bisacLabel(code: string): string | undefined {
  return BISAC_CODES.find((c) => c.code === code)?.label;
}
