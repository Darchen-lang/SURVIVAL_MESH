import * as SQLite from 'expo-sqlite';

type ArticlePreview = {
  id: string;
  category: string;
  title: string;
  preview: string;
};

type ArticleRow = {
  id: string;
  category: string;
  title: string;
  content: string;
};

const BUILTIN_ARTICLES: ArticleRow[] = [
  {
    id: 'fa-bleeding',
    category: 'medical',
    title: 'Severe Bleeding Control',
    content:
      'Apply direct pressure immediately. Pack deep wounds with clean cloth or gauze. If bleeding from a limb does not stop, apply a tourniquet above the wound and note time of application.',
  },
  {
    id: 'fa-burns',
    category: 'medical',
    title: 'Burn Care Basics',
    content:
      'Cool burns with clean running water for 20 minutes. Do not apply grease or toothpaste. Cover with a sterile non-stick dressing. Watch for shock and dehydration.',
  },
  {
    id: 'water-purification',
    category: 'water',
    title: 'Emergency Water Purification',
    content:
      'Boil water for at least 1 minute (3 minutes at high altitude). If boiling is impossible, use a filter and chlorine tablets as directed. Store purified water in clean sealed containers.',
  },
  {
    id: 'shelter-priority',
    category: 'shelter',
    title: 'Shelter Priority In Cold/Wet Conditions',
    content:
      'Protect from wind first, then from ground moisture and rain. Use layered insulation beneath the body. Keep clothing dry and preserve body heat with minimal exposure.',
  },
  {
    id: 'nav-sun',
    category: 'navigation',
    title: 'Sun-Based Direction Check',
    content:
      'In most regions, the sun rises roughly in the east and sets roughly in the west. Use noon shadow direction with local hemisphere awareness to estimate north/south orientation.',
  },
  {
    id: 'heat-illness',
    category: 'medical',
    title: 'Heat Illness Response',
    content:
      'Move to shade, loosen clothing, cool skin with water/evaporation, and give oral rehydration if alert. If confusion, vomiting, or no sweating with hot skin, cool aggressively and seek evacuation. Source: CDC/WHO heat guidance.',
  },
  {
    id: 'hypothermia',
    category: 'medical',
    title: 'Hypothermia Field Steps',
    content:
      'Get out of wind/rain, remove wet clothes, insulate above and below. Give warm sweet drinks if conscious. Handle gently; avoid rubbing limbs. Rewarm core first (chest, armpits). Source: Red Cross wilderness guidelines.',
  },
  {
    id: 'water-bleach',
    category: 'water',
    title: 'Disinfect Water With Bleach',
    content:
      'Use unscented household bleach (5–6% sodium hypochlorite). Clear water: 2 drops per liter (8 drops per gallon). Cloudy water: 4 drops per liter (16 per gallon). Stir, wait 30 minutes; slight chlorine smell should remain. Source: CDC emergency disinfection.',
  },
  {
    id: 'water-field-collection',
    category: 'water',
    title: 'Field Water Collection Tips',
    content:
      'Prefer flowing upstream sources; avoid stagnant pools. Skim clearer surface water. Collect morning dew with cloth. Let sediment settle before filtering/boiling. Solar still is last resort; low yield. Source: common SAR field practice.',
  },
  {
    id: 'signaling-basics',
    category: 'signal',
    title: 'Signaling Basics',
    content:
      'Use whistle: 3 blasts for distress. Mirror/flashlight: flash toward rescuers; use 3 flashes. Ground-to-air: SOS or large arrow, high contrast. Night: steady light or 3-flash pattern. Conserve batteries. Source: SAR signaling conventions.',
  },
  {
    id: 'fire-safe-setup',
    category: 'fire',
    title: 'Safe Fire Setup',
    content:
      'Clear 10 ft around site, avoid low branches. Build on mineral soil or rock. Small, controlled flame saves fuel and reduces smoke signature. Fully extinguish: drown, stir, feel cold. Source: USFS campfire safety.',
  },
  {
    id: 'shelter-venting',
    category: 'shelter',
    title: 'Shelter Venting & Condensation',
    content:
      'Pitch with a small vent or gap to reduce moisture buildup. Keep sleeping bag loft dry; add ground insulation first. In rain, prioritize roof tension and drip line over full closure. Source: backpacking shelter practice.',
  },
  {
    id: 'navigation-watch',
    category: 'navigation',
    title: 'Analog Watch Direction',
    content:
      'Northern hemisphere: point hour hand at sun; midpoint between hand and 12 is south. Southern hemisphere: point 12 at sun; midpoint to hour hand is north. Adjust for daylight saving by using 1 instead of 12 when needed. Source: field navigation basics.',
  },
  {
    id: 'food-safety-field',
    category: 'food',
    title: 'Field Food Safety Priorities',
    content:
      'Water, warmth, shelter come before foraging. Avoid unknown mushrooms/berries. Perishables: use within 2 hours (1 hour if >32°C/90°F). When in doubt, discard. Source: USDA food safety + wilderness caution.',
  },
  {
    id: 'wound-infection-watch',
    category: 'medical',
    title: 'Watch For Wound Infection',
    content:
      'Clean with potable water, remove debris, cover with clean dressing. Redness spreading, pus, fever, or worsening pain are warning signs—clean again, ventilate briefly, and seek antibiotics/evacuation if possible. Source: wilderness first aid basics.',
  },
];

export class KnowledgeBase {
  private db: SQLite.SQLiteDatabase | null = null;
  private hasFts = false;

  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = await SQLite.openDatabaseAsync('knowledge.db');

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS articles_fts (
        id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL
      );
    `);

    const columns = await this.db.getAllAsync<{ name: string }>(`PRAGMA table_info(articles_fts)`);
    this.hasFts = columns.some((c) => c.name === 'content');

    const countRow = await this.db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM articles`);
    const count = countRow?.count ?? 0;

    if (count === 0) {
      for (const article of BUILTIN_ARTICLES) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO articles (id, category, title, content) VALUES (?, ?, ?, ?)`,
          [article.id, article.category, article.title, article.content]
        );
        await this.db.runAsync(
          `INSERT OR REPLACE INTO articles_fts (id, category, title, content) VALUES (?, ?, ?, ?)`,
          [article.id, article.category, article.title, article.content]
        );
      }
    }
  }

  async search(query: string): Promise<ArticlePreview[]> {
    await this.init();
    if (!this.db) {
      return [];
    }

    const q = query.trim();
    if (!q) {
      return [];
    }

    if (this.hasFts) {
      const rows = await this.db.getAllAsync<ArticlePreview>(
        `
        SELECT id, category, title, substr(content, 1, 180) AS preview
        FROM articles_fts
        WHERE title LIKE ? OR content LIKE ? OR category LIKE ?
        ORDER BY title ASC
        LIMIT 20
        `,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
      return rows;
    }

    const rows = await this.db.getAllAsync<ArticlePreview>(
      `
      SELECT id, category, title, substr(content, 1, 180) AS preview
      FROM articles
      WHERE title LIKE ? OR content LIKE ? OR category LIKE ?
      ORDER BY title ASC
      LIMIT 20
      `,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );

    return rows;
  }

  async getArticle(id: string): Promise<ArticleRow | null> {
    await this.init();
    if (!this.db) {
      return null;
    }

    const row = await this.db.getFirstAsync<ArticleRow>(
      `SELECT id, category, title, content FROM articles WHERE id = ? LIMIT 1`,
      [id]
    );
    return row ?? null;
  }

  async getCategories(): Promise<string[]> {
    await this.init();
    if (!this.db) {
      return [];
    }

    const rows = await this.db.getAllAsync<{ category: string }>(
      `SELECT DISTINCT category FROM articles ORDER BY category ASC`
    );
    return rows.map((r) => r.category);
  }
}

export const knowledgeBase = new KnowledgeBase();
