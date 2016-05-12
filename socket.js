const WebSocketClient = require('ws');
var fun = coastline.funMaker({ add_this: true });

C.socket = {

	ws: null,
	events: {},
	requests: {},
	requestId: 1,
	whenConnected: [],
	whenReady: [],
	connected: false,
	ready: false,
	reconnectInterval: 500,
	binaryType: 'blob',
	messageLog: [],
	roomQueue: {},

	connect: fun(function (c, socket) {
		var proto = location.hostname == 'tixchat.com' ? 'wss' : 'ws' + location.protocol.match(/(s?):$/)[1];
		var uri = 'wss://tixchat.com/ws/';
		C.debug && console.log('connecting to ' + uri);
		var events = {};
		// FIXME: wrong headers!
		socket.ws = new WebSocket(uri, 'https', {
			host:"tixchat.com",
			origin: 'https://tixchat.com/',
			headers: {
				'Content-Type': 'application/json',
				'X-Client-Type': 'standalone',
				'Origin': 'https://tixchat.com'
			}
		});
		socket.ws.binaryType = socket.binaryType;

		socket.ws.onopen = function () {
			console.log('connected');
			socket.reconnectInterval = 500;
			socket.connected = true;
			//c.q(function (c) {
				console.log('Register client..');
				socket.ws.send(JSON.stringify(['version', [2, 'TiXchat JRj client', '1.0.0']]));
				socket.ws.onmessage = function (e) {
					var data = JSON.parse(e.data);
					console.log('Received message:', data);
					if (data[0] != 'version') {
						//setTimeout(function () { location.reload(true); }, socket.reconnectInterval);
						return;
					}
					console.log('Server version:', data[1][2]);
					socket.ws.onmessage = socket.processMessage.bind(socket);
				};
				return c;
			//});
/*
			c.q(function (c) {
				c.each(socket.whenConnected, function (c, str) {
					socket.ws.send(str);
				});

				var cookie = document.cookie.replace(/(?:(?:^|.*;\s*)jauth\s*\=\s*([^;]*).*$)|^.*$/, "$1");
				if (cookie) {
					c.q('wait', function (c) {
						socket.ws.send(JSON.stringify(['auth', {
							cookie: cookie,
							localSettings: C.localSettings
						}]));
						socket.ws.onmessage = function (e) {
							if (typeof e.data == 'string') {
								var data = JSON.parse(e.data);
								if (data[0] == 'auth') {
									c.done(data[1]);
									return;
								}
								else if (data[0] == 'banned') {
									C.Alert('Вам здесь не рады.');
									return;
								}
							}
							socket.processMessage(e);
						};
					});
					c.q(function (c, res) {
						if (res.error) {
							document.cookie = 'jauth=; path=/;';
							location.reload();
							return;
						}
						else if (C.client && res.user.id != C.user.id) {
							location.reload();
							return;
						}

						socket.ready = true;

						C.drift = res.now - Date.now();

						if (!C.client) c.q(function () {
							C.contacts = {};
							c.each(res.contacts, function (c, data) {
								C.User.make('to', C.contacts, data.id, c, data);
							});
							C.User.make('to', C, 'user', c, res.user);

							c.q(function () {
								var initial = localStorage.getItem('initial');
								if (window.localStorage && window.JSON && initial) {
									localStorage.removeItem('initial');
									initial = JSON.parse(initial);
									console.warn('bodyparts', initial.bodyparts);
									C.user.request(c, 'initialBodySetup', {
										bodyparts: initial.bodyparts,
										bodycolor: initial.bodycolor,
										sex: initial.sex
									});
								}
								//C.loadingOverlay.add('starting client');
								new C.Client(res);
							});
						});

						c.q(function () {
							c.each(socket.whenReady, function (c, str) {
								socket.ws.send(str);
							});
						});

						socket.ws.onmessage = socket.processMessage.bind(socket);
					});
				}
				else {
					c.q(function () {
						//new C.Auth();
						//C.pageManager.openURI(location.pathname);
					});
				}
			});
			c.q(function () {
				//C.loadingOverlay.remove('finishing up w/ socket');
			});

			c.done();
			*/
		};

		socket.ws.onclose = function () {
			C.debug && console.log('Disconnected');
			socket.ws = null;
			socket.connected = false;
			socket.ready = false;
			setTimeout(function () {
				//C.loadingOverlay.toggle(1, { message: 'socket connecting' });
				socket.connect();
			}, socket.reconnectInterval);
			socket.reconnectInterval = Math.min(socket.reconnectInterval * 1.5, 10000);
			if (!c.isDone) {
				c.done();
			}
		};

		c.q(function () {
			//C.loadingOverlay.toggle(-1, { message: 'socket code ran' });
		});

		return c;
	}),

	processMessage: function (e) {
		var socket = this;
		var reqid;

		var data = JSON.parse(e.data);
		if (data[0] != 'pong') {
			socket.messageLog.push(data);
		}
		if (socket.messageLog.length >= 200) {
			socket.messageLog = socket.messageLog.slice(100);
		}
		var fn = 'event_' + data[0];
		socket[fn](data[1]);
	},

	setBinaryType: function (type) {
		this.binaryType = type;
		if (this.ws) {
			this.ws.binaryType = type;
		}
	},

	event_refresh: fun({ no_parent: true }, function (c, socket, msg) {
		var notification = new C.Notification({
			view: C.View('notification/system', {
				text: 'Обновление страницы',
				closable: false
			}),
			css_class: 'message'
		});

		setTimeout(function () {
			notification.show();
		}, 100);
		setTimeout(function () {
			location.reload(true);
		}, 1000);
	}),

	event_response: fun({ no_parent: true }, function (c, socket, msg) {
		var req = socket.requests[msg.id];
		if (req.method != 'ping') {
			C.debug && console.log('response', msg);
		}
		if (req && req.method != 'ping') {
			C.loading(-1);
		}
		req.promise.done(msg.data);
		delete socket.requests[msg.id];
	}),

	event_error: fun({ no_parent: true }, function (c, socket, msg) {
		C.debug && console.log('error', msg);
		if (socket.requests[msg.id]) {
			C.loading(-1);
			console.error(msg.id, msg);
			socket.requests[msg.id].promise.hurl(typeof msg.data == 'string' ? msg.data : msg.data.type || 'exception', msg.data);
		}
		delete socket.requests[msg.id];
	}),

	event_room: fun(function (c, socket, msg) {
		var cc = socket.roomQueue[msg.room] = socket.roomQueue[msg.room] || coastline();
		cc.q(function (c) {
			if (msg.user) {
				C.User.make('to', msg, 'user', c, msg.user);
			}
			if (msg.event == 'state') {
				C.Room.make(c, msg.data);
				c.q(function (c, room) {
					room.event(c, msg);
				});
			}
			else {
				C.Room.make(c, msg.room);
				c.q(function (c, room) {
					room.event(c, msg);
				});
			}
		});
	}),

	event_thing: fun(function (c, socket, msg) {
		c.fork();
		C.debug && console.log('thing', msg);
		if (msg.event == 'created') {
			C.Thing.make(c, msg.data);
		}
		else {
			C.Thing.fetch(c, msg.thing);
		}
		c.q(function (c, thing) {
			thing.event(c, msg);
		});
	}),

	event_message: fun(function (c, socket, msg) {
		c.fork();
		C.debug && console.log('message', msg);
		C.User.fetch(c, msg.user);
		c.q(function (c, user) {
			user.open().message(msg);
		});
	}),

	event_user: fun(function (c, socket, msg) {
		c.fork();
		C.debug && console.log('user', msg);
		C.User.fetch(c, msg.id);
		c.q(function (c, user) {
			user.update(msg.changes);
		});
	}),

	event_event: fun(function (c, socket, msg) {
		c.fork();
		C.debug && console.log('event', msg);
		C.client.event(msg);
	}),

	event_coinTransaction: fun(function (c, socket, msg) {
		if (msg[1] !== undefined) {
			msg[1] && C.User.fetch(c, msg[1]);
			c.q(function (c, user) {
				new C.Popup(
					C.View('popup/cookies_gift', {
						cookies: msg[0],
						user: user || false,
						message: msg[2]
					}),
					{ backdrop: false, popupClass: 'cookieRain gift' }
				);
			});
		}
		else {
			new C.Popup(
				C.View('popup/cookies', { cookies: msg[0] }),
				{ backdrop: false, popupClass: 'cookieRain' }
			);
		}
	}),

	event_coupon: fun(function (c, socket, msg) {
		if (msg[0] == 'cookies') {
			new C.Popup(
				C.View('popup/coupon/cookies', {
					cookies: msg[1],
					code: msg[2],
					uses: msg[3]
				}),
				{ backdrop: false, popupClass: 'coupon cookies' }
			);
		}
	}),

	event_recent: fun(function (c, socket, msg) {
		C.client.Navigation.recents.update(msg);
	}),

	request: fun({ no_parent: true }, function (c, socket, method, params, callback, force) {
		return socket.sendRequest('return', c, {
			method: method,
			params: params
		}, callback, force);
	}),

	sendRequest: fun({ no_parent: true }, function (c, socket, req, callback, force) {
		req.id = socket.requestId++;
		if (req.method != 'ping') {
			C.loading(1);
			C.debug && console.log('request', req);
		}
		var str = JSON.stringify(['request', req]);
		if (socket.ready || force) {
			socket.ws.send(str);
		}
		else {
			socket.whenReady.push(str);
		}
		req.promise = c.promise();
		socket.requests[req.id] = req;
		c.q('return', 'value', function (c, res) {
			if (callback) {
				callback(res);
			}
			return res;
		});
	}),

	uploadFile: fun({ no_parent: true }, function (c, socket, file) {
		var req = {
			id: socket.requestId++,
			name: file.name
		};
		var str = JSON.stringify(['upload', req]);
		console.log('uploading', file);
		if (socket.connected) {
			socket.ws.send(str);
			socket.ws.send(file.slice());
		}
		else {
			socket.whenConnected.push(str);
			socket.whenConnected.push(file.slice());
		}
		req.promise = c.promise();
		socket.requests[req.id] = req;
		c.q('return', 'value', function (c, res) {
			console.log('uploaded', file);
			return res;
		});
	}),

	ping: function (callback, force) {
		var socket = this;
		if (!socket.ws) {
			return;
		}
		if (socket.ready || force) {
			var t0 = Date.now();
			socket.ws.send(JSON.stringify(['ping']));
			socket.event_pong = function (time) {
				C.drift = time - Date.now();
				callback && callback(Date.now() - t0);
			};
		}
		else {
			callback && callback(999);
		}
	}

};

C.drift = 0;
