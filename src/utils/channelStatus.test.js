import { classify, sortChannels } from './channelStatus';

const p = (state, order = 'start', reconnect = -1) => ({ valid: true, state, order, reconnect });

test('channel status: inactive', () => {
	expect(classify(null, []).status).toBe('inactive');
	expect(classify({ valid: false, state: 'disconnected', order: 'stop' }, []).status).toBe('inactive');
	expect(classify(p('disconnected', 'stop'), [p('connected')]).status).toBe('inactive');
});

test('channel status: receiving', () => {
	const s = classify(p('connected'), [p('disconnected', 'stop')]);
	expect(s.status).toBe('receiving');
	expect(s.total).toBe(0);

	// a publication that is still connecting is not a failure
	expect(classify(p('connected'), [p('connecting')]).status).toBe('receiving');
});

test('channel status: live', () => {
	const s = classify(p('connected'), [p('connected'), p('connected'), p('disconnected', 'stop')]);
	expect(s).toMatchObject({ status: 'live', warning: false, live: 2, failing: 0, total: 2 });
});

test('channel status: live with a failing publication', () => {
	const s = classify(p('connected'), [p('connected'), p('error', 'start', 10)]);
	expect(s).toMatchObject({ status: 'live', warning: true, live: 1, failing: 1, total: 2 });
});

test('channel status: error', () => {
	expect(classify(p('error', 'start', 15), [])).toMatchObject({ status: 'error', reason: 'input' });
	expect(classify(p('disconnected', 'start', 5), [])).toMatchObject({ status: 'error', reason: 'input' });
	expect(classify(p('connecting'), [])).toMatchObject({ status: 'error', reason: 'connecting' });
	expect(classify(p('connected'), [p('error')])).toMatchObject({ status: 'error', reason: 'publication', failing: 1 });
	expect(classify(p('connected'), [p('disconnected', 'start', 10)])).toMatchObject({ status: 'error', reason: 'publication' });
});

test('channel status: sort', () => {
	const channels = [
		{ channelid: 'a', name: 'Zeta' },
		{ channelid: 'b', name: 'beta' },
		{ channelid: 'c', name: 'Alpha' },
		{ channelid: 'd', name: 'delta' },
		{ channelid: 'e', name: 'Echo' },
	];

	const statuses = {
		a: { status: 'live' },
		b: { status: 'inactive' },
		c: { status: 'error' },
		d: { status: 'receiving' },
		// e has no status (no process yet)
	};

	expect(sortChannels(channels, statuses).map((c) => c.channelid)).toEqual(['a', 'd', 'c', 'b', 'e']);
	// the input is not changed
	expect(channels[0].channelid).toBe('a');
});
