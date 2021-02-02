// Shure-DIS-CCU

var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.prototype.Variables = [];
instance.prototype.SeatStates = [];

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;
	self.init_tcp();
}

instance.prototype.init = function() {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.init_tcp();
	self.initFeedbacks();
	self.initPresets();
}

instance.prototype.init_tcp = function() {
	var self = this;
	var receivebuffer = '';

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	}

	if (self.config.port === undefined) {
		self.config.port = 3142;
	}

	if (self.config.host) {
		self.socket = new tcp(self.config.host, self.config.port);

		self.socket.on('status_change', function (status, message) {
			self.status(status, message);
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
		});

		self.socket.on('connect', function () {
			debug("Connected");
			self.socket.send('mic_status' + '\r\n'); //gets initial data from the system
		});

		// if we get any data, display it to stdout
		self.socket.on("data", function(chunk) {
			var i = 0, line = '', offset = 0;
				receivebuffer += chunk;

				while ( (i = receivebuffer.indexOf('\n', offset)) !== -1) {
					line = receivebuffer.substr(offset, i - offset);
					offset = i + 1;
					self.socket.emit('receiveline', line.toString());
				}

				receivebuffer = receivebuffer.substr(offset);
		});

		self.socket.on('receiveline', function(line) {
			//process each received line for variables and feedback
			console.log('***COMMAND RECEIVED:***');
			console.log(line);
			try {
				if (line.indexOf('seat_state ') > -1) {
					let seatNumber = '';
					let seatState = '';
					let seatName = '';
					
					line = line.replace('seat_state ', '');
					
					seatNumber = line.substring(0, line.indexOf(' '));

					if (line.indexOf(' active ') > -1) {
						seatState = 'active';
					}
					else {
						seatState = 'passive';
					}
					
					seatName = line.substring(seatNumber.length + seatState.length + 2);

					let foundSeatStateVariable = false;
					let foundSeatNameVariable = false;
					for (let i = 0; i < self.Variables.length; i++) {
						if (self.Variables[i].name === 'seat_' + seatNumber + '_state') {
							foundSeatStateVariable = true;
						}
						if (self.Variables[i].name === 'seat_' + seatNumber + '_name') {
							foundSeatNameVariable = true;
						}
					}

					if (!foundSeatStateVariable) {
						let variableObj = {};
						variableObj.name = 'seat_' + seatNumber + '_state';
						variableObj.label = 'Seat ' + seatNumber + ' State';
						self.Variables.push(variableObj);
					}

					if (!foundSeatNameVariable) {
						let variableObj = {};
						variableObj.name = 'seat_' + seatNumber + '_name';
						variableObj.label = 'Seat ' + seatNumber + ' Name';
						self.Variables.push(variableObj);
					}
					
					if ((!foundSeatStateVariable) || (!foundSeatNameVariable)) {
						//only set the variable definitions again if we added a new variable, this should cut down on unneccessary requests
						self.setVariableDefinitions(self.Variables);
					}
					
					self.setVariable('seat_' + seatNumber + '_state', seatState);
					self.setVariable('seat_' + seatNumber + '_name', seatName);

					let foundSeat = false;
					for (let i = 0; i < self.SeatStates.length; i++) {
						if (self.SeatStates[i].seat === seatNumber.toString()) {
							foundSeat = true;
							self.SeatStates[i].seatState = seatState;
							self.SeatStates[i].seatName = seatName;
							break;
						}
					}

					if (!foundSeat) {
						let seatObj = {};
						seatObj.seat = seatNumber.toString();
						seatObj.seatState = seatState;
						seatObj.seatName = seatName;
						seatObj.mic = false;
						seatObj.request = false;
						self.SeatStates.push(seatObj);
					}

					self.checkFeedbacks('seat_state');

					self.initPresets();
				}

				if (line.indexOf('mic_on ') > -1) {
					line = line.replace('mic_on ', '');

					let seatNumber = '';
					if (line.indexOf(' ') > -1) {
						seatNumber = line.substring(0, line.indexOf(' '));
					}
					else {
						seatNumber = line;
					}

					let foundSeatMicStatusVariable = false;
					for (let i = 0; i < self.Variables.length; i++) {
						if (self.Variables[i].name === 'seat_' + seatNumber + '_micstatus') {
							foundSeatMicStatusVariable = true;
							break;
						}
					}

					if (!foundSeatMicStatusVariable) {
						let variableObj = {};
						variableObj.name = 'seat_' + seatNumber + '_micstatus';
						variableObj.label = 'Seat ' + seatNumber + ' Mic Status';
						self.Variables.push(variableObj);
						self.setVariableDefinitions(self.Variables);
					}

					self.setVariable('seat_' + seatNumber + '_micstatus', 'On');

					let foundSeat = false;
					for (let i = 0; i < self.SeatStates.length; i++) {
						if (self.SeatStates[i].seat === seatNumber.toString()) {
							foundSeat = true;
							self.SeatStates[i].on = true;
							break;
						}
					}

					if (!foundSeat) {
						let seatObj = {};
						seatObj.seat = seatNumber.toString();
						seatObj.seatState = '';
						seatObj.seatName = '';
						seatObj.on = true;
						seatObj.request = false;
						self.SeatStates.push(seatObj);
					}

					self.checkFeedbacks('mic');
				}

				if (line.indexOf('mic_off ') > -1) {
					line = line.replace('mic_off ', '');

					let seatNumber = '';
					if (line.indexOf(' ') > -1) {
						seatNumber = line.substring(0, line.indexOf(' '));
					}
					else {
						seatNumber = line.replace('\r','').replace('\n','');
					}

					let foundSeatMicStatusVariable = false;
					for (let i = 0; i < self.Variables.length; i++) {
						if (self.Variables[i].name === 'seat_' + seatNumber + '_micstatus') {
							foundSeatMicStatusVariable = true;
							break;
						}
					}

					if (!foundSeatMicStatusVariable) {
						let variableObj = {};
						variableObj.name = 'seat_' + seatNumber + '_micstatus';
						variableObj.label = 'Seat ' + seatNumber + ' Mic Status';
						self.Variables.push(variableObj);
						self.setVariableDefinitions(self.Variables);
					}

					self.setVariable('seat_' + seatNumber + '_micstatus', 'Off');

					let foundSeat = false;
					for (let i = 0; i < self.SeatStates.length; i++) {
						if (self.SeatStates[i].seat === seatNumber.toString()) {
							foundSeat = true;
							self.SeatStates[i].on = false;
							break;
						}
					}

					if (!foundSeat) {
						let seatObj = {};
						seatObj.seat = seatNumber.toString();
						seatObj.seatState = '';
						seatObj.seatName = '';
						seatObj.on = false;
						seatObj.request = false;
						self.SeatStates.push(seatObj);
					}

					self.checkFeedbacks('mic');
				}

				if (line.indexOf('mic_request_on ') > -1) {
					line = line.replace('mic_request_on ', '');

					let seatNumber = '';
					if (line.indexOf(' ') > -1) {
						seatNumber = line.substring(0, line.indexOf(' '));
					}
					else {
						seatNumber = line.replace('\r','').replace('\n','');
					}

					let foundSeatMicStatusVariable = false;
					for (let i = 0; i < self.Variables.length; i++) {
						if (self.Variables[i].name === 'seat_' + seatNumber + '_micrequest') {
							foundSeatMicStatusVariable = true;
							break;
						}
					}

					if (!foundSeatMicStatusVariable) {
						let variableObj = {};
						variableObj.name = 'seat_' + seatNumber + '_micrequest';
						variableObj.label = 'Seat ' + seatNumber + ' Mic Request';
						self.Variables.push(variableObj);
						self.setVariableDefinitions(self.Variables);
					}

					self.setVariable('seat_' + seatNumber + '_micrequest', 'On');

					let foundSeat = false;
					for (let i = 0; i < self.SeatStates.length; i++) {
						if (self.SeatStates[i].seat.toString() === seatNumber.toString()) {
							foundSeat = true;
							self.SeatStates[i].request = true;
							break;
						}
					}

					if (!foundSeat) {
						let seatObj = {};
						seatObj.seat = seatNumber.toString();
						seatObj.seatState = '';
						seatObj.seatName = '';
						seatObj.mic = false;
						seatObj.request = true;
						self.SeatStates.push(seatObj);
					}

					self.checkFeedbacks('mic_request');
				}

				if (line.indexOf('mic_request_off ') > -1) {
					line = line.replace('mic_request_off ', '');

					let seatNumber = '';
					if (line.indexOf(' ') > -1) {
						seatNumber = line.substring(0, line.indexOf(' '));
					}
					else {
						seatNumber = line.replace('\r','').replace('\n','');
					}

					let foundSeatMicStatusVariable = false;
					for (let i = 0; i < self.Variables.length; i++) {
						if (self.Variables[i].name === 'seat_' + seatNumber + '_micrequest') {
							foundSeatMicStatusVariable = true;
							break;
						}
					}

					if (!foundSeatMicStatusVariable) {
						let variableObj = {};
						variableObj.name = 'seat_' + seatNumber + '_micrequest';
						variableObj.label = 'Seat ' + seatNumber + ' Mic Request';
						self.Variables.push(variableObj);
						self.setVariableDefinitions(self.Variables);
					}

					self.setVariable('seat_' + seatNumber + '_micrequest', 'Off');

					let foundSeat = false;
					for (let i = 0; i < self.SeatStates.length; i++) {
						if (self.SeatStates[i].seat.toString() === seatNumber.toString()) {
							foundSeat = true;
							self.SeatStates[i].request = false;
							break;
						}
					}

					if (!foundSeat) {
						let seatObj = {};
						seatObj.seat = seatNumber.toString();
						seatObj.seatState = '';
						seatObj.seatName = '';
						seatObj.mic = false;
						seatObj.request = false;
						self.SeatStates.push(seatObj);
					}

					self.checkFeedbacks('mic_request');
				}

				if (line.indexOf('command_error ') > -1) {
					line = line.replace('command_error ', '');
					self.log('error', line);
				}
			}
			catch(error) {
				console.log(error);
				self.log('warn', 'Error processing returned data.');
			}
		});

	}
};

// Set up Feedbacks
instance.prototype.initFeedbacks = function () {
	var self = this;

	// feedbacks
	var feedbacks = {};

	feedbacks['seat_state'] = {
		label: 'Change Button Color If Seat State Is Active Or Passive',
		description: 'If selected Seat Number\'s Mic is Active Or Passive, set the button to this color.',
		options: [
			{
				type: 'number',
				label: 'Seat Number',
				id: 'seat',
				tooltip: 'The seat number to monitor (between 1 and 65535)',
				min: 1,
				max: 65535,
				default: 1,
				required: true,
				range: false
			},
			{
				type: 'colorpicker',
				label: 'Foreground Color For Active',
				id: 'fg_active',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background Color For Active',
				id: 'bg_active',
				default: self.rgb(87, 87, 87)
			},
			{
				type: 'colorpicker',
				label: 'Foreground Color For Passive',
				id: 'fg_passive',
				default: self.rgb(0,0,0)
			},
			{
				type: 'colorpicker',
				label: 'Background Color For Passive',
				id: 'bg_passive',
				default: self.rgb(102, 0, 102)
			}
		]
	};

	feedbacks['mic_request'] = {
		label: 'Change Button Color If Mic is Requested',
		description: 'If selected Seat Number\'s Mic is Requested, set the button to this color.',
		options: [
			{
				type: 'number',
				label: 'Seat Number',
				id: 'seat',
				tooltip: 'The seat number to monitor (between 1 and 65535)',
				min: 1,
				max: 65535,
				default: 1,
				required: true,
				range: false
			},
			{
				type: 'colorpicker',
				label: 'Foreground Color',
				id: 'fg',
				default: self.rgb(0,0,0)
			},
			{
				type: 'colorpicker',
				label: 'Background Color',
				id: 'bg',
				default: self.rgb(255,255,255)
			}
		]
	};

	feedbacks['mic'] = {
		label: 'Change Button Color If Mic is On',
		description: 'If selected Seat Number\'s Mic is On, set the button to this color.',
		options: [
			{
				type: 'number',
				label: 'Seat Number',
				id: 'seat',
				tooltip: 'The seat number to monitor (between 1 and 65535)',
				min: 1,
				max: 65535,
				default: 1,
				required: true,
				range: false
			},
			{
				type: 'colorpicker',
				label: 'Foreground Color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background Color',
				id: 'bg',
				default: self.rgb(255,0,0)
			}
		]
	};

	self.setFeedbackDefinitions(feedbacks);
};

instance.prototype.feedback = function(feedback, bank) {
	var self = this;

	if (feedback.type === 'seat_state') {
		for (let i = 0; i < self.SeatStates.length; i++) {
			if (self.SeatStates[i].seat === feedback.options.seat.toString()) {
				if (self.SeatStates[i].seatState === 'active') {
					return { color: feedback.options.fg_active, bgcolor: feedback.options.bg_active };
				}
				else {
					return { color: feedback.options.fg_passive, bgcolor: feedback.options.bg_passive };
				}
			}
		}
	}
	
	if (feedback.type === 'mic') {
		for (let i = 0; i < self.SeatStates.length; i++) {
			if (self.SeatStates[i].seat === feedback.options.seat.toString()) {
				if (self.SeatStates[i].on) {
					return { color: feedback.options.fg, bgcolor: feedback.options.bg };
				}
			}
		}
	}

	if (feedback.type === 'mic_request') {
		for (let i = 0; i < self.SeatStates.length; i++) {
			if (self.SeatStates[i].seat === feedback.options.seat.toString()) {
				if (self.SeatStates[i].request) {
					return { color: feedback.options.fg, bgcolor: feedback.options.bg };
				}
			}
		}
	}

	return {};
};

instance.prototype.initPresets = function () {
	var self = this;
	var presets = [];

	for (let i = 1; i <= 50; i++) {
		presets.push({
			category: 'Seats',
			label: 'Seat ' + i,
			bank: {
				style: 'text',
				text: `${i} - $(dis-ccu:seat_${i}_name)`,
				size: '14',
				color: '16777215',
				bgcolor: self.rgb(0, 0, 0)
			},
			actions: [{
				action: 'mic_toggle',
				options:{
					seat: i
				}
			}],
			feedbacks: [
				{
					type: 'seat_state',
					options: {
						seat: i,
						bg_active: self.rgb(87, 87, 87),
						fg_active: self.rgb(255, 255, 255),
						bg_passive: self.rgb(102, 0, 102),
						fg_passive: self.rgb(0, 0, 0)
					}
				},
				{
					type: 'mic_request',
					options: {
						seat: i,
						bg: self.rgb(0, 255, 0),
						fg: self.rgb(0, 0, 0)
					}
				},
				{
					type: 'mic',
					options: {
						seat: i,
						bg: self.rgb(255, 0, 0),
						fg: self.rgb(255, 255, 255)
					}
				}
			]
		});
	}

	self.setPresetDefinitions(presets);
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module will connect to a Shure DIS CCU Unit.'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'IP Address',
			width: 6,
			default: '192.168.0.1',
			regex: self.REGEX_IP
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	debug("destroy", self.id);
}

instance.prototype.actions = function() {
	var self = this;

	self.system.emit('instance_actions', self.id, {

		'mic_on': {
			label: 'Turn Mic On By Seat Number',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default: 1,
					required: true,
					range: false
				}
			]
		},
		'mic_off': {
			label: 'Turn Mic Off By Seat Number',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default: 1,
					required: true,
					range: false
				}
			]
		},
		'mic_toggle': {
			label: 'Toggle Mic On or Off By Seat Number',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default:1,
					required: true,
					range: false
				}
			]
		},
		'mic_request_on': {
			label: 'Request Mic On By Seat Number',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default: 1,
					required: true,
					range: false
				}
			]
		},
		'mic_request_off': {
			label: 'Request Mic Off By Seat Number',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default: 1,
					required: true,
					range: false
				}
			]
		},
		'mic_all_off': {
			label: 'Turn All Mics Off'
		},
		'mic_all_delegates_off': {
			label: 'Turn All Delegate Mics Off'
		},
		'mic_mute_all': {
			label: 'Mute All Delegate Mics'
		},
		'mic_unmute_all': {
			label: 'Unmute All Delegate Mics'
		},
		'mic_priority': {
			label: 'Set Mic Priority',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default: 1,
					required: true,
					range: false
				},
				{
					type: 'dropdown',
					label: 'Priority',
					id: 'priority',
					default: '0',
					choices: [
						{id: '0', label: 'Priority 0 (lowest)'},
						{id: '1', label: 'Priority 1'},
						{id: '2', label: 'Priority 2'},
						{id: '3', label: 'Priority 3'},
						{id: '4', label: 'Priority 4'},
						{id: '5', label: 'Priority 5 (highest)'}
					]
				}
			]
		},
		'mic_speaker_attenuation': {
			label: 'Set Mic Speaker Attenuation',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default: 1,
					required: true,
					range: false
				},
				{
					type: 'dropdown',
					label: 'Attenuation',
					id: 'attenuation',
					default: '0',
					choices: [
						{id: '0', label: '0dB'},
						{id: '1', label: '1dB'},
						{id: '2', label: '2dB'},
						{id: '3', label: '3dB'},
						{id: '4', label: '4dB'},
						{id: '5', label: '5dB'},
						{id: '6', label: '6dB'},
						{id: '7', label: 'Off'}
					]
				}
			]
		},
		'mic_attenuation': {
			label: 'Set Mic Attenuation',
			options: [
				{
					type: 'number',
					label: 'Seat Number',
					id: 'seat',
					tooltip: 'The seat number to control (between 1 and 65535)',
					min: 1,
					max: 65535,
					default: 1,
					required: true,
					range: false
				},
				{
					type: 'dropdown',
					label: 'Attenuation',
					id: 'attenuation',
					default: '0',
					choices: [
						{id: '0', label: '0dB'},
						{id: '1', label: '1dB'},
						{id: '2', label: '2dB'},
						{id: '3', label: '3dB'},
						{id: '4', label: '4dB'},
						{id: '5', label: '5dB'},
						{id: '6', label: '6dB'}
					]
				}
			]
		}
	});
}

instance.prototype.action = function(action) {

	var self = this;
	var cmd;
	var options = action.options;
	
	switch(action.action) {
		case 'mic_on':
			cmd = 'mic_on ' + options.seat;
			break;
		case 'mic_off':
			cmd = 'mic_off ' + options.seat;
			break;
		case 'mic_toggle':
			cmd = 'mic_on ' + options.seat;
			for (let i = 0; i < self.SeatStates.length; i++) {
				if (self.SeatStates[i].seat === options.seat.toString()) {
					if (self.SeatStates[i].on) {
						cmd = 'mic_off ' + options.seat;
					}
					else {
						cmd = 'mic_on ' + options.seat;
					}
					
				}
			}
			break;
		case 'mic_request_on':
			cmd = 'mic_request_on ' + options.seat;
			break;
		case 'mic_request_off':
			cmd = 'mic_request_off ' + options.seat;
			break;
		case 'mic_all_off':
			cmd = 'mic_all_off';
			break;
		case 'mic_all_delegates_off':
			cmd = 'mic_all_delegates_off';
			break;
		case 'mic_mute_all':
			cmd = 'mic_mute_all activate';
			break;
		case 'mic_unmute_all':
			cmd = 'mic_mute_all deactivate';
			break;
		case 'mic_priority':
			cmd = 'mic_priority ' + options.seat + ' ' + options.priority;
			break;
		case 'mic_speaker_attenuation':
			cmd = 'mic_speaker_attenuation ' + options.seat + ' ' + options.attenuation;
			break;
		case 'mic_attenuation':
			cmd = 'mic_attenuation ' + options.seat + ' ' + options.attenuation;
			break;
	}

	if (cmd !== undefined) {
		if (self.socket !== undefined && self.socket.connected) {
			console.log('***SENDING***');
			console.log(cmd);
			self.socket.send(cmd + '\r\n');
		} else {
			debug('Socket not connected :(');
		}

	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;