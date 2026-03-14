import * as SQLite from 'expo-sqlite';

type StreetRow = {
  name: string;
  lat: number;
  lng: number;
  city: string;
};

export class Geocoder {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    if (!this.db) {
      this.db = await SQLite.openDatabaseAsync('geocoding.db');
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

    return this.db.getAllAsync<StreetRow>(
      `
      SELECT name, lat, lng, city
      FROM streets
      WHERE name LIKE ?
      ORDER BY name ASC
      LIMIT 5
      `,
      [`${q}%`]
    );
  }

  async reverse(lat: number, lng: number): Promise<StreetRow | null> {
    await this.init();
    if (!this.db) {
      return null;
    }

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
  }
}

export const geocoder = new Geocoder();
