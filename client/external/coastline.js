(function (root) {

	var version = [0, 4, 6];

	var globalObject = typeof window != 'undefined' ? window : typeof global != 'undefined' ? global : {};
	if (globalObject.coastline) {
		var instead = globalObject.coastline;
		if (instead.version[0] != version[0] || instead.version[1] != version[1] || instead.version[2] < version[2]) {
			typeof console != 'undefined' && console.log('Coastline: using version ' + instead.version.join('.') + ' instead of ' + version.join('.') + '. Expect bugs. See https://www.npmjs.org/package/coastline#use-in-modules');
		}
		if (typeof module != 'undefined') {
			module.exports = instead;
		}
		else {
			root.coastline = instead;
		}
		return;
	}

	var ObjectProto = Object.prototype;
	var ArrayClass = Array;
	var ErrorClass = Error;
	var setTimeoutFun = setTimeout;

	var noop = function () {};
	var wait = function () {};

	var fix = function (args) {
		return Array.prototype.slice.call(args);
	};

	var decide = function (a, b) {
		if (!b) {
			return a;
		}
		var k, c = {};
		for (k in a) {
			c[k] = a[k];
		}
		for (k in b) {
			c[k] = b[k];
		}
		return c;
	};

	var now;
	var proc = eval('typeof process != "undefined" && process');
	if (proc && proc.hrtime) {
		now = function () {
			var ht = proc.hrtime();
			return ht[0] * 1000 + ht[1] / 1000000;
		}
	}
	else {
		now = Date.now ? Date.now : function () {
			return new Date().getTime();
		};
	}

	var indexOf;
	if (Array.prototype.indexOf) {
		indexOf = function (arr, elt) {
			return arr.indexOf(elt);
		}
	}
	else {
		indexOf = function (arr, elt) {
			var len = arr.length >>> 0;

			var from = Number(arguments[1]) || 0;
			from = (from < 0)
				? Math.ceil(from)
				: Math.floor(from);
			if (from < 0)
				from += len;

			for (; from < len; from++) {
				if (from in arr && arr[from] === elt)
					return from;
			}
			return -1;
		};
	}

	var coastline = function (bind, options, callback) {

		var cbPos = 2;
		if (options && typeof options != 'object') {
			callback = options;
			options = null;
			cbPos = 1;
		}
		options = options || {};
		var key = options.key || coastline.key;

		var context;
		if (bind) {
			context = bind[key];
		}
		if (!context) {
			options.bind = bind;
			context = new coastline.context(options);
			if (bind) {
				bind[key] = context;
			}
		}

		if (callback) {
			return context.push(
				typeof callback != 'object' && arguments.length > cbPos ?
				fix(arguments).slice(cbPos) :
				callback
			);
		}

		return context;

	};

	coastline.version = version;

	coastline.nextTaskId = 1;
	coastline.stop = {};

	coastline.active = {};

	coastline.trace = true;

	coastline.provider = function (options) {
		return function (callback) {
			return coastline(this, options, fix(arguments));
		}
	};

	coastline.funMaker = function (defaultOptions) {
		defaultOptions = defaultOptions || {};
		return function (options, fun) {
			var i;
			var task = fix(arguments);
			fun = task.pop();
			options = task[0] || {};
			options = decide(defaultOptions, options);

			var gdata = function (obj, args) {
				return {
					flags: { scope: true },
					object: obj,
					parent: coastline(options.noParent || options.no_parent ? null : obj, options),
					method: fun,
					addObject: (options.addThis || options.add_this) && obj,
					arguments: args,
					coastlineFun: true
				};
			};
			var rfun = function () {
				var args = fix(arguments);
				for (var i = 0; i < args.length; i++) {
					if (arguments[i] instanceof coastline.context) {
						var data = gdata(this, args.slice(i + 1));
						arguments[i]._parse(args.slice(0, i), data.flags);
						data.parent = coastline(options.noParent || options.no_parent ? null : this, options);
						return arguments[i].pushContext(data);
					}
				}
				return coastline(null, options).pushContext(gdata(this, fix(arguments)));
			};
			rfun.fun = fun;
			rfun.options = options;
			rfun.getContextData = gdata;
			rfun['@isCoastlineFun'] = true;
			return rfun;

		}
	};

	coastline.fun = coastline.funMaker();

	coastline.key = '@coastline';

	var processTasks = function () {
		var i = 0;
		while (processQueue.length) {
			processQueue.shift()._process();
			i++;
		}
		processing = null;
	};
	var processing = null;
	var processQueue = [];

	coastline.randomize = function (maxDelay) {
		processTasks = function () {
			var delay = Math.round(Math.random() * maxDelay);
			processing = setTimeoutFun(function () {
				var i = Math.floor(Math.random() * processQueue.length);
				processQueue[i]._process();
				processQueue.splice(i, 1);
				processing = null;
				if (processQueue.length) {
					processTasks();
				}
			}, delay);
		}
	};

	coastline.value = function (c, key, path) {
		this.c = c;
		this.key = key;
		this.path = path;
	};
	var readValue = function (c, par, path, task) {
		var i, l, ret;
		if (par instanceof coastline.context) {
			par = par.value;
		}
		if (typeof par == 'object') {
			var process = function (i) {
				par[i] = task.readValue(par[i]);
				if (typeof par[i] == 'object') {
					readValue(c, par[i], path && path[i], task);
				}
			};
			if (Object.prototype.toString.call(par) === '[object Array]') {
				for (i = 0, l = par.length; i < l; i++) {
					process(i);
				}
			}
			else {
				for (i in par) {
					process(i);
				}
			}
			ret = par;
		}
		else if (par) {
			ret = c.data[par];
		}
		else {
			ret = c.value;
		}
		if (path) {
			for (i = 0; i < path.length; i++) {
				ret = ret[path[i]];
			}
		}
		return task.readValue(ret);
	};
	coastline.value.prototype = {
		// task argument is only used in special values below
		read: function (task) {
			if (this.key !== void 0) {
				return readValue(this.c, this.key, this.path, task);
			}
			else {
				return task.readValue(this.c.value);
			}
		}
	};

	var callbackValue = function (def) {
		this.def = def;
	};
	callbackValue.prototype = new coastline.value();
	callbackValue.prototype.read = function (task) {
		return task.callback(this.def);
	};
	coastline.callback = function (def) {
		return new callbackValue(def);
	};

	var errorThrowerValue = function (def, type, message) {
		this.def = def;
		this.type = type;
		this.message = message;
	};
	errorThrowerValue.prototype = new coastline.value();
	errorThrowerValue.prototype.read = function (task) {
		return task.errorThrower(this.def, this.type, this.message);
	};
	coastline.errorThrower = function (def, type, message) {
		return new errorThrowerValue(def, type, message);
	};

	var variableValue = function (value) {
		this.value = value;
	};
	variableValue.prototype = new coastline.value();
	variableValue.prototype.read = function (task) {
		return task.readValue(this.value);
	};
	coastline.variable = function (value) {
		return new variableValue(value);
	};

	coastline.context = function (options) {

		var id = coastline.nextTaskId++;

		if (coastline.trace) {
			this.errorObject = (new ErrorClass());
		}

		this.id = id;
		this.queue = [];
		this.flags = options.flags || {};

		if (options.caller) {
			this.caller = options.caller;
			this.top = this.caller.top;
			this.data = this.caller.data;
		}
		else {
			this.caller = null;
			this.top = this;
			this.data = {};
		}

		this.parent = options.parent;

		this.bind = options.bind || null;
		this.object = options.object || null;
		this.method = options.method || null;
		this.arguments = options.arguments || null;
		this.addObject = options.addObject || null;
		this.coastlineFun = options.coastlineFun || false;

	};
	coastline.context.prototype = {

		_parse: function (task, flags) {
			var part, fn, obj, c;
			while (task.length) {
				part = task.shift();
				if (typeof part == 'function') {
					fn = part;
					break;
				}
				else if (!obj && typeof part != 'string') {
					obj = part;
				}
				else if (obj) {
					fn = part;
					break;
				}
				else {
					if (part[0] == '=') {
						flags.returnKey = part.substr(1);
					}
					else if (part == 'obj') {
						obj = task.shift();
					}
					else if (part == 'to') {
						flags.writeToObject = task.shift();
						flags.writeToKey = task.shift();
					}
					else if (part == 'value' || part == 'val') {
						flags.value = true;
					}
					else if (part == 'c') {
						c = task.shift();
					}
					else {
						flags[part] = true;
					}
				}
			}
			return {
				flags: flags,
				object: obj,
				method: fn,
				arguments: task,
				caller: c || this
			}
		},

		push: function (task_arg) {
			var task;
			if (typeof task_arg != 'object' || arguments.length != 1) {
				task = new ArrayClass(arguments.length);
				for(var i = 0; i < task.length; ++i) {
					task[i] = arguments[i];
				}
			}
			else {
				task = task_arg;
			}

			var flags = {};
			if ((typeof task[0] == 'function' && task.length == 1) || (typeof task[0] == 'object' && task.length == 2)) {
				flags.value = true;
			}
			var data = this._parse(task, flags);
			var fn = data.method;
			data.object = data.object || this.object;
			var obj = data.object;

			if (data.caller != this) {
				data.parent = this;
				return data.caller.pushContext(data);
			}
			else if (fn['@isCoastlineFun']) {
				data = fn.getContextData(obj, task);
				data.caller = this;
				data.flags = decide(data.flags, flags);
				return this.pushContext(data);
			}
			else {
				data.caller = data.caller || this;
				data.parent = this;
				return this.pushContext(data);
			}

		},

		pushContext: function (c) {
			if (!(c instanceof coastline.context)) {
				c.parent = c.parent || this;
				c.caller = c.caller || this;
				c = new coastline.context(c);
			}

			if (this.finished && this.caller) {
				throw new ErrorClass('Coastline: trying to push onto a finished subtask');
			}

			c.previous = this.queue.length ? this.queue[this.queue.length - 1] : this.current;

			if (c.flags.after && c.parent == this) {
				if (!this.after) this.after = [];
				this.after.push(c);
			}
			else {
				this.queue.push(c);
			}

			if (!this.started && !this.caller) {
				this.start();
			}

			return c;

		},

		ex: function () {
			var args = fix(arguments);
			args.unshift('none');
			return this.push.apply(this, args);
		},

		exe: function () {
			var args = fix(arguments);
			args.unshift('none');
			args.push(coastline.errorThrower());
			return this.push.apply(this, args);
		},

		call: function () {
			var args = fix(arguments);
			args.unshift('auto');
			return this.push.apply(this, args);
		},

		start: function () {
			this.started = true;
			if (coastline.trace) {
				coastline.active[this.id] = this;
			}
			if (this.method) {
				this.finished = false;
				this.aborted = false;
				this._runTask();
			}
			else if (this.queue.length) {
				if (!this.current) {
					this.finished = false;
					this.aborted = false;
					this._next();
				}
			}
			else if (this.after) {
				this.queue = this.after;
				this.after = null;
				this.start();
			}
			else {
				this._finish();
			}
		},

		_next: function () {
			if (this.enqueued) {
				return;
			}
			processQueue.push(this);
			this.enqueued = true;
			if (!processing) {
				processing = setTimeoutFun(processTasks, 0);
			}
		},

		_process: function (task) {
			this.enqueued = false;
			if (task) {
				var idx = indexOf(this.queue, task);
				if (idx > -1) this.queue.splice(idx, 1);
				else {
					this.after.splice(indexOf(this.after, task), 1)
					if (!this.after.length) this.after = null;
				}
			}
			else {
				if (this.current) {
					throw new ErrorClass('Coastline: internal error, please contact developer');
				}
				task = this.queue.shift();
				if (!task && this.after) {
					this.queue = this.after;
					this.after = null;
					task = this.queue.shift();
				}
			}
			if (!task) {
				if (!this.bgCount) {
					this.current = null;
					this.started = false;
					this._finish();
				}
				return;
			}

			this.current = task;

			task.object = this.readValue(task.object);
			task.method = this.readValue(task.method);
			if (typeof task.method == 'string') {
				task.method = task.object[task.method];
			}

			if (task.method['@isCoastlineFun']) {
				var data = task.method.getContextData(task.object, task);
				task.parent = data.parent;
				task.caller = this;
				task.flags = decide(data.flags, task.flags);
				task.method = data.method;
				task.addObject = data.addObject;
				task.coastlineFun = true;
			}

			if (task.flags.bg) {
				if (task.parent == this) {
					task.parent = null;
				}
				this.current = null;
				this.bgCount = (this.bgCount || 0) + 1;
				this.bgActive = (this.bgActive || {});
				this.bgActive[task.id] = task;
				task.start();
				if (this.queue.length) {
					this._next();
				}
			}
			else if (task.parent == this) {
				task.start();
			}
			else if (task.parent.finished && task.method == wait) {
				task.parent = task.caller; // to prevent it from touching parent at all
				task.start();
			}
			else {
				task.parent.pushContext(task);
				var pcur = task.parent.current;
				if (pcur && pcur != task) {
					var ok = false;
					var cur = this;

					// resolve A->B->A deadlock
					do {
						if (pcur == cur) {
							task.replaced = pcur;
							task.parent._process(task);
							ok = true;
							break;
						}
					} while (cur = cur.caller);

					// resolve A->B vs B->A deadlock
					if (!ok) {
						var pcurcur = pcur;
						do {
							cur = this;
							do {
								if (pcurcur.parent == cur.parent && cur.parent.current == cur) {
									task.replaced = pcur;
									task.parent._process(task);
									ok = true;
									break;
								}
							} while (cur = cur.caller);
						} while (!ok && (pcurcur = pcurcur.current));
					}
				}
			}
		},

		_runTask: function () {
			var flags = this.flags;
			var args = this.arguments;
			var newArgs = [];
			var i;

			for (i = 0; i < args.length; i++) {
				args[i] = this.readValue(args[i]);
			}

			if (!flags.none && (!flags.auto || this.coastlineFun)) {
				newArgs.push(this);
			}

			if (this.addObject) {
				newArgs.push(this.addObject);
			}

			if (flags.value) {
				newArgs.push(this.previous && this.previous.value && this.readValue(this.previous.value));
			}

			this.arguments = args = newArgs.concat(args);

			if (flags.scope) {
				this.data = {};
			}

			if (coastline.trace) {
				this.running = now();
			}

			this._actuallyRun(args);

		},

		_actuallyRun: function (args) {
			try {
				var ret = this.method.apply(this.object, args);
			}
			catch (e) {
				this._catch({
					type: e.type || 'exception',
					value: e,
					stack: e.stack || (new ErrorClass()).stack,
					context: this
				});
				this._finish();
				return;
			}

			if (ret != this && !this.flags.wait && !this.aborted) {
				this.done(ret);
			}
		},

		_parentWaits: function () {
			return this.parent && (this.parent.current == this || (this.replaced && this.parent.current == this.replaced));
		},

		_callerWaits: function () {
			return this.caller && (this.caller.current == this || (this.caller.bgActive && this.caller.bgActive[this.id]));
		},

		done: function (returnValue) {
			if (this.isDone) {
				var err = 'Coastline: task already done';
				if (this.method) {
					err += ': ' + this.method.toString();
				}
				throw new ErrorClass(err);
			}
			if (profiling) {
				var td = now() - this.running;
				this.profile(this.trace(true), td);
			}
			this.running = false;
			if (returnValue !== void 0) {
				this.give(returnValue);
			}
			this.isDone = true;
			if (this.queue.length) {
				this._next();
			}
			else if (this.after) {
				this.queue = this.after;
				this.after = null;
				this._next();
			}
			else {
				this._finish();
			}
		},

		profile: function (trace, time) {
			var sub = coastline.profileData;
			for (var i = trace.length - 1; i >= 0; i--) {
				var line = trace[i];
				var info = sub[line] = sub[line] || {
					own: 0,
					total: 0,
					count: 0,
					sub: {}
				};
				info.total += time;
				if (!i) {
					info.own += time;
					info.count++;
				}
				sub = info.sub;
			}
		},

		give: function (returnValue) {
			this.value = returnValue;
		},

		// I have no idea what I'm doing. Should have written comments earlier.
		abort: function (wait, returnValue) {
			var c = this;
			if (wait instanceof coastline.context) {
				wait.q(function () {
					c.abort(returnValue);
				});
				return;
			}
			else {
				returnValue = wait;
			}

			this.aborted = true;
			this.started = false;

			if (!this.error && (this.finished || (this.parent && !this._parentWaits() && !this.forked && !this.flags.bg))) {
				var err = 'Coastline: task already finished';
				if (this.method) {
					err += ': ' + this.method.toString();
				}
				throw new ErrorClass(err);
			}

			this.queue = [];
			if (this.current) {
				var cur = this.current;
//				this.current = null;
				cur.abort();
			}

			this.isDone = true;
			if (returnValue !== void 0) {
				this.give(returnValue);
			}

			this._finished = true;
			if (this._callerWaits() && !this.caller.aborted) {
				if (!this.flags.bg) {
					this.caller._taskDone();
				}
				else {
					this.caller._bgDone(this);
				}
			}
			if (this._parentWaits() && !this.parent.aborted) {
				this.parent._taskDone(this.replaced);
			}
		},

		fork: function () {
			if (!this._parentWaits()) {
				var err = 'Coastline: task already forked';
				if (this.method) {
					err += ': ' + this.method.toString();
				}
				throw new ErrorClass(err);
			}
			this.forked = true;
			this.parent._taskDone(this.replaced);
		},

		_finish: function () {
			if (coastline.trace) {
				delete coastline.active[this.id];
			}

			if (this.value) {
				var value = this.value = this.readValue(this.value);
				if (this.flags.returnKey) {
					this.caller.data[this.flags.returnKey] = value;
				}
				if (this.flags.writeToObject) {
					this.flags.writeToObject[this.flags.writeToKey] = value;
				}
				if (this.flags['return']) {
					this.caller.give(value);
				}
			}

			if (!this.parent && !this.caller && this.bind) {
				this.started = false;
				return;
			}
			if (!this.error && (this.finished || (this.parent && !this._parentWaits() && !this.forked && !this.flags.bg))) {
				var err = 'Coastline: task already finished';
				if (this.method) {
					err += ': ' + this.method.toString();
				}
				throw new ErrorClass(err);
			}
			this.finished = true;

			if (this._callerWaits()) {
				if (!this.flags.bg) {
					this.caller._taskDone();
				}
				else {
					this.caller._bgDone(this);
				}
			}
			if (this._parentWaits()) {
				this.parent._taskDone(this.replaced);
			}
		},

		_taskDone: function (replace) {
			this.current = replace || null;
			if (!this.current || this.current.finished) {
				this._next();
			}
		},

		_bgDone: function (task) {
			delete this.bgActive[task.id];
			this.bgCount--;
			if (!this.bgCount && (!this.current || this.current.finished)) {
				this._next();
			}
		},

		scope: function (data) {
			this.data = data || {};
		},

		request: function (key) {
			var path = fix(arguments).slice(1);
			if (typeof path[0] == 'object') {
				path = path[0];
			}
			return new coastline.value(this, key, path.length ? path : null);
		},

		hurl: function (type, message, value) {
			var rmsg, rtype, rval;
			rval = value;
			if (typeof type == 'string') {
				rtype = type;
			}
			else {
				if (typeof type == 'object') {
					rval = type;
				}
				rtype = 'exception';
			}
			if (typeof message == 'string') {
				rmsg = message;
			}
			else {
				if (typeof message == 'object') {
					rval = message;
				}
				rmsg = rval && (rval.message || (rval.getMessage && rval.getMessage())) || rtype;
			}

			var e = new ErrorClass(rmsg);
			this._catch({
				type: rtype,
				error: e,
				value: rval || e,
				message: rmsg,
				stack: e.stack,
				context: this
			});

			this._finish();
		},

		_catch: function (e) {
			var handler;
			if (this._errors && (handler = this._errors[e.type] || this._errors['*'])) {
				if (handler(e) != e) {
					return;
				}
			}

			this.error = e;
			this.queue = [];
			if (coastline.trace) {
				delete coastline.active[this.id];
			}
			if (this.caller) {
				this.caller._catch(e);
			}
			else {
				coastline.onerror(e);
			}
		},

		trace: function (array, num) {
			if (!coastline.trace) {
				return array ? [] : '';
			}
			var trace = [];
			var context = this;
			while (context) {
				var stack = context.errorObject && context.errorObject.stack && context.errorObject.stack.split("\n") || [];
				var started = false;
				var i = 0;
				for (var j = 0; j < stack.length; j++) {
					if (stack[j].indexOf('coastline.js') < 0 || stack[j].indexOf('_each') >= 0) {
						if (started) {
							if (num !== void 0 && num == i) {
								return stack[j].trim();
							}
							trace.push(stack[j].trim());
							i++;
							break;
						}
					}
					else {
						started = true;
					}
				}
				context = context.caller;
			}
			return array ? trace : trace.join("\n");
		},

		grab: function (type, callback) {
			this._errors = this._errors || [];
			this._errors[type] = callback;
			return this;
		},

		then: function(callback) {
			var cur = this;
			return this.caller.push(function (c) {
				return callback(cur.readValue(cur.value), c);
			});
		},

		later: function() {
			return this.caller.push(fix(arguments));
		},

		callback: function (def) {
			var c = this;
			c.flags.wait = true;
			return function (ret) { c.done(ret === void 0 ? def : ret); };
		},

		errorThrower: function (def, type, message) {
			var c = this;
			c.flags.wait = true;
			return function (err, ret) {
				if (!err) {
					c.done(ret === void 0 ? def : ret);
				}
				else {
					c.hurl(type, message, err);
				}
			};
		},

		wait: function (oc) {
			if (!(oc instanceof coastline.context)) {
				oc = coastline(oc);
			}
			if (!oc.finished) {
				var pc = oc.push('c', this, 'after', wait);
			}
			return oc;
		},

		promise: function () {
			return this.push('wait', noop);
		},

		sleep: function (ms) {
			this.push(function (c) {
				setTimeoutFun(c.callback(), ms);
				return c;
			});
		},

		_each: function (obj, iterator, mode, callback) {
			var i, l;
			var keys = [];

			if (!mode) {
				mode = 'normal';
			}
			else if (mode != 'bg') {
				mode = 'lazy';
			}

			if (ObjectProto.toString.call(obj) === '[object Array]') {
				for (i = 0, l = obj.length; i < l; i++) {
					keys.push(i);
				}
			} else {
				for (i in obj) {
					if (ObjectProto.hasOwnProperty.call(obj, i)) {
						keys.push(i);
					}
				}
			}

			i = 0;
			l = keys.length;

			if (mode != 'bg') {
				var last;
				var next = function (c, ret) {
					if (ret == coastline.stop || i >= l) {
						if (callback) {
							loop.push(callback);
						}
						return;
					}
					var k = keys[i++];
					last = loop.push(iterator, obj[k], k);
					loop.push(next);
				};

				var pushed = this.push(next);
				var loop = mode == 'lazy' ? this : pushed;
				return loop;
			}
			else {
				this.push(function (c) {
					for (i = 0; i < l; i++) {
						var k = keys[i];
						c.push('bg', iterator, obj[k], k);
					}
				});
				if (callback) {
					this.push(callback);
				}
			}
		},

		each: function (obj, iterator, mode, callback) {
			return this.q(function (c, obj, iterator, mode, callback) {
				c._each(obj, iterator, mode, callback)
			}, obj, iterator, mode, callback); // pass through c.v() decoder etc
		},

		stop: coastline.stop,

		loop: function (fun, iacc) {
			return this.q(function (loop) {
				var iter = function (acc) {
					loop.q(fun, acc);
					loop.q(function (c, ret) {
						if (ret != coastline.stop) {
							iter(ret);
						}
					});
				};
				iter(iacc);
			});
		},

		print: function () {
			return coastline.printActive(this);
		},

		readValue: function (value) {
			if (value instanceof coastline.value) {
				return value.read(this);
			}
			else if (value instanceof coastline.context) {
				return this.readValue(value.value);
			}
			else {
				return value;
			}
		},

		setVariable: function (variable, value) {
			var c = this;
			c.q(function () {
				variable.value = c.readValue(value);
			})
		}

	};

	coastline.context.prototype.q = coastline.context.prototype.push;
	coastline.context.prototype.v = coastline.context.prototype.request;

	coastline.onerror = function (e) {
		if (coastline.trace && e.stack && console && console.error) {
			console.error('Coastline stack:');
			console.error(e.context.trace());
			console.error('Real stack:');
			console.error(e.stack);
		}
		if (e.value instanceof Error || e.value.lineNumber) {
			throw e.value;
		}
		else {
			throw new ErrorClass('Coastline: ' + e.type);
		}
	};

	coastline.printActive = function (selected) {
		if (!coastline.trace) {
			return 'coastline.trace disabled';
		}
		var printed = [];
		var out = '';
		var print = function (c, level, parent) {
			var str = c == selected ? '# ' : (selected ? '  ' : '');
			str += (new Array(level + 1)).join('  ');
			if (c.parent == parent) {
				str += '@';
			}
			if (c.caller == parent) {
				str += '~';
			}
			str += c.id + ' ' + c.trace(false, 0);
			if (c.method) {
				str += ' ' + c.method.toString().substr(0, 100).replace(/[\s\n\t\r]+/g, ' ');
			}
			out += str + "\n";
			if (c.current) {
				if (indexOf(printed, c.current) < 0) {
					print(c.current, level + 1, c);
				}
				else {
					str = (new Array(level + 2)).join('  ');
					var pcc = c;
					var cc = c.current;
					while (cc) {
						if (cc.parent == pcc) {
							str += '@';
						}
						if (cc.caller == pcc) {
							str += '~';
						}
						str += cc.id + ' ';
						pcc = cc;
						cc = cc.current;
					}
					out += str + "\n";
				}
			}
			printed.push(c);
		};
		if (selected) {
			var top = selected;
			while (top.caller && top.caller.current == top) top = top.caller;
			print(top, 0);
		}
		else {
			for (var cid in coastline.active) {
				var c = coastline.active[cid];
				if (indexOf(printed, c) < 0) {
					print(c, 0);
				}
			}
		}
		return out;
	};

	coastline.printRunning = function () {
		if (!coastline.trace) {
			return 'coastline.trace disabled';
		}
		var out = '';
		var tasks = [];
		for (var cid in coastline.active) {
			var c = coastline.active[cid];
			if (c.running) {
				tasks.push(c);
			}
		}
		tasks.sort(function (a, b) {
			return b.running - a.running;
		});
		for (var i = 0; i < tasks.length; i++) {
			c = tasks[i];
			out += Math.round(now() - c.running) + ' ' + c.id + ' ' +c.trace(false, 0);
			if (c.method) {
				out += ' ' + c.method.toString().substr(0, 100).replace(/[\s\n\t\r]+/g, ' ');
			}
			out += "\n";
		}
		return out;
	};

	var profiling = false;
	coastline.profile = function () {
		coastline.profileData = {};
		profiling = true;
	};
	coastline.stopProfiling = function () {
		profiling = false;
		return coastline.profileData;
	};

	coastline.printProfile = function (sort) {
		sort = sort || 'total';
		var str = '';
		var print = function (list, level) {
			var i, key, arr = [];
			for (key in list) {
				arr.push([key, list[key]]);
			}
			arr.sort(function (a, b) {
				return b[1][sort] - a[1][sort];
			});
			for (i = 0; i < arr.length; i++) {
				var data = arr[i][1];
				str += level + Math.round(data.total) + ' ' + Math.round(data.own) + ' ' + data.count + ' ' + arr[i][0] + "\n";
				if (data.sub) {
					print(data.sub, level += '| ');
				}
			}
		};
		print(coastline.profileData, '');
		return str;
	};

	globalObject.coastline = coastline;
	if (typeof module != 'undefined') {
		module.exports = coastline;
	}
	else {
		root.coastline = coastline;
	}

})(this);
