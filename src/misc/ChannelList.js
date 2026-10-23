import React from 'react';

import { useLingui } from '@lingui/react';
import { Trans, t } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CloseIcon from '@mui/icons-material/Close';
import Drawer from '@mui/material/Drawer';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LensIcon from '@mui/icons-material/Lens';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import WarningIcon from '@mui/icons-material/Warning';

import { ORDER, sortChannels } from '../utils/channelStatus';
import useInterval from '../hooks/useInterval';
import Dialog from './modals/Dialog';

// the buttons in the top right corner (Header.js)
const HEADER_HEIGHT = 72;
const FOOTER_HEIGHT = 60;
const PANEL_WIDTH = 320;
const PANEL_PADDING = 16;
const GROUP_HEIGHT = 30;
const TOOLBAR_HEIGHT = 56;

const STATUS_COLORS = {
	live: '#4caf50',
	receiving: '#b39ddb',
	error: '#f44336',
	inactive: '#9e9e9e',
};

const useStyles = makeStyles((theme) => ({
	paper: {
		boxSizing: 'border-box',
		padding: `0 ${PANEL_PADDING}px ${PANEL_PADDING}px ${PANEL_PADDING}px`,
		backgroundColor: theme.palette.background.paper,
		boxShadow: '-12px 0px 14px -10px rgb(0 0 0 / 35%)',
		overflowY: 'auto',
	},
	toolbar: {
		position: 'sticky',
		top: 0,
		zIndex: 2,
		height: TOOLBAR_HEIGHT,
		backgroundColor: theme.palette.background.paper,
	},
	grid: {
		display: 'grid',
		gap: 10,
	},
	group: {
		gridColumn: '1 / -1',
		height: GROUP_HEIGHT - 10,
		display: 'flex',
		alignItems: 'flex-end',
		textTransform: 'uppercase',
		letterSpacing: '.05em',
		fontSize: '.7rem!important',
		opacity: 0.7,
	},
	tile: {
		display: 'block!important',
		width: '100%',
		textAlign: 'left!important',
		borderRadius: 4,
		'&:hover .thumb, &.Mui-focusVisible .thumb': {
			opacity: 0.8,
		},
	},
	thumb: {
		position: 'relative',
		width: '100%',
		paddingTop: '56.25%',
		borderRadius: 4,
		overflow: 'hidden',
		boxSizing: 'border-box',
		border: `2px solid ${theme.palette.primary.dark}`,
		backgroundColor: theme.palette.grey[800],
	},
	thumbCurrent: {
		borderColor: theme.palette.primary.light,
	},
	thumbImage: {
		position: 'absolute',
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
		objectFit: 'cover',
	},
	thumbOffline: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		color: theme.palette.grey[400],
		backgroundColor: theme.palette.grey[700],
	},
	title: {
		paddingTop: 4,
		minHeight: 24,
	},
	titleText: {
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	dot: {
		position: 'relative',
		display: 'inline-flex',
		flexShrink: 0,
	},
	dotWarning: {
		position: 'absolute',
		right: -6,
		bottom: -4,
		fontSize: '.85rem!important',
		color: STATUS_COLORS.error,
		filter: 'drop-shadow(0 0 1px black)',
	},
	pulse: {
		animation: '$pulse 1.2s ease-in-out infinite',
	},
	'@keyframes pulse': {
		'0%': { opacity: 1 },
		'50%': { opacity: 0.3 },
		'100%': { opacity: 1 },
	},
}));

// Show a new snapshot only once it is loaded, so refreshing does not flicker
function Thumbnail(props) {
	const classes = useStyles();
	const [$src, setSrc] = React.useState('');
	const [$failed, setFailed] = React.useState(false);

	React.useEffect(() => {
		if (props.src.length === 0) {
			return;
		}

		let cancelled = false;
		const img = new Image();
		img.onload = () => {
			if (!cancelled) {
				setSrc(props.src);
				setFailed(false);
			}
		};
		img.onerror = () => {
			if (!cancelled) {
				setFailed(true);
			}
		};
		img.src = props.src;

		return () => {
			cancelled = true;
		};
	}, [props.src]);

	if (props.src.length === 0 || ($failed && $src.length === 0)) {
		return (
			<div className={classes.thumbOffline}>
				<LinkOffIcon fontSize={props.small ? 'small' : 'large'} />
				{!props.small && (
					<Typography variant="body2" color="inherit">
						<Trans>No input</Trans>
					</Typography>
				)}
			</div>
		);
	}

	if ($src.length === 0) {
		return null;
	}

	return <img className={classes.thumbImage} src={$src} alt="" />;
}

Thumbnail.defaultProps = {
	src: '',
	small: false,
};

function StatusDot(props) {
	const classes = useStyles();
	const { i18n } = useLingui();
	const status = props.status;

	let text = i18n._(t`Inactive`);
	if (status) {
		switch (status.reason) {
			case 'live':
				text = i18n._(t`Live on ${status.live} of ${status.total} publications`);
				if (status.warning) {
					text += ' · ' + i18n._(t`${status.failing} failing`);
				}
				break;
			case 'receiving':
				text = i18n._(t`Receiving input, not published`);
				break;
			case 'publication':
				text = i18n._(t`Receiving input, publication failing`);
				break;
			case 'input':
				text = i18n._(t`Input lost`);
				break;
			case 'connecting':
				text = i18n._(t`Waiting for input`);
				break;
			default:
				break;
		}
	}

	const color = STATUS_COLORS[status ? status.status : 'inactive'];

	return (
		<Tooltip title={text} placement="left">
			<span className={classes.dot}>
				<LensIcon
					fontSize="small"
					style={{ color: color }}
					className={status && status.reason === 'connecting' ? classes.pulse : ''}
					aria-label={text}
				/>
				{status && status.warning && <WarningIcon className={classes.dotWarning} />}
			</span>
		</Tooltip>
	);
}

function ChannelTile(props) {
	const classes = useStyles();
	const status = props.status;

	// the input is there, so the snapshot is up to date
	const receiving = status && (status.status === 'live' || status.status === 'receiving' || status.reason === 'publication');

	return (
		<ButtonBase focusRipple className={classes.tile} onClick={props.onClick} title={props.channel.name}>
			<div className={`thumb ${classes.thumb} ${props.current ? classes.thumbCurrent : ''}`}>
				<Thumbnail src={receiving ? `${props.channel.thumbnail}?t=${props.tick}` : ''} small={props.small} />
			</div>
			<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} className={classes.title}>
				<Typography variant="body2" color="inherit" className={classes.titleText} fontWeight={props.current ? 600 : 400}>
					{props.channel.name}
				</Typography>
				<StatusDot status={status} />
			</Stack>
		</ButtonBase>
	);
}

// 1 column while all channels fit the height of the panel, otherwise 2 smaller columns
const compactColumns = (nChannels, nGroups, height) => {
	const tileWidth = PANEL_WIDTH - 2 * PANEL_PADDING;
	const tileHeight = (tileWidth * 9) / 16 + 28 + 10;
	const needed = TOOLBAR_HEIGHT + nGroups * GROUP_HEIGHT + nChannels * tileHeight;

	return needed <= height ? 1 : 2;
};

export default function ChannelList(props) {
	const classes = useStyles();
	const { i18n } = useLingui();
	const [$large, setLarge] = React.useState(false);
	const [$data, setData] = React.useState({
		channels: props.channels,
		status: {},
	});
	const [$tick, setTick] = React.useState(Math.floor(Date.now() / 60000));
	const [$height, setHeight] = React.useState(window.innerHeight);
	const [$addChannel, setAddChannel] = React.useState({
		open: false,
		name: '',
	});

	const update = async () => {
		const data = await props.onStatus();
		if (data) {
			setData(data);
		}
	};

	React.useEffect(() => {
		if (props.open) {
			setTick(Math.floor(Date.now() / 60000));
			update();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.open]);

	useInterval(update, props.open ? 5000 : null);

	// new snapshots are taken every minute (the default snapshot interval)
	useInterval(() => setTick(Math.floor(Date.now() / 60000)), props.open ? 60000 : null);

	// Let the page content make room for the panel (see MainContent in RestreamerUI.js)
	React.useEffect(() => {
		document.documentElement.style.setProperty('--channels-width', props.open && !$large ? `${PANEL_WIDTH}px` : '0px');
	}, [props.open, $large]);

	React.useEffect(() => {
		const handleResize = () => setHeight(window.innerHeight);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	const handleAddChannelDialog = () => {
		setAddChannel({
			...$addChannel,
			open: !$addChannel.open,
			name: '',
		});
	};

	const handleAddChannelChange = (event) => {
		setAddChannel({
			...$addChannel,
			name: event.target.value,
		});
	};

	const handleClick = (channelid) => () => {
		props.onClick(channelid);
		if ($large) {
			props.onClose();
		}
	};

	const channels = sortChannels($data.channels, $data.status);

	const groupNames = {
		live: i18n._(t`Live`),
		receiving: i18n._(t`Receiving`),
		error: i18n._(t`Problems`),
		inactive: i18n._(t`Inactive`),
	};

	const groups = ORDER.map((name) => ({
		name: name,
		channels: channels.filter((c) => ($data.status[c.channelid] ? $data.status[c.channelid].status : 'inactive') === name),
	})).filter((g) => g.channels.length !== 0);

	const columns = $large ? 0 : compactColumns(channels.length, groups.length, $height - HEADER_HEIGHT - FOOTER_HEIGHT);

	const paperStyle = $large
		? { top: 0, height: '100vh', width: '100%', paddingLeft: 50, paddingRight: 50, backgroundColor: 'rgb(48, 46, 47)' }
		: { top: HEADER_HEIGHT, height: `calc(100vh - ${HEADER_HEIGHT + FOOTER_HEIGHT}px)`, width: PANEL_WIDTH };

	const gridStyle = {
		gridTemplateColumns: $large ? 'repeat(auto-fill, minmax(220px, 1fr))' : `repeat(${columns}, minmax(0, 1fr))`,
	};

	return (
		<React.Fragment>
			<Drawer anchor="right" variant="persistent" open={props.open} classes={{ paper: classes.paper }} PaperProps={{ style: paperStyle }}>
				<Stack direction="row" alignItems="center" justifyContent="space-between" className={classes.toolbar}>
					<Typography variant="h2">
						<Trans>Channels</Trans>
					</Typography>
					<Stack direction="row" spacing={0}>
						<IconButton color="inherit" size="small" onClick={handleAddChannelDialog} title={i18n._(t`Add channel`)}>
							<AddIcon />
						</IconButton>
						<IconButton color="inherit" size="small" onClick={() => setLarge(!$large)} title={i18n._(t`Show all channels`)}>
							{$large ? <FullscreenExitIcon /> : <FullscreenIcon />}
						</IconButton>
						<IconButton color="inherit" size="small" onClick={props.onClose}>
							<CloseIcon />
						</IconButton>
					</Stack>
				</Stack>
				<div className={classes.grid} style={gridStyle}>
					{groups.map((group) => (
						<React.Fragment key={group.name}>
							<Typography variant="body2" className={classes.group}>
								{groupNames[group.name]} ({group.channels.length})
							</Typography>
							{group.channels.map((channel) => (
								<ChannelTile
									key={channel.channelid}
									channel={channel}
									status={$data.status[channel.channelid]}
									current={channel.channelid === props.channelid}
									small={columns === 2}
									tick={$tick}
									onClick={handleClick(channel.channelid)}
								/>
							))}
						</React.Fragment>
					))}
				</div>
			</Drawer>
			<Dialog
				open={$addChannel.open}
				onClose={handleAddChannelDialog}
				title={<Trans>Add new channel</Trans>}
				buttonsLeft={
					<Button variant="outlined" color="default" onClick={handleAddChannelDialog}>
						<Trans>Abort</Trans>
					</Button>
				}
				buttonsRight={
					<Button
						variant="outlined"
						color="primary"
						disabled={$addChannel.name.length === 0}
						onClick={() => {
							handleAddChannelDialog();
							props.onAdd($addChannel.name);
						}}
					>
						<Trans>Add</Trans>
					</Button>
				}
			>
				<Grid container spacing={2}>
					<Grid item xs={12}>
						<Typography>
							<Trans>Enter a name for the new channel.</Trans>
						</Typography>
					</Grid>
					<Grid item xs={12}>
						<TextField variant="outlined" fullWidth label={<Trans>Name</Trans>} value={$addChannel.name} onChange={handleAddChannelChange} />
					</Grid>
				</Grid>
			</Dialog>
		</React.Fragment>
	);
}

ChannelList.defaultProps = {
	open: false,
	channelid: '',
	channels: [],
	onClose: () => {},
	onClick: (channelid) => {},
	onAdd: (name) => {},
	onStatus: async () => null,
};

export { compactColumns };
