const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function dayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

export class SolarNavigator {
  getSunPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
    const n = dayOfYear(date);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    const gamma = (2 * Math.PI / 365) * (n - 1 + (hour - 12) / 24);

    const eqTime =
      229.18 *
      (0.000075 +
        0.001868 * Math.cos(gamma) -
        0.032077 * Math.sin(gamma) -
        0.014615 * Math.cos(2 * gamma) -
        0.040849 * Math.sin(2 * gamma));

    const decl =
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);

    const timeOffset = eqTime + 4 * lng;
    const tst = ((date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + timeOffset) % 1440 + 1440) % 1440;
    const ha = (tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180) * RAD;

    const latRad = lat * RAD;
    const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(ha);
    const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
    const altitude = 90 - zenith * DEG;

    const azNumerator = -Math.sin(ha);
    const azDenominator = Math.tan(decl) * Math.cos(latRad) - Math.sin(latRad) * Math.cos(ha);
    const azimuth = ((Math.atan2(azNumerator, azDenominator) * DEG + 360) % 360 + 180) % 360;

    return { azimuth, altitude };
  }

  getTrueNorth(magneticHeading: number, date: Date, lat: number, lng: number): number {
    const sun = this.getSunPosition(date, lat, lng);
    const declinationCorrection = ((sun.azimuth - magneticHeading + 540) % 360) - 180;
    return (magneticHeading + declinationCorrection + 360) % 360;
  }
}

export const solarNavigator = new SolarNavigator();
