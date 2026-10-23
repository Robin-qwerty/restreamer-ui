import { parseLine, explain, buildEvents, mergeEvents, stability } from './activity';

test('activity: parse log lines', () => {
	expect(parseLine(['1700000000', '[tcp @ 0x55d0c8a1b2c0] [error] Connection to tcp://host:1935 failed: Connection refused'])).toEqual({
		time: 1700000000000,
		level: 'error',
		component: 'tcp',
		message: 'Connection to tcp://host:1935 failed: Connection refused',
	});

	expect(parseLine(['1700000001', '[warning] Non-monotonous DTS in output stream 0:1'])).toMatchObject({
		level: 'warning',
		component: '',
		message: 'Non-monotonous DTS in output stream 0:1',
	});

	expect(parseLine(['1700000002', '[hls @ 0x1] [info] Opening x for writing'])).toMatchObject({ level: 'info', component: 'hls' });
	expect(parseLine(['1700000003', '[fatal] boom']).level).toBe('error');
	expect(parseLine(['1700000004', 'plain text']).level).toBe('info');
});

test('activity: explain common errors', () => {
	expect(explain('Connection to tcp://x failed: Connection refused').title).toBe('Connection refused');
	expect(explain('Server returned 403 Forbidden (access denied)').title).toBe('Access denied');
	expect(explain('Server returned 404 Not Found').title).toBe('Stream not found');
	expect(explain('Error writing trailer: Broken pipe').title).toBe('The connection was closed');
	expect(explain('Already publishing').title).toBe('This stream key is already in use');
	expect(explain('Invalid data found when processing input').title).toBe('The input is not a valid stream');
	expect(explain('Non-monotonous DTS in output stream 0:0').title).toBe('Timestamps jumped');
	expect(explain('OpenEncodeSessionEx failed: unsupported device (2)').title).toBe('GPU encoder not available');
	expect(explain('something completely different')).toBe(null);
});

test('activity: events from runs', () => {
	const run = (t, extra = []) => ({
		created_at: t,
		log: [
			[`${t + 1}`, '[info] Input #0, flv'],
			...extra,
			[`${t + 9}`, '[tcp @ 0xabc] [error] Connection to tcp://h failed: Connection refused'],
			[`${t + 9}`, '[fatal] Error opening output files: Connection refused'],
		],
	});

	const report = {
		created_at: 1700000100,
		log: [
			['1700000101', '[info] Input #0, flv'],
			['1700000102', '[warning] Non-monotonous DTS in output stream 0:1; previous: 100, current: 90'],
			['1700000103', '[warning] Non-monotonous DTS in output stream 0:1; previous: 200, current: 180'],
		],
		history: [run(1700000000, [['1700000002', '[warning] Non-monotonous DTS in output stream 0:1; previous: 5, current: 4']]), run(1700000050)],
	};

	const events = buildEvents(report, 'Main', 'channel');

	// one merged warning, one merged stop for both failed runs, one start
	expect(events.map((e) => e.type)).toEqual(['log', 'stop', 'start']);
	expect(events[0]).toMatchObject({ level: 'warning', count: 3, time: 1700000103000, first: 1700000002000, source: 'Main' });
	expect(events[1]).toMatchObject({
		level: 'error',
		message: 'Stopped',
		count: 2,
		reason: 'Connection to tcp://[anonymized] failed: Connection refused',
		time: 1700000059001,
	});
	expect(events[2]).toMatchObject({ type: 'start', time: 1700000000000, count: 1 });

	// the error burst of the current run is not hidden while it runs ...
	const current = { created_at: 1700000000, log: [['1700000001', '[error] Connection refused']] };
	expect(buildEvents(current, 'x').map((e) => e.type)).toEqual(['log', 'start']);
	// ... but it is when the process has stopped
	expect(buildEvents(current, 'x', 'publication', false).map((e) => e.type)).toEqual(['stop', 'start']);

	// same explanation, same event; harmless warnings are ignored
	const similar = {
		created_at: 1700000000,
		log: [
			['1700000001', '[tcp @ 0x1] [error] Connection to tcp://a failed: Connection refused'],
			['1700000002', '[error] Error opening output files: Connection refused'],
			['1700000003', '[flv @ 0x2] [warning] Failed to update header with correct duration.'],
			['1700000004', '[hls @ 0x3] [error] Cannot use rename on non file protocol, this may lead to races and temporary partial files'],
		],
	};
	const similarEvents = buildEvents(similar, 'x');
	expect(similarEvents.map((e) => e.type)).toEqual(['log', 'start']);
	expect(similarEvents[0].count).toBe(2);

	expect(buildEvents(null, 'x')).toEqual([]);

	const merged = mergeEvents([events, [{ id: 'x', time: 1700000200000, type: 'log', level: 'error' }]], 3);
	expect(merged.length).toBe(3);
	expect(merged[0].id).toBe('x');
});

test('activity: stability rating', () => {
	const now = 1700001000000;
	const samples = (fn) => Array.from({ length: 30 }, (_, i) => ({ time: now - (30 - i) * 2000, fps: 30, frames: i * 60, ...fn(i) }));

	const good = stability(
		samples(() => ({ bitrate: 6000, speed: 1, drop: 0 })),
		null,
		now,
	);
	expect(good.rating).toBe('good');
	expect(good.restarts).toBe(0);

	const jumpy = stability(
		samples((i) => ({ bitrate: i % 2 ? 1000 : 9000, speed: 1, drop: 0 })),
		null,
		now,
	);
	expect(jumpy.rating).toBe('poor');
	expect(jumpy.reasons).toContain('bitrate');

	const drops = stability(
		samples((i) => ({ bitrate: 6000, speed: 1, drop: i * 2 })),
		null,
		now,
	);
	expect(drops.rating).toBe('poor');
	expect(drops.reasons).toContain('drops');

	const slow = stability(
		samples((i) => ({ bitrate: 6000, speed: i % 5 === 0 ? 0.8 : 1, drop: 0 })),
		null,
		now,
	);
	expect(slow.rating).toBe('fair');

	const report = { created_at: now / 1000 - 60, history: [{ created_at: now / 1000 - 7200 }, { created_at: now / 1000 - 600 }] };
	const restarts = stability([], report, now);
	expect(restarts.restarts).toBe(2);
	expect(restarts.rating).toBe('fair');

	expect(stability([], null, now).rating).toBe('unknown');
});

test('activity: working again after a restart', () => {
	const report = {
		created_at: 1700000100,
		log: [['1700000101', '[info] running']],
		history: [{ created_at: 1700000000, log: [['1700000050', '[error] Connection refused']] }],
	};

	// working for 20 seconds
	let events = buildEvents(report, 'x', 'channel', true, true, 1700000120000);
	expect(events[0]).toMatchObject({ type: 'recovered', level: 'success', time: 1700000115000 });

	// only 10 seconds, or not working
	expect(buildEvents(report, 'x', 'channel', true, true, 1700000110000).some((e) => e.type === 'recovered')).toBe(false);
	expect(buildEvents(report, 'x', 'channel', true, false, 1700000120000).some((e) => e.type === 'recovered')).toBe(false);
	// no restart, nothing to recover from
	expect(buildEvents({ created_at: 1700000100, log: [] }, 'x', 'channel', true, true, 1700000120000).some((e) => e.type === 'recovered')).toBe(false);

	// the restart no longer lowers the rating once it works again
	const before = stability([], report, 1700000110000, true);
	expect(before.rating).toBe('fair');
	const after = stability([], report, 1700000120000, true);
	expect(after).toMatchObject({ restarts: 1, recovered: true });
	expect(after.rating).toBe('unknown');
});

test('activity: the first seconds after a start do not count', () => {
	const now = 1700001000000;
	const report = { created_at: (now - 60000) / 1000 };
	const samples = Array.from({ length: 30 }, (_, i) => ({
		time: now - 60000 + i * 2000,
		fps: 30,
		frames: i * 60,
		drop: 0,
		bitrate: 6000,
		// catching up during the first 10 seconds
		speed: i < 5 ? 1.4 : 1,
	}));

	expect(stability(samples, report, now, true).rating).toBe('good');
	expect(stability(samples, null, now, true).rating).toBe('fair');
});
