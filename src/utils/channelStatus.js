// Summarize the state of a channel (ingest process and its publications) into one status.
//
// live      - receiving input and at least one publication is streaming
// receiving - receiving input, no publication is streaming
// error     - the channel should run but has no input, or a publication fails while nothing is live
// inactive  - the channel is stopped (or has no process)

const ORDER = ['live', 'receiving', 'error', 'inactive'];

// A process that should run, but failed or ended and waits for a reconnect
const isFailing = (progress) => {
	if (!progress || progress.order !== 'start') {
		return false;
	}

	if (progress.state === 'error') {
		return true;
	}

	return progress.state === 'disconnected' && progress.reconnect >= 0;
};

const classify = (ingest, egresses) => {
	egresses = (egresses || []).filter((e) => e && e.order === 'start');

	const result = {
		status: 'inactive',
		reason: 'stopped',
		warning: false,
		live: egresses.filter((e) => e.state === 'connected').length,
		failing: egresses.filter(isFailing).length,
		total: egresses.length,
	};

	if (!ingest || ingest.valid === false || ingest.order !== 'start') {
		return result;
	}

	if (ingest.state === 'connected') {
		if (result.live !== 0) {
			result.status = 'live';
			result.reason = 'live';
			result.warning = result.failing !== 0;
		} else if (result.failing !== 0) {
			result.status = 'error';
			result.reason = 'publication';
		} else {
			result.status = 'receiving';
			result.reason = 'receiving';
		}

		return result;
	}

	result.status = 'error';
	result.reason = isFailing(ingest) ? 'input' : 'connecting';

	return result;
};

const sortChannels = (channels, statuses) => {
	const rank = (channel) => {
		const s = statuses[channel.channelid];
		return ORDER.indexOf(s ? s.status : 'inactive');
	};

	return channels.slice().sort((a, b) => {
		const r = rank(a) - rank(b);
		if (r !== 0) {
			return r;
		}

		const aname = (a.name || '').toUpperCase();
		const bname = (b.name || '').toUpperCase();

		return aname < bname ? -1 : aname > bname ? 1 : 0;
	});
};

export { ORDER, isFailing, classify, sortChannels };
