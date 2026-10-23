import React from 'react';

import { useLingui } from '@lingui/react';
import { Trans, t } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Link from '@mui/material/Link';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import Stack from '@mui/material/Stack';
import StopIcon from '@mui/icons-material/Stop';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import * as A from '../../utils/activity';
import { anonymize } from '../../utils/anonymizer';
import useInterval from '../../hooks/useInterval';
import DebugModal from '../../misc/modals/Debug';
import Duration from '../../misc/Duration';
import Number from '../../misc/Number';
import ProcessModal from '../../misc/modals/Process';
import Services from '../Publication/Services';

const MAX_SAMPLES = 150; // 5 minutes at one sample every 2 seconds

const useStyles = makeStyles((theme) => ({
	section: {
		marginTop: '.8em',
		marginBottom: '.4em',
		textTransform: 'uppercase',
		letterSpacing: '.05em',
		fontSize: '.7rem!important',
		opacity: 0.7,
	},
	card: {
		padding: '.6em .7em',
		marginBottom: '.6em',
		borderRadius: 4,
		backgroundColor: 'rgba(255,255,255,.04)',
	},
	stat: {
		minWidth: 0,
		flex: 1,
	},
	statValue: {
		fontWeight: '600!important',
		whiteSpace: 'nowrap',
	},
	statLabel: {
		fontSize: '.7rem!important',
		opacity: 0.7,
	},
	sparkline: {
		display: 'block',
		width: '100%',
		height: 28,
	},
	events: {},
	event: {
		padding: '.35em 0',
		cursor: 'pointer',
		borderBottom: '1px solid rgba(255,255,255,.06)',
	},
	eventIcon: {
		fontSize: '1.1rem!important',
		marginTop: 2,
	},
	eventMessage: {
		wordBreak: 'break-word',
	},
	eventMeta: {
		fontSize: '.7rem!important',
		opacity: 0.7,
	},
	raw: {
		whiteSpace: 'pre-wrap',
		fontFamily: 'monospace',
		fontSize: '.75rem!important',
		opacity: 0.8,
		wordBreak: 'break-all',
		marginTop: '.3em',
	},
	link: {
		marginRight: 12,
		fontSize: '.8rem!important',
	},
}));

const levelColors = {
	error: '#f44336',
	warning: '#ffa726',
	info: '#9e9e9e',
};

const ratingColors = {
	good: '#4caf50',
	fair: '#ffa726',
	poor: '#f44336',
	unknown: '#9e9e9e',
};

const formatTime = (time) => {
	const d = new Date(time);
	const today = new Date();
	if (d.toDateString() === today.toDateString()) {
		return d.toLocaleTimeString();
	}

	return d.toLocaleString();
};

function Sparkline(props) {
	const classes = useStyles();
	const values = props.values;

	if (values.length < 2) {
		return <svg className={classes.sparkline} />;
	}

	const max = Math.max(...values, 1);
	const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${27 - (v / max) * 25}`).join(' ');

	return (
		<svg className={classes.sparkline} viewBox="0 0 100 28" preserveAspectRatio="none">
			<polyline points={points} fill="none" stroke={props.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
		</svg>
	);
}

Sparkline.defaultProps = {
	values: [],
	color: '#b39ddb',
};

function Stat(props) {
	const classes = useStyles();

	return (
		<div className={classes.stat}>
			<Typography variant="body2" className={classes.statValue} style={props.color ? { color: props.color } : {}}>
				{props.children}
			</Typography>
			<Typography variant="body2" className={classes.statLabel}>
				{props.label}
			</Typography>
		</div>
	);
}

function StateChip(props) {
	const { i18n } = useLingui();
	const p = props.progress;

	let label = i18n._(t`Stopped`);
	let color = '#9e9e9e';

	if (p && p.order === 'start') {
		switch (p.state) {
			case 'connected':
				label = i18n._(t`Receiving input`);
				color = '#b39ddb';
				break;
			case 'connecting':
				label = i18n._(t`Waiting for input`);
				color = '#ffa726';
				break;
			case 'error':
				label = p.reconnect > 0 ? i18n._(t`Error, retry in ${p.reconnect}s`) : i18n._(t`Error`);
				color = '#f44336';
				break;
			case 'disconnected':
				label = p.reconnect > 0 ? i18n._(t`Reconnecting in ${p.reconnect}s`) : i18n._(t`Disconnected`);
				color = '#f44336';
				break;
			default:
				label = i18n._(t`Connecting`);
				color = '#ffa726';
				break;
		}
	}

	return <Chip size="small" label={label} style={{ backgroundColor: color, color: '#000' }} />;
}

function ChannelSummary(props) {
	const classes = useStyles();
	const { i18n } = useLingui();
	const d = props.data;
	const p = d.progress;
	const samples = d.samples;
	const s = A.stability(samples, d.report);

	const ratingLabels = {
		good: i18n._(t`Stable`),
		fair: i18n._(t`Some issues`),
		poor: i18n._(t`Unstable`),
		unknown: i18n._(t`No data yet`),
	};

	const reasonLabels = {
		restarts: i18n._(t`restarts`),
		bitrate: i18n._(t`bitrate jumps`),
		speed: i18n._(t`not real-time`),
		drops: i18n._(t`dropped frames`),
	};

	const live = d.egresses.filter((e) => e.progress.order === 'start' && e.progress.state === 'connected');
	const failing = d.egresses.filter(
		(e) => e.progress.order === 'start' && (e.progress.state === 'error' || (e.progress.state === 'disconnected' && e.progress.reconnect >= 0)),
	);
	const connected = p && p.state === 'connected';

	return (
		<div className={classes.card} style={props.color ? { borderLeft: `3px solid ${props.color}` } : {}}>
			<Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
				<Typography variant="body2" noWrap fontWeight={600}>
					{props.label}
				</Typography>
				<StateChip progress={p} />
			</Stack>
			{p && p.state === 'error' && p.error && (
				<Typography variant="body2" style={{ color: levelColors.error, marginTop: '.4em' }}>
					{(A.explain(p.error) || { title: anonymize(p.error) }).title}
				</Typography>
			)}
			<Stack direction="row" spacing={1} marginTop=".6em">
				<Stat label={<Trans>Uptime</Trans>}>{connected ? <Duration seconds={p.time} /> : '–'}</Stat>
				<Stat label="kbit/s">{connected ? <Number value={p.bitrate} /> : '–'}</Stat>
				<Stat label="FPS">{connected ? <Number value={p.fps} digits={1} /> : '–'}</Stat>
				<Stat label={<Trans>Speed</Trans>} color={connected && (p.speed < 0.97 || p.speed > 1.03) ? levelColors.warning : null}>
					{connected ? (
						<React.Fragment>
							<Number value={p.speed} digits={2} minDigits={2} />x
						</React.Fragment>
					) : (
						'–'
					)}
				</Stat>
			</Stack>
			<Stack direction="row" spacing={1} marginTop=".6em" alignItems="center">
				<Typography variant="body2" className={classes.stat}>
					<Trans>Publications</Trans>
				</Typography>
				<Typography variant="body2" style={{ color: live.length ? '#4caf50' : undefined }}>
					<Trans>{live.length} live</Trans>
				</Typography>
				{failing.length !== 0 && (
					<Typography variant="body2" style={{ color: levelColors.error }}>
						· <Trans>{failing.length} failing</Trans>
					</Typography>
				)}
			</Stack>
			{failing.length !== 0 && (
				<Typography variant="body2" className={classes.eventMeta} style={{ color: levelColors.error }}>
					{failing.map((e) => e.label).join(', ')}
				</Typography>
			)}
			<Stack direction="row" spacing={1} marginTop=".6em" alignItems="center" justifyContent="space-between">
				<Typography variant="body2">
					<Trans>Input stability</Trans>
				</Typography>
				<Chip
					size="small"
					label={ratingLabels[s.rating]}
					style={{ backgroundColor: ratingColors[s.rating], color: '#000' }}
					title={s.reasons.map((r) => reasonLabels[r]).join(', ')}
				/>
			</Stack>
			<Stack direction="row" spacing={1} marginTop=".4em">
				<div className={classes.stat}>
					<Sparkline values={samples.map((x) => x.bitrate)} color="#b39ddb" />
					<Typography variant="body2" className={classes.statLabel}>
						<Trans>Bitrate, last 5 min</Trans>
					</Typography>
				</div>
				<div className={classes.stat}>
					<Sparkline values={samples.map((x) => x.fps)} color="#4fc3f7" />
					<Typography variant="body2" className={classes.statLabel}>
						<Trans>FPS, last 5 min</Trans>
					</Typography>
				</div>
			</Stack>
			<Stack direction="row" spacing={1} marginTop=".4em">
				<Stat label={<Trans>Restarts (1h)</Trans>} color={s.restarts ? levelColors.warning : null}>
					{s.restarts}
				</Stat>
				<Stat label={<Trans>Dropped frames</Trans>} color={s.dropRate > 0.005 ? levelColors.warning : null}>
					<Number value={s.dropRate * 100} digits={2} />%
				</Stat>
				<Stat label={<Trans>Bitrate variation</Trans>} color={s.bitrateVariation > 0.25 ? levelColors.warning : null}>
					<Number value={s.bitrateVariation * 100} digits={0} />%
				</Stat>
			</Stack>
			<Stack direction="row" marginTop=".5em">
				<Link href="#!" color="textSecondary" className={classes.link} onClick={props.onRawLog}>
					<Trans>Raw process log</Trans>
				</Link>
				<Link href="#!" color="textSecondary" className={classes.link} onClick={props.onReport}>
					<Trans>Process report</Trans>
				</Link>
			</Stack>
		</div>
	);
}

function EventIcon(props) {
	const classes = useStyles();
	const e = props.event;
	const style = { color: levelColors[e.level] || levelColors.info };

	if (e.type === 'start') {
		return <PlayArrowIcon className={classes.eventIcon} style={{ color: '#4caf50' }} />;
	} else if (e.type === 'restart') {
		return <ReplayIcon className={classes.eventIcon} style={{ color: levelColors.warning }} />;
	} else if (e.type === 'stop') {
		return <StopIcon className={classes.eventIcon} style={style} />;
	} else if (e.level === 'error') {
		return <ErrorOutlineIcon className={classes.eventIcon} style={style} />;
	} else if (e.level === 'warning') {
		return <WarningAmberIcon className={classes.eventIcon} style={style} />;
	}

	return <InfoOutlinedIcon className={classes.eventIcon} style={style} />;
}

function Event(props) {
	const classes = useStyles();
	const { i18n } = useLingui();
	const [$open, setOpen] = React.useState(false);
	const e = props.event;

	const messages = {
		start: i18n._(t`Started`),
		restart: i18n._(t`Restarted`),
		stop: i18n._(t`Stopped`),
	};

	const text = e.type === 'log' ? e.message : e.reason || '';
	const explanation = text ? A.explain(text) : null;

	let title = messages[e.type] || (explanation ? explanation.title : e.message);
	if (e.type === 'stop' && text) {
		title = `${messages.stop}: ${explanation ? explanation.title : text}`;
	}

	return (
		<div className={classes.event} onClick={() => setOpen(!$open)}>
			<Stack direction="row" spacing={1} alignItems="flex-start">
				<EventIcon event={e} />
				<div style={{ minWidth: 0, flex: 1 }}>
					<Typography variant="body2" className={classes.eventMessage}>
						{title}
						{e.count > 1 && <span style={{ opacity: 0.7 }}> ×{e.count}</span>}
					</Typography>
					<Typography variant="body2" className={classes.eventMeta}>
						{formatTime(e.time)}
						{props.showSource && e.source ? ` · ${e.source}` : ''}
					</Typography>
					<Collapse in={$open}>
						{explanation && <Typography variant="body2">{explanation.tip}</Typography>}
						{e.type === 'stop' && (
							<Typography variant="body2">
								<Trans>It is restarted automatically.</Trans>
							</Typography>
						)}
						{e.count > 1 && (
							<Typography variant="body2" className={classes.eventMeta}>
								<Trans>
									{e.count} times, first at {formatTime(e.first)}
								</Trans>
							</Typography>
						)}
						{(e.raw || text) && <Typography className={classes.raw}>{e.raw || text}</Typography>}
					</Collapse>
				</div>
			</Stack>
		</div>
	);
}

export default function ActivityLog(props) {
	const classes = useStyles();
	const { i18n } = useLingui();
	const data = React.useRef({});
	const [$data, setData] = React.useState({});
	const [$filter, setFilter] = React.useState('all');
	const [$raw, setRaw] = React.useState({ open: false, channelid: '', logdata: { prelude: [], log: [] } });
	const [$report, setReport] = React.useState({ open: false, data: '' });

	const channelids = props.channels.map((c) => c.channelid).join(',');

	const entry = (channelid) => {
		if (!data.current[channelid]) {
			data.current[channelid] = { progress: null, samples: [], report: null, egresses: [], egressReports: {} };
		}

		return data.current[channelid];
	};

	const updateProgress = async () => {
		for (let c of props.channels) {
			const progress = await props.restreamer.GetIngestProgress(c.channelid);
			const d = entry(c.channelid);
			d.progress = progress;

			if (progress.state === 'connected') {
				d.samples.push({
					time: Date.now(),
					bitrate: progress.bitrate,
					fps: progress.fps,
					speed: progress.speed,
					frames: progress.frames,
					drop: progress.drop,
				});

				if (d.samples.length > MAX_SAMPLES) {
					d.samples.splice(0, d.samples.length - MAX_SAMPLES);
				}
			}
		}

		setData({ ...data.current });
	};

	const updateLogs = async () => {
		for (let c of props.channels) {
			const d = entry(c.channelid);
			d.report = await props.restreamer.GetIngestLog(c.channelid);

			const list = await props.restreamer.ListIngestEgresses(c.channelid);
			d.egresses = list
				.filter((e) => e.service !== 'player')
				.map((e) => {
					const service = Services.Get(e.service);
					return { id: e.id, label: e.name || (service ? service.name : e.service), progress: e.progress };
				});

			const reports = {};
			for (let e of d.egresses) {
				if (e.progress.order === 'start') {
					reports[e.id] = await props.restreamer.GetEgressLog(c.channelid, e.id);
				}
			}
			d.egressReports = reports;
		}

		setData({ ...data.current });
	};

	React.useEffect(() => {
		(async () => {
			await updateProgress();
			await updateLogs();
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channelids]);

	useInterval(updateProgress, 2000);
	useInterval(updateLogs, 10000);

	const handleRawLog = (channelid) => async (event) => {
		event.preventDefault();
		const logdata = await props.restreamer.GetIngestLog(channelid);
		setRaw({ open: true, channelid: channelid, logdata: logdata || { prelude: [], log: [] } });
	};

	const handleReport = (channelid) => async (event) => {
		event.preventDefault();
		const debug = await props.restreamer.GetIngestDebug(channelid);
		setReport({ open: true, data: JSON.stringify(debug, null, 2) });
	};

	const multiple = props.channels.length > 1;

	const events = A.mergeEvents(
		props.channels.map((c) => {
			const d = $data[c.channelid];
			if (!d) {
				return [];
			}

			const running = (p) => p !== null && (p.state === 'connected' || p.state === 'connecting');

			const lists = [A.buildEvents(d.report, multiple ? c.label : '', 'channel', running(d.progress))];
			for (let e of d.egresses) {
				const label = multiple ? `${c.label} → ${e.label}` : e.label;
				lists.push(A.buildEvents(d.egressReports[e.id], label, 'publication', running(e.progress)));
			}

			return A.mergeEvents(lists);
		}),
	).filter((e) => {
		if ($filter === 'problems') {
			return e.level === 'error' || e.level === 'warning' || e.type === 'restart';
		} else if ($filter === 'publications') {
			return e.kind === 'publication';
		}

		return true;
	});

	return (
		<div>
			{props.channels.map((c) => {
				const d = $data[c.channelid];
				if (!d) {
					return null;
				}

				return (
					<ChannelSummary
						key={c.channelid}
						label={c.label}
						color={multiple ? c.color : null}
						data={d}
						onRawLog={handleRawLog(c.channelid)}
						onReport={handleReport(c.channelid)}
					/>
				);
			})}
			<Divider />
			<Typography variant="body2" className={classes.section}>
				<Trans>Events</Trans>
			</Typography>
			<Stack direction="row" spacing={0.5} marginBottom=".4em" flexWrap="wrap" useFlexGap>
				<Chip size="small" label={i18n._(t`All`)} variant={$filter === 'all' ? 'filled' : 'outlined'} onClick={() => setFilter('all')} />
				<Chip size="small" label={i18n._(t`Problems`)} variant={$filter === 'problems' ? 'filled' : 'outlined'} onClick={() => setFilter('problems')} />
				<Chip
					size="small"
					label={i18n._(t`Publications`)}
					variant={$filter === 'publications' ? 'filled' : 'outlined'}
					onClick={() => setFilter('publications')}
				/>
			</Stack>
			<div className={classes.events}>
				{events.length === 0 && (
					<Typography variant="body2" style={{ opacity: 0.7 }}>
						<Trans>Nothing to show yet.</Trans>
					</Typography>
				)}
				{events.map((e) => (
					<Event key={e.id} event={e} showSource={multiple || e.kind === 'publication'} />
				))}
			</div>
			<ProcessModal
				open={$raw.open}
				onClose={() => setRaw({ ...$raw, open: false })}
				title={<Trans>Process details</Trans>}
				progress={$data[$raw.channelid] ? $data[$raw.channelid].progress : null}
				logdata={$raw.logdata}
			/>
			<DebugModal open={$report.open} onClose={() => setReport({ ...$report, open: false })} title={<Trans>Process report</Trans>} data={$report.data} />
		</div>
	);
}

ActivityLog.defaultProps = {
	restreamer: null,
	channels: [],
};
