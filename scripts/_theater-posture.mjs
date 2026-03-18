export const POSTURE_THEATERS = [
  {
    id: 'iran-theater',
    bounds: { north: 42, south: 20, east: 65, west: 30 },
    targetNationCode: 'IR',
    thresholds: { elevated: 8, critical: 20 },
    navalThresholds: { elevated: 2, critical: 5 },
    strikeIndicators: { minTankers: 2, minAwacs: 1, minFighters: 5 },
  },
  {
    id: 'taiwan-theater',
    bounds: { north: 30, south: 18, east: 130, west: 115 },
    targetNationCode: 'TW',
    thresholds: { elevated: 6, critical: 15 },
    navalThresholds: { elevated: 4, critical: 10 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 4 },
  },
  {
    id: 'baltic-theater',
    bounds: { north: 65, south: 52, east: 32, west: 10 },
    targetNationCode: null,
    thresholds: { elevated: 5, critical: 12 },
    navalThresholds: { elevated: 3, critical: 8 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 3 },
  },
  {
    id: 'blacksea-theater',
    bounds: { north: 48, south: 40, east: 42, west: 26 },
    targetNationCode: null,
    thresholds: { elevated: 4, critical: 10 },
    navalThresholds: { elevated: 3, critical: 6 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 3 },
  },
  {
    id: 'korea-theater',
    bounds: { north: 43, south: 33, east: 132, west: 124 },
    targetNationCode: 'KP',
    thresholds: { elevated: 5, critical: 12 },
    navalThresholds: { elevated: 3, critical: 8 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 3 },
  },
  {
    id: 'south-china-sea',
    bounds: { north: 25, south: 5, east: 121, west: 105 },
    targetNationCode: null,
    thresholds: { elevated: 6, critical: 15 },
    navalThresholds: { elevated: 4, critical: 10 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 4 },
  },
  {
    id: 'east-med-theater',
    bounds: { north: 37, south: 33, east: 37, west: 25 },
    targetNationCode: null,
    thresholds: { elevated: 4, critical: 10 },
    navalThresholds: { elevated: 3, critical: 6 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 3 },
  },
  {
    id: 'israel-gaza-theater',
    bounds: { north: 33, south: 29, east: 36, west: 33 },
    targetNationCode: 'PS',
    thresholds: { elevated: 3, critical: 8 },
    navalThresholds: { elevated: 2, critical: 5 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 3 },
  },
  {
    id: 'yemen-redsea-theater',
    bounds: { north: 22, south: 11, east: 54, west: 32 },
    targetNationCode: 'YE',
    thresholds: { elevated: 4, critical: 10 },
    navalThresholds: { elevated: 3, critical: 8 },
    strikeIndicators: { minTankers: 1, minAwacs: 1, minFighters: 3 },
  },
];

function countVesselsInBounds(vessels, bounds) {
  let count = 0;
  for (const vessel of vessels) {
    if (
      vessel.lat >= bounds.south &&
      vessel.lat <= bounds.north &&
      vessel.lon >= bounds.west &&
      vessel.lon <= bounds.east
    ) {
      count++;
    }
  }
  return count;
}

export function calculateTheaterPostures(flights, vessels = [], assessedAt = Date.now(), ciiScores = {}) {
  return POSTURE_THEATERS.map((theater) => {
    const theaterFlights = flights.filter(
      (flight) =>
        flight.lat >= theater.bounds.south &&
        flight.lat <= theater.bounds.north &&
        flight.lon >= theater.bounds.west &&
        flight.lon <= theater.bounds.east,
    );

    const total = theaterFlights.length;
    const tankers = theaterFlights.filter((flight) => flight.aircraftType === 'tanker').length;
    const awacs = theaterFlights.filter((flight) => flight.aircraftType === 'awacs').length;
    const fighters = theaterFlights.filter((flight) => flight.aircraftType === 'fighter').length;
    const vesselCount = countVesselsInBounds(vessels, theater.bounds);

    const airLevel =
      total >= theater.thresholds.critical ? 2 :
        total >= theater.thresholds.elevated ? 1 : 0;
    const navalLevel =
      vesselCount >= theater.navalThresholds.critical ? 2 :
        vesselCount >= theater.navalThresholds.elevated ? 1 : 0;
    const ciiScore = theater.targetNationCode ? Number(ciiScores[theater.targetNationCode]) || 0 : 0;
    const ciiLevel =
      ciiScore >= 85 ? 2 :
        ciiScore >= 70 ? 1 : 0;
    const combinedLevel = Math.max(airLevel, navalLevel, ciiLevel);
    const postureLevel =
      combinedLevel === 2 ? 'critical' :
        combinedLevel === 1 ? 'elevated' : 'normal';

    const strikeCapable =
      tankers >= theater.strikeIndicators.minTankers &&
      awacs >= theater.strikeIndicators.minAwacs &&
      fighters >= theater.strikeIndicators.minFighters;

    const ops = [];
    if (strikeCapable) ops.push('strike_capable');
    if (tankers > 0) ops.push('aerial_refueling');
    if (awacs > 0) ops.push('airborne_early_warning');
    if (vesselCount > 0) ops.push('naval_presence');

    return {
      theater: theater.id,
      postureLevel,
      activeFlights: total,
      trackedVessels: vesselCount,
      activeOperations: ops,
      assessedAt,
    };
  });
}
