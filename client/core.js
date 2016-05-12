window.C = window.C || {};

//coastline.trace = false;

console.log('starting');

C.q = coastline.provider();

C.q(function () {
	C.socket.connect();
});
