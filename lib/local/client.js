// Local Client Behaviors
// ======================
// pfraze 2013

if (typeof this.local == 'undefined')
	this.local = {};
if (typeof this.local.client == 'undefined')
	this.local.client = {};

(function() {// Helpers
// =======

// EXPORTED
// searches up the node tree for an element
function findParentNode(node, test) {
	while (node) {
		if (test(node)) { return node; }
		node = node.parentNode;
	}
	return null;
}

findParentNode.byTag = function(node, tagName) {
	return findParentNode(node, function(elem) {
		return elem.tagName == tagName;
	});
};

findParentNode.byClass = function(node, className) {
	return findParentNode(node, function(elem) {
		return elem.classList && elem.classList.contains(className);
	});
};

findParentNode.byElement = function(node, element) {
	return findParentNode(node, function(elem) {
		return elem === element;
	});
};

findParentNode.thatisFormRelated = function(node) {
	return findParentNode(node, function(elem) {
		return !!elem.form;
	});
};

// combines parameters as objects
// - precedence is rightmost
//     reduceObjects({a:1}, {a:2}, {a:3}) => {a:3}
function reduceObjects() {
	var objs = Array.prototype.slice.call(arguments);
	var acc = {}, obj;
	while (objs.length) {
		obj = objs.shift();
		if (!obj) { continue; }
		for (var k in obj) {
			if (typeof obj[k] == 'undefined' || obj[k] === null) { continue; }
			if (typeof obj[k] == 'object' && !Array.isArray(obj[k])) {
				acc[k] = reduceObjects(acc[k], obj[k]);
			} else {
				acc[k] = obj[k];
			}
		}
	}
	return acc;
}

// INTERNAL
// dispatches a request event, stopping the given event
function dispatchRequestEvent(targetElem, request) {
	var re = new CustomEvent('request', { bubbles:true, cancelable:true, detail:request });
	targetElem.dispatchEvent(re);
}

// INTERNAL
// submit helper, makes it possible to find the button which triggered the submit
function trackFormSubmitter(node) {
	var elem = findParentNode.thatisFormRelated(node);
	if (elem) {
		for (var i=0; i < elem.form.length; i++) {
			elem.form[i].setAttribute('submitter', null);
		}
		elem.setAttribute('submitter', '1');
	}
}

// EXPORTED
// extracts request from any given element
function extractRequest(targetElem, containerElem) {
	var requests = { form:{}, fieldset:{}, elem:{} };
	var fieldset = null, form = null;

	// find parent fieldset
	if (targetElem.tagName === 'FIELDSET') {
		fieldset = targetElem;
	} else if (targetElem.tagName !== 'FORM') {
		fieldset = findParentNode.byTag(targetElem, 'FIELDSET');
	}

	// find parent form
	if (targetElem.tagName === 'FORM') {
		form = targetElem;
	} else {
		// :TODO: targetElem.form may be a simpler alternative
		var formId = targetElem.getAttribute('form') || (fieldset ? fieldset.getAttribute('form') : null);
		if (formId) {
			form = containerElem.querySelector('#'+formId);
		}
		if (!form) {
			form = findParentNode.byTag(targetElem, 'FORM');
		}
	}

	// extract payload
	var payload = extractRequestPayload(targetElem, form);
	
	// extract form headers
	if (form) {
		requests.form = extractRequest.fromForm(form, targetElem);
	}

	// extract fieldset headers
	if (fieldset) {
		requests.fieldset = extractRequest.fromFormElement(fieldset);
	}

	// extract element headers
	if (targetElem.tagName === 'A') {
		requests.elem = extractRequest.fromAnchor(targetElem);
	} else if (['FORM','FIELDSET'].indexOf(targetElem.tagName) === -1) {
		requests.elem = extractRequest.fromFormElement(targetElem);
	}

	// combine then all, with precedence given to rightmost objects in param list
	var req = reduceObjects(requests.form, requests.fieldset, requests.elem);
	var payloadWrapper = {};
	payloadWrapper[/GET/i.test(req.method) ? 'query' : 'body'] = payload;
	return reduceObjects(req, payloadWrapper);
}

// EXPORTED
// extracts request parameters from an anchor tag
extractRequest.fromAnchor = function(node) {

	// get the anchor
	node = findParentNode.byTag(node, 'A');
	if (!node || !node.attributes.href || node.attributes.href.value.charAt(0) == '#') { return null; }

	// pull out params
	var request = {
		method  : 'get',
		url     : node.attributes.href.value,
		target  : node.getAttribute('target'),
		headers : { accept:node.getAttribute('type') }
	};
	return request;
};

// EXPORTED
// extracts request parameters from a form element (inputs, textareas, etc)
extractRequest.fromFormElement = function(node) {
	// :TODO: search parent for the form-related element?
	//        might obviate the need for submitter-tracking

	// pull out params
	var request = {
		method  : node.getAttribute('formmethod'),
		url     : node.getAttribute('formaction'),
		target  : node.getAttribute('formtarget'),
		headers : {
			'content-type' : node.getAttribute('formenctype'),
			accept         : node.getAttribute('formaccept')
		}
	};
	return request;
};

// EXPORTED
// extracts request parameters from a form
extractRequest.fromForm = function(form, submittingElem) {

	// find the submitter, if the submitting element is not form-related
	if (submittingElem && !submittingElem.form) {
		for (var i=0; i < form.length; i++) {
			var elem = form[i];
			if (elem.getAttribute('submitter') == '1') {
				submittingElem = elem;
				elem.setAttribute('submitter', '0');
				break;
			}
		}
	}

	var requests = { submitter:{}, form:{} };
	// extract submitting element headers
	if (submittingElem) {
		requests.submitter = {
			method  : submittingElem.getAttribute('formmethod'),
			url     : submittingElem.getAttribute('formaction'),
			target  : submittingElem.getAttribute('formtarget'),
			headers : {
				'content-type' : submittingElem.getAttribute('formenctype'),
				accept         : submittingElem.getAttribute('formaccept')
			}
		};
	}
	// extract form headers
	requests.form = {
		method  : form.getAttribute('method'),
		url     : form.getAttribute('action'),
		target  : form.getAttribute('target'),
		headers : {
			'content-type' : form.getAttribute('enctype') || form.enctype,
			'accept'       : form.getAttribute('accept')
		}
	};
	if (form.acceptCharset) { requests.form.headers.accept = form.acceptCharset; }

	// combine, with precedence to the submitting element
	var request = reduceObjects(requests.form, requests.submitter);

	// strip the base URI
	// :TODO: needed?
	/*var base_uri = window.location.href.split('#')[0];
	if (target_uri.indexOf(base_uri) != -1) {
		target_uri = target_uri.substring(base_uri.length);
		if (target_uri.charAt(0) != '/') { target_uri = '/' + target_uri; }
	}*/

	return request;
};

// EXPORTED
// serializes all form elements beneath and including the given element
function extractRequestPayload(targetElem, form, opts) {
	if (!opts) opts = {};

	// iterate form elements
	var data = {};
	if (!opts.nofiles)
		data.__fileReads = []; // an array of promises to read <input type=file>s
	for (var i=0; i < form.length; i++) {
		var elem = form[i];

		// skip if it doesnt have a name
		if (!elem.name)
			continue;

		// skip if not a child of the target element
		if (!findParentNode.byElement(elem, targetElem))
			continue;

		// pull value if it has one
		var isSubmittingElem = elem.getAttribute('submitter') == '1';
		if (elem.tagName === 'BUTTON') {
			if (isSubmittingElem) {
				// don't pull from buttons unless recently clicked
				data[elem.name] = elem.value;
			}
		} else if (elem.tagName === 'INPUT') {
			switch (elem.type.toLowerCase()) {
				case 'button':
				case 'submit':
					if (isSubmittingElem) {
						// don't pull from buttons unless recently clicked
						data[elem.name] = elem.value;
					}
					break;
				case 'checkbox':
					if (elem.checked) {
						// don't pull from checkboxes unless checked
						data[elem.name] = (data[elem.name] || []).concat(elem.value);
					}
					break;
				case 'radio':
					if (elem.getAttribute('checked') !== null) {
						// don't pull from radios unless selected
						data[elem.name] = elem.value;
					}
					break;
				case 'file':
					// read the files
					if (opts.nofiles)
						break;
					if (elem.multiple) {
						for (var i=0, f; f = elem.files[i]; i++)
							readFile(data, elem, elem.files[i], i);
						data[elem.name] = [];
						data[elem.name].length = i;
					} else {
						readFile(data, elem, elem.files[0]);
					}
					break;
				default:
					data[elem.name] = elem.value;
					break;
			}
		} else
			data[elem.name] = elem.value;
	}

	return data;
}

// INTERNAL
// file read helpers
function readFile(data, elem, file, index) {
	var reader = new FileReader();
	reader.onloadend = readFileLoadEnd(data, elem, file, index);
	reader.readAsDataURL(file);
}
function readFileLoadEnd(data, elem, file, index) {
	// ^ this avoids a closure circular reference
	var promise = local.promise();
	data.__fileReads.push(promise);
	return function(e) {
		var obj = {
			content: e.target.result || null,
			name: file.name,
			formattr: elem.name,
			size: file.size,
			type: file.type,
			lastModifiedDate: file.lastModifiedDate
		};
		if (typeof index != 'undefined')
			obj.formindex = index;
		promise.fulfill(obj);
	};
}
function finishPayloadFileReads(request) {
	var fileReads = (request.body) ? request.body.__fileReads :
					((request.query) ? request.query.__fileReads : []);
	return local.promise.bundle(fileReads).then(function(files) {
		if (request.body) delete request.body.__fileReads;
		if (request.query) delete request.query.__fileReads;
		files.forEach(function(file) {
			if (typeof file.formindex != 'undefined')
				request.body[file.formattr][file.formindex] = file;
			else request.body[file.formattr] = file;
		});
		return request;
	});
}

local.client.findParentNode = findParentNode;
local.client.extractRequest = extractRequest;
local.client.extractRequestPayload = extractRequestPayload;// Standard DOM Events
// ===================

// listen()
// ========
// EXPORTED
// Converts 'click', 'submit', and 'drag/drop' events into custom 'request' events
// - within the container, all 'click' and 'submit' events will be consumed
// - 'request' events will be dispatched by the original dispatching element
// - draggable elements which produce requests (anchors, form elements) have their drag/drop handlers defined as well
// Parameters:
// - `container` must be a valid DOM element
// - `options` may disable event listeners by setting `links`, `forms`, or `dragdrops` to false
function LocalClient__listen(container, options) {
	if (!container || !(container instanceof Element)) {
		throw "Listen() requires a valid DOM element as a first parameter";
	}

	container.__eventHandlers = [];
	options = options || {};

	var handler;
	if (options.links !== false) {
		handler = { name:'click', handleEvent:LocalClient__clickHandler, container:container };
		container.addEventListener('click', handler, true);
		container.__eventHandlers.push(handler);
	}
	if (options.forms !== false) {
		handler = { name:'submit', handleEvent:LocalClient__submitHandler, container:container };
		container.addEventListener('submit', handler, true);
	}
	// :DEBUG: disabled for now
	/*if (options.dragdrops !== false) {
		handler = { name:'dragstart', handleEvent:LocalClient__dragstartHandler, container:container };
		container.addEventListener('dragstart', handler);
		container.__eventHandlers.push(handler);
	}*/
}

// unlisten()
// ==========
// EXPORTED
// Stops listening to 'click', 'submit', and 'drag/drop' events
function LocalClient__unlisten(container) {
	if (container.__eventHandlers) {
		container.__eventHandlers.forEach(function(handler) {
			container.removeEventListener(handler.name, handler);
		});
		delete container.__eventHandlers;
	}
	var subscribeElems = container.querySelectorAll('[data-subscribe]');
	Array.prototype.forEach.call(subscribeElems, function(subscribeElem) {
		if (subscribeElem.__subscriptions) {
			for (var url in subscribeElem.__subscriptions)
				subscribeElem.__subscriptions[url].close();
			delete subscribeElem.__subscriptions;
		}
	});
}

// INTERNAL
// transforms click events into request events
function LocalClient__clickHandler(e) {
	if (e.button !== 0) { return; } // handle left-click only
	trackFormSubmitter(e.target);
	var request = extractRequest.fromAnchor(e.target);
	if (request && ['_top','_blank'].indexOf(request.target) !== -1) { return; }
	if (request) {
		e.preventDefault();
		e.stopPropagation();
		dispatchRequestEvent(e.target, request);
		return false;
	}
}

// INTERNAL
// transforms submit events into request events
function LocalClient__submitHandler(e) {
	var request = extractRequest(e.target, this.container);
	if (request && ['_top','_blank'].indexOf(request.target) !== -1) { return; }
	if (request) {
		e.preventDefault();
		e.stopPropagation();
		finishPayloadFileReads(request).then(function() {
			dispatchRequestEvent(e.target, request);
		});
		return false;
	}
}

// INTERNAL
// builds a 'link' object out of a dragged item
function LocalClient__dragstartHandler(e) {
	e.dataTransfer.effectAllowed = 'none'; // allow nothing unless there's a valid link
	var link = null, elem = e.target;

	// update our form submitter tracking
	trackFormSubmitter(elem);

	// get request data
	if (elem.tagName == 'A') {
		link = extractRequest.fromAnchor(elem);
	} else if (elem.form) {
		link = extractRequest(elem.form, this.container);
	} /* :TODO: do we need to include fieldsets here? */

	// setup drag/drop behavior
	if (link) {
		e.dataTransfer.effectAllowed = 'link';
		e.dataTransfer.setData('application/request+json', JSON.stringify(link));
		e.dataTransfer.setData('text/uri-list', link.url);
		e.dataTransfer.setData('text/plain', link.url);
	}
}

local.client.listen = LocalClient__listen;
local.client.unlisten = LocalClient__unlisten;// Response Interpretation
// =======================

// supported on* events
var attrEvents = ['blur', 'change', 'click', 'dblclick', 'focus', 'keydown', 'keypress', 'keyup',
	'load', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'reset', 'select', 'submit', 'unload'];

// renderResponse()
// ==============
// EXPORTED
// replaces the targetElem's innerHTML with the response payload
function renderResponse(targetElem, containerElem, response) {

	response.body = response.body || '';
	var type = response.headers['content-type'];
	if (/application\/html\-deltas\+json/.test(type)) {
		if (typeof response.body != 'object' || !Array.isArray(response.body))
			console.log('Improperly-formed application/html-deltas+json object', response);
		else {
			if (Array.isArray(response.body[0])) {
				response.body.forEach(function(delta) {
					renderHtmlDelta(delta, targetElem, containerElem);
				});
			} else
				renderHtmlDelta(response.body, targetElem, containerElem);
		}
	} else {
		// format the output by type
		var html = '';
		if (/text\/html/.test(type))
			html = response.body.toString();
		else {
			// escape non-html so that it can render correctly
			if (typeof response.body != 'string')
				html = JSON.stringify(response.body);
			html = response.body.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		local.client.unlisten(targetElem); // make sure to unregister listeners before replaceing
		targetElem.innerHTML = html;
		local.env.postProcessRegion(targetElem, containerElem);
	}

	bindAttrEvents(targetElem, containerElem);
	subscribeElements(targetElem, containerElem);
}

function renderHtmlDelta(delta, targetElem, containerElem) {
	if (typeof delta != 'object' || !Array.isArray(delta))
		return;
	var i, ii, region;
	var op = delta.shift(), selector = delta.shift(), args = delta;
	if (!op || !selector)
		return;
	var elems = containerElem.querySelectorAll(selector);
	var addClass = function(cls) { elems[i].classList.add(cls); };
	var removeClass = function(cls) { elems[i].classList.remove(cls); };
	var toggleClass = function(cls) { elems[i].classList.toggle(cls); };
	for (i=0, ii=elems.length; i < ii; i++) {
		if (!elems[i]) continue;
		var elem = elems[i];
		switch (op) {
			case 'replace':
				local.client.unlisten(elem); // destructive update, do unlisten
				elem.innerHTML = args[0];
				local.env.postProcessRegion(elem, containerElem);
				break;
			case 'remove':
				local.client.unlisten(elem); // destructive update, do unlisten
				elem.parentNode.removeChild(elem);
				break;
			case 'append':
				elem.innerHTML = elem.innerHTML + args[0];
				local.env.postProcessRegion(elem, containerElem);
				break;
			case 'prepend':
				elem.innerHTML = args[0] + elem.innerHTML;
				local.env.postProcessRegion(elem, containerElem);
				break;
			case 'addClass':
				if (elem.classList)
					(args[0]||'').split(' ').forEach(addClass);
				break;
			case 'removeClass':
				if (elem.classList)
					(args[0]||'').split(' ').forEach(removeClass);
				break;
			case 'toggleClass':
				if (elem.classList)
					(args[0]||'').split(' ').forEach(toggleClass);
				break;
			case 'setAttribute':
				if (args[0])
					elem.setAttribute(args[0], args[1]);
				break;
			case 'navigate':
				region = local.env.getClientRegion(elem.id);
				if (region)
					region.dispatchRequest(args[0]);
				else
					console.log('html-delta navigate targeted non-client-region element', elem, selector);
				break;
		}
	}
}

// INTERNAL
// searches elements for event attributes (on*) and binds a listener which dispatches a request event
// - attribute value determines the request method (post, put, patch, etc)
function bindAttrEvents(targetElem, containerElem) {
	
	// find all elements with on* attributes
	attrEvents.forEach(function(eventName) {
		var eventAttr = 'on'+eventName;
		var elements = targetElem.querySelectorAll('['+eventAttr+']');
		Array.prototype.forEach.call(elements, function(elem) {
			// bind event handlers based on the given model
			var method = elem.getAttribute(eventAttr);
			elem.addEventListener(eventName, makeAttrEventHandler(method, containerElem));
			elem.removeAttribute(eventAttr);
		});
	});
}

// INTERNAL
// provides an event handler which dispatches a request event
function makeAttrEventHandler(method, containerElem) {
	return function(e) {
		e.preventDefault();
		e.stopPropagation();

		// build request
		var request = extractRequest(e.currentTarget, containerElem);
		request.method = method;
		finishPayloadFileReads(request).then(function() {

			// move the query into the body if not a GET
			// (extractRequest would have used the wrong method to judge this)
			var isGET = /GET/i.test(method);
			if (!isGET && !request.body) {
				request.body = request.query;
				request.query = {};
			}
			// visa-versa
			else if (isGET && request.body) {
				request.query = reduceObjects(request.body, request.query);
				request.body = {};
			}

			// dispatch request event
			dispatchRequestEvent(e.target, request);
		});
	};
}

// INTERNAL
// subscribes all child elements with 'data-subscribe' to 'update' events coming from specified url
// - when the update message is received, will issue a GET request for new HTML
function subscribeElements(targetElem, containerElem) {

	// find subscribe elems
	var subscribeElems = targetElem.querySelectorAll('[data-subscribe]');

	Array.prototype.forEach.call(subscribeElems, function(subscribeElem) {
		// subscribe to server's events
		var subParts = subscribeElem.dataset.subscribe.split(' ');
		var eventsUrl = subParts[0];
		var getUrl = subParts[1] || eventsUrl;

		subscribeElem.__subscriptions = subscribeElem.__subscriptions || {};
		var stream = subscribeElem.__subscriptions[eventsUrl];
		if (!stream) {
			stream = subscribeElem.__subscriptions[eventsUrl] = local.http.subscribe({ url:eventsUrl });
			stream.on('update', makeUpdateEventHandler(getUrl, subscribeElem));
			stream.on('error', makeErrorEventHandler());
		}
	});
}

function makeUpdateEventHandler(url, targetElem) {
	return function(m) {
		var request = { method:'get', url:url, target:"_element", headers:{ accept:'text/html' }};
		if (targetElem.tagName == 'FORM') {
			// serialize the form values in the query
			request.query = extractRequestPayload(targetElem, targetElem, { nofiles:true });
			// see if the form has its own accept
			request.headers.accept = targetElem.getAttribute('accept') || 'text/html';
		}
		dispatchRequestEvent(targetElem, request);
	};
}

function makeErrorEventHandler() {
	return function(e) {
		var err = e.data;
		console.log('Client update stream error:', err);
	};
}

local.client.renderResponse = renderResponse;// Regions
// =======

if (typeof CustomEvent === 'undefined') {
	// CustomEvent shim (safari)
	// thanks to netoneko https://github.com/maker/ratchet/issues/101
	CustomEvent = function(type, eventInitDict) {
		var event = document.createEvent('CustomEvent');

		event.initCustomEvent(type, eventInitDict['bubbles'], eventInitDict['cancelable'], eventInitDict['detail']);
		return event;
	};
}

// EXPORTED
// an isolated browsing context in the DOM
// - `id` indicates the element to add Region behaviors to
function Region(id) {
	this.id = id;
	this.context = {
		url   : '',
		urld  : {},
		links : [],
		type  : '' // content type of the response
	};

	this.element = document.getElementById(id);
	if (!this.element) { throw "Region target element not found"; }
	this.element.classList.add('client-region');

	this.listenerFn = handleRequest.bind(this);
	this.element.addEventListener('request', this.listenerFn);
	local.client.listen(this.element);
}
local.client.Region = Region;

// dispatches a 'request' DOM event, which the region will then catch and HTTP-dispatch
Region.prototype.dispatchRequest = function(request) {
	if (typeof request === 'string') {
		request = { method:'get', url:request, headers:{ accept:'text/html' }};
	}
	var re = new CustomEvent('request', { bubbles:true, cancelable:true, detail:request });
	this.element.dispatchEvent(re);
};

// removes the Region behaviors from the given element
Region.prototype.terminate = function() {
	local.client.unlisten(this.element);
	this.element.removeEventListener('request', this.listenerFn);
};

// handles the 'request' DOM event by firing the HTTP request and handling the response
function handleRequest(e) {
	e.preventDefault();
	e.stopPropagation();

	var request = e.detail;
	this.__prepareRequest(request);

	var self = this;
	var handleResponse = function(response) { self.__handleResponse(e, request, response); };
	local.http.dispatch(request, this).then(handleResponse, handleResponse);
}

// prepares data from a 'request' DOM event for HTTP dispatch
Region.prototype.__prepareRequest = function(request) {
	// sane defaults
	request.headers = request.headers || {};
	request.headers.accept = request.headers.accept || 'text/html';
	request.stream = false;

	// relative urls
	var urld = local.http.parseUri(request);
	if (!urld.protocol) {
		// build a new url from the current context
		var newUrl;
		if (request.url.length > 0 && request.url.charAt(0) != '/') {
			// relative to context dirname
			newUrl = this.context.urld.protocol + "://" + this.context.urld.host + this.context.urld.directory + request.url;
		} else {
			// relative to context hostLink
			newUrl = this.context.urld.protocol + "://" + this.context.urld.host + request.url;
		}
		// reduce the string's '..' relatives
		// :TODO: I'm sure there's a better algorithm for this
		var lastRequestHost = this.context.urld.host;
		do {
			request.url = newUrl;
			newUrl = request.url.replace(/[^\/]+\/\.\.\//i, '');
		} while (newUrl != request.url && local.http.parseUri(newUrl).host == lastRequestHost);
		delete request.host;
		delete request.path;
	}
};

// applies an HTTP response to its target element
Region.prototype.__handleResponse = function(e, request, response) {
	response.headers = response.headers || {};
	var requestTarget = this.__chooseRequestTarget(e, request);
	if (!requestTarget)
		return;

	var targetClient = local.env.getClientRegion(requestTarget.id);
	if (targetClient)
		targetClient.__updateContext(request, response);

	// react to the response
	switch (response.status) {
		case 204:
			// no content
			break;
		case 205:
			// reset form
			// :TODO: should this try to find a parent form to requestTarget?
			if (requestTarget.tagName === 'FORM')
				requestTarget.reset();
			break;
		case 303:
			// dispatch for contents
			var request2 = { method:'get', url:response.headers.location, headers:{ accept:'text/html' }};
			this.dispatchRequest(request2);
			break;
		default:
			// replace target innards
			local.client.renderResponse(requestTarget, this.element, response);
	}
};

Region.prototype.__updateContext = function(request, response) {
	// track location for relative urls
	var urld = local.http.parseUri(request);
	this.context.urld  = urld;
	this.context.url   = urld.protocol + '://' + urld.authority + urld.directory;
	this.context.links = response.headers.link;
	this.context.type  = response.headers['content-type'];
};

Region.prototype.__chooseRequestTarget = function(e, request) {
	if (request.target == '_element')
		return e.target;
	return document.getElementById(request.target) || this.element;
};})();