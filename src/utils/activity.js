import { anonymize } from './anonymizer';

// Turn process reports (FFmpeg logs) and progress samples into a readable activity log.

const LEVELS = {
	trace: 'debug',
	debug: 'debug',
	verbose: 'debug',
	info: 'info',
	warning: 'warning',
	error: 'error',
	fatal: 'error',
	panic: 'error',
};

const lineRe = /^(?:\[([^\]@]+?)(?: @ 0x[0-9a-fA-F]+)?\] )?\[(trace|debug|verbose|info|warning|error|fatal|panic)\] ?(.*)$/;

// A log entry from a process report is [timestamp, text], e.g.
// ["1729670000", "[tcp @ 0x55d0c8] [error] Connection to tcp://example.com:1935 failed: Connection refused"]
const parseLine = (entry) => {
	const time = parseInt(entry[0]) * 1000 || 0;
	const text = (entry[1] || '').trim();

	const m = lineRe.exec(text);
	if (m === null) {
		return { time: time, level: 'info', component: '', message: text };
	}

	return {
		time: time,
		level: LEVELS[m[2]] || 'info',
		component: (m[1] || '').trim(),
		message: m[3].trim(),
	};
};

// Plain-language explanations for common FFmpeg messages. The first match wins.
const explanations = [
	{
		re: /already publishing|badname|stream.*already in use/i,
		title: 'This stream key is already in use',
		tip: 'Another encoder (or a second OBS) is already sending to this address. Stop it or use another stream key.',
	},
	{
		re: /connection refused/i,
		title: 'Connection refused',
		tip: 'Nothing is listening at this address. Check that the server is running and that the address and port are correct.',
	},
	{
		re: /timed out|timeout/i,
		title: 'Connection timed out',
		tip: 'The other side did not answer. Check the address, a firewall, or the network connection.',
	},
	{
		re: /name or service not known|failed to resolve|could not resolve|resolve hostname/i,
		title: 'Host name not found',
		tip: 'The address could not be resolved. Check for typos in the server address.',
	},
	{
		re: /401|unauthori[sz]ed/i,
		title: 'Not authorized',
		tip: 'The stream key, token or credentials are wrong or have expired.',
	},
	{
		re: /403|forbidden/i,
		title: 'Access denied',
		tip: 'The server refused the stream. Check the stream key and whether the account is allowed to go live.',
	},
	{
		re: /404|not found|no such stream|stream not found/i,
		title: 'Stream not found',
		tip: 'The source is not live yet or the address is wrong. Start the source (e.g. OBS) and check the address.',
	},
	{
		re: /broken pipe|connection reset|end of file|\beof\b/i,
		title: 'The connection was closed',
		tip: 'The other side stopped the stream or dropped the connection. If it repeats, check the network and the stream settings of the platform.',
	},
	{
		re: /certificate|ssl|tls/i,
		title: 'Secure connection (TLS) failed',
		tip: 'The certificate does not match the address (e.g. rtmps://localhost) or is not trusted. Use the right host name or plain rtmp:// on the same device.',
	},
	{
		re: /nvenc|nvcuda|cuda|openencodesession/i,
		title: 'GPU encoder not available',
		tip: 'NVENC could not be used. Check that the NVIDIA driver works and the container has GPU access, or switch to x264.',
	},
	{
		re: /cannot allocate memory|out of memory/i,
		title: 'Out of memory',
		tip: 'The server ran out of memory. Close other processes or lower the resolution.',
	},
	{
		re: /invalid data found/i,
		title: 'The input is not a valid stream',
		tip: 'The data could not be read. Wrong protocol or format, or the source is not sending video yet.',
	},
	{
		re: /non[- ]?monoton/i,
		title: 'Timestamps jumped',
		tip: 'Usually caused by network jitter or a restart of the source. Harmless when it happens rarely.',
	},
	{
		re: /corrupt|missing picture|error while decoding|concealing|decode_slice|packet.*(lost|loss)|missing reference/i,
		title: 'Damaged video data',
		tip: 'Data was lost between the source and Restreamer. Check the network quality or lower the bitrate of the source.',
	},
	{
		re: /input\/output error|i\/o error/i,
		title: 'Network or input/output error',
		tip: 'Reading or writing the stream failed. Often a network problem or the other side closing the connection.',
	},
	{
		re: /max delay reached|queue input is backward|past duration|too many packets buffered|thread message queue blocking/i,
		title: 'Timing problem',
		tip: 'The stream does not arrive smoothly. The source or the network cannot keep up.',
	},
];

const explain = (message) => {
	for (let e of explanations) {
		if (e.re.test(message)) {
			return { title: e.title, tip: e.tip };
		}
	}

	return null;
};

// Harmless messages that would only clutter the log
const ignored = [
	/failed to update header with correct (duration|filesize)/i,
	// the HLS muxer writes over HTTP to Restreamer's memory filesystem, where temp files can't be renamed
	/cannot use rename on non file protocol/i,
];

// Group repeated messages, e.g. "Connection refused" every 15 seconds
const normalize = (message) => message.replace(/0x[0-9a-fA-F]+/g, '#').replace(/\d+(\.\d+)?/g, '#');

// The errors at the end of a run (within this many ms of its last line) explain why it stopped
const FINAL_BURST = 3000;

// After a restart, a process counts as recovered once it has been working this long
const RECOVERED_AFTER = 15000;

// The current run (the report itself) started this long ago and the process works now
const isRecovered = (report, healthy, now) => healthy === true && report && report.created_at && now - report.created_at * 1000 >= RECOVERED_AFTER;

// Build a list of events from a process report. The newest event comes first.
// report: { created_at, log: [[ts, text]], history: [{ created_at, log }] }
//
// To keep the list readable, a run that ended becomes one "Stopped" event with the most useful
// error as the reason (it is restarted automatically), and identical events of all runs are
// merged into one with a count, e.g. "Stopped: Connection refused ×12".
// running: whether the process is still running, otherwise its last run has ended as well.
// healthy: whether it works right now (connected). After a restart this adds a "Working again" event.
const buildEvents = (report, source, kind = 'channel', running = true, healthy = false, now = Date.now()) => {
	if (!report) {
		return [];
	}

	const runs = [...(Array.isArray(report.history) ? report.history : []), report].filter((r) => r && r.created_at);
	runs.sort((a, b) => a.created_at - b.created_at);

	const merged = new Map();
	const add = (key, event) => {
		if (merged.has(key)) {
			const e = merged.get(key);
			e.count += event.count;
			e.first = Math.min(e.first, event.time);
			if (event.time > e.time) {
				e.time = event.time;
			}
		} else {
			merged.set(key, { ...event, id: `${source}:${key}`, source: source, kind: kind, first: event.time });
		}
	};

	if (runs.length !== 0) {
		add('start', { time: runs[0].created_at * 1000, level: 'info', type: 'start', message: 'Started', raw: '', count: 1 });
	}

	runs.forEach((run, index) => {
		const lines = (Array.isArray(run.log) ? run.log : []).map(parseLine).map((l) => ({ ...l, message: anonymize(l.message) }));
		const ended = index < runs.length - 1 || !running;
		const lastTime = lines.length !== 0 ? lines[lines.length - 1].time : run.created_at * 1000;

		let burst = [];
		if (ended) {
			burst = lines.filter((l) => l.level === 'error' && l.time >= lastTime - FINAL_BURST);
		}

		for (let line of lines) {
			if (line.level !== 'warning' && line.level !== 'error') {
				continue;
			}

			if (burst.includes(line) || ignored.some((re) => re.test(line.message))) {
				continue;
			}

			// messages with the same explanation are the same problem
			const explanation = explain(line.message);
			add(`log:${line.level}:${explanation ? explanation.title : normalize(line.message)}`, {
				time: line.time,
				level: line.level,
				type: 'log',
				message: line.message,
				component: line.component,
				raw: line.message,
				count: 1,
			});
		}

		if (ended) {
			// prefer an error we can explain, otherwise the last one
			const best = burst.find((l) => explain(l.message) !== null) || burst[burst.length - 1] || null;
			const reason = best ? best.message : '';

			const explanation = best ? explain(best.message) : null;
			add(`stop:${explanation ? explanation.title : normalize(reason)}`, {
				// just after the last log line of the run, so it is listed above it
				time: lastTime + 1,
				level: best ? 'error' : 'info',
				type: 'stop',
				message: 'Stopped',
				reason: reason,
				raw: burst.map((l) => l.message).join('\n'),
				count: 1,
			});
		}
	});

	// the last run followed a failed one and has been working for a while
	if (runs.length > 1 && running && isRecovered(report, healthy, now)) {
		const time = report.created_at * 1000 + RECOVERED_AFTER;
		merged.set('recovered', {
			id: `${source}:recovered:${report.created_at}`,
			source: source,
			kind: kind,
			time: time,
			first: time,
			level: 'success',
			type: 'recovered',
			message: 'Working again',
			raw: '',
			count: 1,
		});
	}

	return Array.from(merged.values()).sort((a, b) => b.time - a.time);
};

const mergeEvents = (lists, limit = 300) => {
	return []
		.concat(...lists)
		.sort((a, b) => b.time - a.time)
		.slice(0, limit);
};

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

// Rate how stable the input is, from progress samples of the last minutes and the restarts in the last hour.
// samples: [{ time, bitrate, fps, speed, frames, drop }]
// healthy: whether it works right now. Restarts only count until it has been working again for 15 seconds.
const stability = (samples, report, now = Date.now(), healthy = false) => {
	const result = {
		rating: 'unknown',
		bitrateVariation: 0,
		speedIssues: 0,
		dropRate: 0,
		restarts: 0,
		recovered: false,
		reasons: [],
	};

	if (report) {
		const runs = [...(Array.isArray(report.history) ? report.history : []), report].filter((r) => r && r.created_at);
		const starts = runs.map((r) => r.created_at * 1000).sort((a, b) => a - b);
		// every run after the first one is a restart
		result.restarts = starts.slice(1).filter((t) => t >= now - 3600 * 1000).length;
	}

	// FFmpeg catches up right after a (re)start (speed far above 1x); that is not a problem of the input
	const started = report && report.created_at ? report.created_at * 1000 : 0;
	samples = (samples || []).filter((s) => s.time >= now - 5 * 60 * 1000 && s.fps > 0 && (s.time < started || s.time >= started + RECOVERED_AFTER));

	let score = 0;
	const worse = (level, reason) => {
		score = Math.max(score, level);
		result.reasons.push(reason);
	};

	if (result.restarts !== 0 && isRecovered(report, healthy, now)) {
		result.recovered = true;
	} else if (result.restarts >= 3) {
		worse(2, 'restarts');
	} else if (result.restarts >= 1) {
		worse(1, 'restarts');
	}

	if (samples.length < 5) {
		result.rating = score === 0 ? 'unknown' : score === 1 ? 'fair' : 'poor';
		return result;
	}

	const bitrates = samples.map((s) => s.bitrate);
	const m = mean(bitrates);
	if (m > 0) {
		const sd = Math.sqrt(mean(bitrates.map((b) => (b - m) * (b - m))));
		result.bitrateVariation = sd / m;
	}

	result.speedIssues = samples.filter((s) => s.speed < 0.97 || s.speed > 1.03).length / samples.length;

	const first = samples[0];
	const last = samples[samples.length - 1];
	const frames = last.frames - first.frames;
	if (frames > 0) {
		result.dropRate = Math.max(0, last.drop - first.drop) / frames;
	}

	if (result.bitrateVariation > 0.5) {
		worse(2, 'bitrate');
	} else if (result.bitrateVariation > 0.25) {
		worse(1, 'bitrate');
	}

	if (result.speedIssues > 0.3) {
		worse(2, 'speed');
	} else if (result.speedIssues > 0.1) {
		worse(1, 'speed');
	}

	if (result.dropRate > 0.02) {
		worse(2, 'drops');
	} else if (result.dropRate > 0.005) {
		worse(1, 'drops');
	}

	result.rating = ['good', 'fair', 'poor'][score];

	return result;
};

export { parseLine, explain, buildEvents, mergeEvents, stability };
