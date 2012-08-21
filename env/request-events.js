define(['./event-emitter'], function(EventEmitter) {
    // Request Events
    // ==============
    // observes given elemnts and converts DOM events into linkjs requests
    var RequestEvents = {
        init:RequestEvents__init,
        observe:RequestEvents__observe
    };
    EventEmitter.mixin(RequestEvents);

    // setup
    function RequestEvents__init() {
    }

    // register a DOM element for observation
    function RequestEvents__observe(elem, agent_id) {
        elem.addEventListener('click', function(e) {
            return RequestEvents__clickHandler(e, elem, agent_id);
        });
        elem.addEventListener('submit', function(e) {
            return RequestEvents__submitHandler(e, agent_id);
        });
        elem.addEventListener('dragstart', function(e) {
            return RequestEvents__dragstartHandler(e, elem, agent_id);
        }, false);
        elem.addEventListener('drop', function(e) {
            return RequestEvents__dropHandler(e, elem, agent_id);
        }, false);

        // DnD render-state managers
        elem.addEventListener('dragenter', function(e) {
            elem.classList.add('request-hover');
        }, false);
        elem.addEventListener('dragover', function(e) {
            e.preventDefault && e.preventDefault(); // dont cancel the drop
            e.dataTransfer.dropEffect = 'link';
            return false;
        }, false);
        elem.addEventListener('dragleave', function(e) {
            // dragleave is fired on all children, so only pay attention if it dragleaves our region
            var rect = elem.getBoundingClientRect();
            if (e.x >= (rect.left + rect.width) || e.x <= rect.left
             || e.y >= (rect.top + rect.height) || e.y <= rect.top) {
                elem.classList.remove('request-hover');
            }
        }, false);
        elem.addEventListener('dragend', function(e) {
            elem.classList.remove('request-hover');
        }, false);
    }

    function RequestEvents__clickHandler(e, observed_elem, agent_id) {
        RequestEvents__trackFormSubmitter(e.target, observed_elem);
        var request = RequestEvents__extractLinkFromAnchor(e.target, observed_elem);
        if (request) {
            e.preventDefault();
            e.stopPropagation && e.stopPropagation();
            RequestEvents.emitEvent('request', request, agent_id);
            return false;
        }
    }

    function RequestEvents__submitHandler(e, agent_id) {
        e.preventDefault();
        if (e.stopPropagation) { e.stopPropagation(); }
        var request = RequestEvents__extractLinkFromForm(e.target);
        // Build the request
        if (request) {
            RequestEvents.emitEvent('request', request, agent_id);
        }
        return false;
    }

    function RequestEvents__dragstartHandler(e, observed_elem, agent_id) {
        e.dataTransfer.effectAllowed = 'none'; // allow nothing unless there's a valid link
        var link = null, elem = e.srcElement;
        RequestEvents__trackFormSubmitter(elem, observed_elem);
        if (elem.tagName == 'A') {
            link = RequestEvents__extractLinkFromAnchor(elem);
        } else if (elem.form) {
            link = RequestEvents__extractLinkFromForm(elem.form);
        }
        if (link) {
            e.dataTransfer.effectAllowed = 'link';
            e.dataTransfer.setData('application/link+json', JSON.stringify(link));
        }
    }

    function RequestEvents__dropHandler(evt, observed_elem, agent_id) {
        evt.stopPropagation && evt.stopPropagation(); // no default behavior (redirects)
        observed_elem.classList.remove('request-hover');

        try {
            var link = JSON.parse(evt.dataTransfer.getData('application/link+json'));
        } catch (except) {
            console.log('Bad data provided on RequestEvents drop handler', except, evt);
        }

        var agent_id = RequestEvents__findOwningAgent(evt.target);

        RequestEvents.emitEvent('request', link, agent_id);
        return false;
    }

    function RequestEvents__trackFormSubmitter(node, observed_elem) {
        while (node && node != observed_elem) {
            if (node.form) {
                for (var i=0; i < node.form.length; i++) {
                    node.form[i].setAttribute('submitter', null); // clear the others out, to be safe
                }
                node.setAttribute('submitter', '1');
                break;
            }
            node = node.parentNode;
        }
    }

    function RequestEvents__findOwningAgent(node) {
        while (node) {
            if (node.classList.contains('agent')) {
                return node.id.substring(6); // agent-foobar -> foobar
            }
            node = node.parentNode;
        }
        return null;
    }

    function RequestEvents__extractLinkFromAnchor(node, observed_elem) {
        while (node && node != observed_elem) {
            // filter to the link in this element stack
            if (node.tagName != 'A') { 
                node = node.parentNode;
                continue;
            }

            var uri = node.attributes.href.value;
            var accept = node.getAttribute('type');

            if (uri == null || uri == '') { uri = '/'; }
            if (!accept) { accept = 'application/html+json'; }

            return { method:'get', uri:uri, accept:accept };
        }
        return null;
    }

    function RequestEvents__extractLinkFromForm(form) {
        var target_uri, enctype, method;

        // :NOTE: a lot of default browser behaviour has to (?) be emulated here

        // Serialize the data
        var data = {};
        for (var i=0; i < form.length; i++) {
            var elem = form[i];
            // Pull value if it has one
            if (elem.value) {
                // don't pull from buttons unless recently clicked
                if (elem.tagName == 'button' || (elem.tagName == 'input' && (elem.type == 'button' || elem.type == 'submit')) ){
                    if (elem.getAttribute('submitter')) {
                        data[elem.name] = elem.value;
                    }
                } else {
                    data[elem.name] = elem.value;
                }
            }
            // If was recently clicked, pull its request attributes-- it's our submitter
            if (elem.getAttribute('submitter') == '1') {
                target_uri = elem.getAttribute('formaction');
                enctype = elem.getAttribute('formenctype');
                method = elem.getAttribute('formmethod');
                elem.setAttribute('submitter', '0');
            }
        }

        // If no element gave request attributes, pull them from the form
        if (!target_uri) { target_uri = form.getAttribute('action'); }
        if (!enctype) { enctype = form.enctype; }
        if (!method) { method = form.getAttribute('method'); }

        // Strip the base URI
        var base_uri = window.location.href.split('#')[0];
        if (target_uri.indexOf(base_uri) != -1) {
            target_uri = target_uri.substring(base_uri.length);
            if (target_uri.charAt(0) != '/') { target_uri = '/' + target_uri; }
        }

        var request = {
            method:method,
            uri:target_uri,
            accept:'application/html+json'
        };
        if (form.acceptCharset) { request.accept = form.acceptCharset; }

        // Build request body
        if (method == 'get') {
            var qparams = [];
            for (var k in data) {
                qparams.push(k + '=' + data[k]);
            }
            if (qparams.length) {
                target_uri += '?' + qparams.join('&');
                request.uri = target_uri;
            }
        } else {
            request.body = data;
            request['content-type'] = enctype;
        }

        return request;
    }

    return RequestEvents;
});
