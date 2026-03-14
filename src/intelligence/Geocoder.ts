import * as SQLite from 'expo-sqlite';

type StreetRow = {
  name: string;
  lat: number;
  lng: number;
  city: string;
};

export class Geocoder {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    if (!this.db) {
      this.db = await SQLite.openDatabaseAsync('geocoding.db');
    }
    
    // Try to create the streets table if it doesn't exist
    try {
      await this.db?.execAsync(`
        CREATE TABLE IF NOT EXISTS streets (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          city TEXT NOT NULL
        );
      `);
      
      // Seed with some default locations if table is empty
      const count = await this.db?.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM streets`
      );
      
      if (count?.count === 0) {
        await this.seedDefaultLocations();
      }
    } catch {
      // Table might already exist or other error — that's fine
    }
    
    this.isInitialized = true;
  }

  private async seedDefaultLocations(): Promise<void> {
    // Default locations for testing/demo purposes
    const defaultLocations = [
      { name: 'Main Street', lat: 28.6139, lng: 77.209, city: 'Delhi' },
      { name: 'Park Road', lat: 28.6129, lng: 77.218, city: 'Delhi' },
      { name: 'Richmond Road', lat: 28.5749, lng: 77.214, city: 'Bangalore' },
      { name: 'MG Road', lat: 28.5733, lng: 77.216, city: 'Bangalore' },
      { name: 'Marine Drive', lat: 19.0176, lng: 72.8292, city: 'Mumbai' },
      { name: 'Bandra Road', lat: 19.0596, lng: 72.8295, city: 'Mumbai' },
      { name: 'St Mary Church', lat: 28.6124, lng: 77.2102, city: 'Delhi' },
      { name: 'Fire Station', lat: 28.6145, lng: 77.2095, city: 'Delhi' },
      { name: 'Hospital Central', lat: 28.6110, lng: 77.2120, city: 'Delhi' },
      { name: 'Water Supply', lat: 28.6150, lng: 77.2080, city: 'Delhi' },
    ];

    for (const loc of defaultLocations) {
      try {
        await this.db?.runAsync(
          `INSERT OR IGNORE INTO streets (name, lat, lng, city) VALUES (?, ?, ?, ?)`,
          [loc.name, loc.lat, loc.lng, loc.city]
        );
      } catch {
        // Ignore individual insert errors
      }
    }
  }

  async search(query: string): Promise<StreetRow[]> {
    await this.init();
    if (!this.db) {
      return [];
    }

    const q = query.trim();
    if (!q) {
      return [];
    }

    try {
      return await this.db.getAllAsync<StreetRow>(
        `
        SELECT name, lat, lng, city
        FROM streets
        WHERE name LIKE ?
        ORDER BY name ASC
        LIMIT 5
        `,
        [`${q}%`]
      );
    } catch {
      return [];
    }
  }

  async reverse(lat: number, lng: number): Promise<StreetRow | null> {
    await this.init();
    if (!this.db) {
      return null;
    }

    try {
      const row = await this.db.getFirstAsync<StreetRow>(
        `
        SELECT
          name,
          lat,
          lng,
          city
        FROM streets
        ORDER BY ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) ASC
        LIMIT 1
        `,
        [lat, lat, lng, lng]
      );

      return row ?? null;
    } catch {
      return null;
    }
  }
}

export const geocoder = new Geocoder();
