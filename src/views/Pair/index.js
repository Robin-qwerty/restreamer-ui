import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Trans } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';

import ChannelPanel from '../Main/ChannelPanel';
import Paper from '../../misc/Paper';
import Publication from '../Main/Publication';

const useStyles = makeStyles((theme) => ({
	gridContainerL1: {
		marginBottom: '6em',
	},
}));

// Two channels side by side (e.g. a horizontal channel and the vertical channel composed from it),
// each with its own player, stats and publications.
export default function Pair(props) {
	const classes = useStyles();
	const navigate = useNavigate();
	const { a: _a, b: _b } = useParams();

	React.useEffect(() => {
		if (props.restreamer.GetChannel(_a) === null || props.restreamer.GetChannel(_b) === null) {
			navigate('/', { replace: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [_a, _b]);

	const handleEdit = (channelid) => (metadata) => {
		props.restreamer.SelectChannel(channelid);

		if (metadata.layout) {
			navigate(`/${channelid}/layout`);
		} else {
			navigate(`/${channelid}/edit`);
		}
	};

	const unconfigured = (
		<Paper>
			<Typography>
				<Trans>This channel is not configured yet.</Trans>
			</Typography>
		</Paper>
	);

	const column = (channelid) => (
		<Grid item xs={12} md={6} key={channelid}>
			<ChannelPanel
				restreamer={props.restreamer}
				channelid={channelid}
				unconfigured={unconfigured}
				onEdit={handleEdit(channelid)}
				onInvalid={() => navigate('/', { replace: true })}
			/>
			<Publication restreamer={props.restreamer} channelid={channelid} />
		</Grid>
	);

	return (
		<Grid container justifyContent="center" spacing={1} className={classes.gridContainerL1}>
			{column(_a)}
			{column(_b)}
		</Grid>
	);
}

Pair.defaultProps = {
	restreamer: null,
};
