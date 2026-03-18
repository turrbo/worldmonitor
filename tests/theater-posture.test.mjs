import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculateTheaterPostures } from '../scripts/_theater-posture.mjs';

function getTheater(theaters, id) {
  return theaters.find((theater) => theater.theater === id);
}

describe('theater posture calculator', () => {
  it('elevates a naval-only theater using naval thresholds', () => {
    const theaters = calculateTheaterPostures([], [
      { lat: 26, lon: 55, shipType: 35 },
      { lat: 27, lon: 56, shipType: 35 },
    ], 1234);

    const iran = getTheater(theaters, 'iran-theater');
    assert.equal(iran.postureLevel, 'elevated');
    assert.equal(iran.activeFlights, 0);
    assert.equal(iran.trackedVessels, 2);
    assert.deepEqual(iran.activeOperations, ['naval_presence']);
    assert.equal(iran.assessedAt, 1234);
  });

  it('keeps air-only escalation behavior intact', () => {
    const flights = Array.from({ length: 6 }, (_, index) => ({
      lat: 24 + index * 0.1,
      lon: 121 + index * 0.1,
      aircraftType: index < 4 ? 'fighter' : index === 4 ? 'awacs' : 'tanker',
    }));

    const theaters = calculateTheaterPostures(flights, [], 1234);
    const taiwan = getTheater(theaters, 'taiwan-theater');

    assert.equal(taiwan.postureLevel, 'elevated');
    assert.equal(taiwan.activeFlights, 6);
    assert.equal(taiwan.trackedVessels, 0);
    assert.ok(taiwan.activeOperations.includes('strike_capable'));
    assert.ok(taiwan.activeOperations.includes('aerial_refueling'));
    assert.ok(taiwan.activeOperations.includes('airborne_early_warning'));
  });

  it('uses the higher of air and naval pressure rather than summing them', () => {
    const flights = [
      { lat: 24, lon: 121, aircraftType: 'fighter' },
      { lat: 24.4, lon: 121.4, aircraftType: 'fighter' },
      { lat: 24.8, lon: 121.8, aircraftType: 'awacs' },
    ];
    const vessels = [
      { lat: 23, lon: 120, shipType: 35 },
      { lat: 23.5, lon: 120.5, shipType: 35 },
      { lat: 24, lon: 121, shipType: 35 },
      { lat: 24.5, lon: 121.5, shipType: 35 },
    ];

    const theaters = calculateTheaterPostures(flights, vessels, 1234);
    const taiwan = getTheater(theaters, 'taiwan-theater');

    assert.equal(taiwan.activeFlights, 3);
    assert.equal(taiwan.trackedVessels, 4);
    assert.equal(taiwan.postureLevel, 'elevated');
    assert.ok(taiwan.activeOperations.includes('naval_presence'));
  });

  it('applies the same CII boost server-side for target theaters', () => {
    const theaters = calculateTheaterPostures([], [], 1234, { IR: 87, YE: 72 });

    const iran = getTheater(theaters, 'iran-theater');
    const yemen = getTheater(theaters, 'yemen-redsea-theater');
    const baltic = getTheater(theaters, 'baltic-theater');

    assert.equal(iran.postureLevel, 'critical');
    assert.equal(yemen.postureLevel, 'elevated');
    assert.equal(baltic.postureLevel, 'normal');
  });
});
