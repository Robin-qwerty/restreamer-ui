import React from 'react';

import { useLingui } from '@lingui/react';
import { Trans, t } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import ListAltIcon from '@mui/icons-material/ListAlt';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import * as Storage from '../../utils/storage';
import ActivityLog from './ActivityLog';

const HEADER_HEIGHT = 132;
const FOOTER_HEIGHT = 60;
const COLUMN_WIDTH = 340;
const PADDING = 16;

const useStyles = makeStyles((theme) => ({
	paper: {
		boxSizing: 'border-box',
		top: `${HEADER_HEIGHT}px!important`,
		height: `calc(100vh - ${HEADER_HEIGHT + FOOTER_HEIGHT}px)!important`,
		padding: `0 ${PADDING}px ${PADDING}px ${PADDING}px`,
		backgroundColor: theme.palette.background.paper,
		boxShadow: '12px 0px 14px -10px rgb(0 0 0 / 35%)',
		overflowY: 'auto',
	},
	toolbar: {
		position: 'sticky',
		top: 0,
		zIndex: 2,
		paddingTop: 8,
		paddingBottom: 8,
		backgroundColor: theme.palette.background.paper,
	},
	tab: {
		position: 'fixed',
		left: 0,
		top: '40%',
		zIndex: theme.zIndex.drawer - 1,
		padding: '12px 6px',
		borderRadius: '0 6px 6px 0',
		cursor: 'pointer',
		writingMode: 'vertical-rl',
		transform: 'rotate(180deg)',
		backgroundColor: theme.palette.background.paper,
		boxShadow: '4px 0px 10px rgb(0 0 0 / 35%)',
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		border: 'none',
		color: 'inherit',
		font: 'inherit',
	},
	toggle: {
		'& .MuiToggleButton-root': {
			padding: '2px 8px',
			fontSize: '.75rem',
			textTransform: 'none',
		},
	},
}));

const storageKey = (pair) => (pair ? 'activity:pair' : 'activity:channel');

const loadSettings = (pair) => {
	let settings = {
		open: window.innerWidth >= 1280,
		mode: 'combined',
	};

	try {
		const stored = JSON.parse(Storage.Get(storageKey(pair)) || 'null');
		if (stored) {
			settings = { ...settings, ...stored };
		}
	} catch (e) {}

	return settings;
};

// Foldable activity log on the left side. With two channels (the dual page) it can show
// one combined log (default), both logs next to each other, or only one of the channels.
export default function ActivityPanel(props) {
	const classes = useStyles();
	const { i18n } = useLingui();
	const pair = props.channels.length > 1;
	const [$settings, setSettings] = React.useState(() => loadSettings(pair));

	const mode = pair ? $settings.mode : 'combined';
	const width = (mode === 'both' ? 2 * COLUMN_WIDTH : COLUMN_WIDTH) + 2 * PADDING;

	// Let the page content make room for the panel (see MainContent in RestreamerUI.js)
	React.useEffect(() => {
		document.documentElement.style.setProperty('--activity-width', $settings.open ? `${width}px` : '0px');
	}, [$settings.open, width]);

	React.useEffect(() => {
		return () => document.documentElement.style.setProperty('--activity-width', '0px');
	}, []);

	const update = (change) => {
		const settings = { ...$settings, ...change };
		setSettings(settings);

		try {
			Storage.Set(storageKey(pair), JSON.stringify(settings));
		} catch (e) {}
	};

	const handleMode = (event, value) => {
		if (value !== null) {
			update({ mode: value });
		}
	};

	let content = null;
	if (mode === 'both') {
		content = (
			<Stack direction="row" spacing={2}>
				{props.channels.map((c) => (
					<div key={c.channelid} style={{ width: COLUMN_WIDTH, flexShrink: 0 }}>
						<ActivityLog restreamer={props.restreamer} channels={[c]} />
					</div>
				))}
			</Stack>
		);
	} else {
		const channels = mode === 'combined' ? props.channels : props.channels.filter((c) => c.channelid === mode);
		content = <ActivityLog key={mode} restreamer={props.restreamer} channels={channels.length ? channels : props.channels} />;
	}

	return (
		<React.Fragment>
			{!$settings.open && (
				<button className={classes.tab} onClick={() => update({ open: true })} title={i18n._(t`Show activity`)}>
					<ListAltIcon fontSize="small" style={{ transform: 'rotate(90deg)' }} />
					<Trans>Activity</Trans>
				</button>
			)}
			<Drawer anchor="left" variant="persistent" open={$settings.open} classes={{ paper: classes.paper }} PaperProps={{ style: { width: width } }}>
				<div className={classes.toolbar}>
					<Stack direction="row" justifyContent="space-between" alignItems="center">
						<Typography variant="h2">
							<Trans>Activity</Trans>
						</Typography>
						<IconButton size="small" color="inherit" onClick={() => update({ open: false })} title={i18n._(t`Hide activity`)}>
							<ChevronLeftIcon />
						</IconButton>
					</Stack>
					{pair && (
						<ToggleButtonGroup size="small" exclusive value={mode} onChange={handleMode} className={classes.toggle}>
							<ToggleButton value="combined">
								<Trans>Combined</Trans>
							</ToggleButton>
							<ToggleButton value="both">
								<Trans>Side by side</Trans>
							</ToggleButton>
							{props.channels.map((c) => (
								<ToggleButton key={c.channelid} value={c.channelid} style={{ maxWidth: 110 }}>
									<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
								</ToggleButton>
							))}
						</ToggleButtonGroup>
					)}
				</div>
				{content}
			</Drawer>
		</React.Fragment>
	);
}

ActivityPanel.defaultProps = {
	restreamer: null,
	channels: [],
};
