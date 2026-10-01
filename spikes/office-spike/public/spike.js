/* Phase 0 Office spike. Throwaway diagnostics, see spikes/office-spike/README.md.
 * Plain browser JavaScript (no build step) so it runs unchanged in WebView2 (Windows)
 * and WKWebView (Mac). Every observation is shown on screen and sent to the spike
 * server (POST /log), so instances that are not visible still report what they saw. */
(function () {
  'use strict';

  var boot = window.__spikeBoot || { t0: Date.now(), historyBefore: {} };

  var SETTINGS_KEY = 'pulseSpike';
  var BIG_KEY = 'pulseSpikeBig';
  var HB_PREFIX = 'pulseSpike.hb.';
  var TAG_KEY = 'PULSE_SPIKE';
  var PROP_KEY = 'PulseSpike';
  var XML_NS = 'urn:pulse:spike';
  var PPT_TIMEOUT_MS = 8000;

  var nonce = makeId();
  var SHORT = nonce.slice(0, 8);

  var state = {
    officeReady: false,
    host: null,
    platform: null,
    version: null,
    displayLanguage: null,
    view: typeof Office === 'undefined' ? 'no-office' : 'unknown',
    current: null,
    currentIds: [],
    currentIndex: null,
    loadSlide: null,
    slideError: null,
    settings: null,
    onScreen: false,
    onScreenByLoad: false,
    copy: null,
    sameItem: { all: 0, edit: 0 },
    server: 'unknown',
    fps: null,
    counts: { view: 0, sel: 0, poll: 0, storage: 0, bc: 0, click: 0, key: 0 },
    probes: {},
    instances: [],
    ls: null,
    showPanel: false,
    firstInteractionDone: false,
    config: null,
    readyAt: 0,
    autoReadDone: false,
  };

  // -------------------------------------------------------------------------
  // Utilities

  function $(id) {
    return document.getElementById(id);
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function randomValue() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function shortJson(value, max) {
    var text;
    try {
      text = JSON.stringify(value);
    } catch (e) {
      text = String(value);
    }
    if (text === undefined) text = String(value);
    max = max || 200;
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  function errInfo(e) {
    if (!e) return null;
    if (typeof e === 'string') return { message: e };
    var out = { name: e.name, code: e.code, message: String(e.message || e).slice(0, 300) };
    if (e.debugInfo) {
      out.debugInfo = {
        code: e.debugInfo.code,
        message: e.debugInfo.message,
        errorLocation: e.debugInfo.errorLocation,
        statement: e.debugInfo.statement,
      };
    }
    return out;
  }

  function frameInfo() {
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      dpr: window.devicePixelRatio,
      screenW: window.screen ? window.screen.width : null,
      screenH: window.screen ? window.screen.height : null,
    };
  }

  // -------------------------------------------------------------------------
  // Remote log

  var logSeq = 0;
  var queue = [];
  var recent = [];
  var flushing = false;

  function log(kind, data) {
    logSeq += 1;
    var entry = {
      nonce: nonce,
      seq: logSeq,
      t: new Date().toISOString(),
      ms: Math.round(performance.now()),
      kind: kind,
      data: data === undefined ? null : data,
    };
    queue.push(entry);
    if (queue.length > 3000) queue.splice(0, queue.length - 3000);
    recent.unshift(entry);
    if (recent.length > 80) recent.length = 80;
    try {
      console.log('[spike]', kind, data);
    } catch (e) {
      /* console may be unavailable */
    }
    scheduleRender();
  }

  function setServer(next) {
    if (state.server === next) return;
    state.server = next;
    log('server', { state: next, queued: queue.length });
  }

  function flush() {
    if (flushing || queue.length === 0) return;
    flushing = true;
    var batch = queue.slice(0, 500);
    fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      cache: 'no-store',
    })
      .then(function (res) {
        if (res.ok) {
          queue.splice(0, batch.length);
          setServer('up');
        } else {
          setServer('down');
        }
      })
      .catch(function () {
        setServer('down');
      })
      .then(function () {
        flushing = false;
      });
  }

  function flushBeacon(reason) {
    log('lifecycle', { event: reason, visibility: document.visibilityState });
    if (!navigator.sendBeacon || queue.length === 0) return;
    try {
      var blob = new Blob([JSON.stringify(queue.slice(0, 500))], { type: 'application/json' });
      if (navigator.sendBeacon('/log', blob)) queue.splice(0, Math.min(queue.length, 500));
    } catch (e) {
      /* best effort */
    }
  }

  function ping() {
    fetch('/ping', { cache: 'no-store' })
      .then(function (res) {
        setServer(res.ok ? 'up' : 'down');
      })
      .catch(function () {
        setServer('down');
      });
  }

  // -------------------------------------------------------------------------
  // Probes

  function record(name, result) {
    state.probes[name] = { result: result, at: new Date().toISOString() };
    log('probe.' + name, result);
  }

  function officeAsync(call) {
    return new Promise(function (resolve) {
      try {
        call(function (r) {
          if (r.status === Office.AsyncResultStatus.Succeeded) resolve({ ok: true, value: r.value });
          else resolve({ ok: false, error: errInfo(r.error) });
        });
      } catch (e) {
        resolve({ ok: false, error: errInfo(e) });
      }
    });
  }

  function pptAvailable() {
    return typeof PowerPoint !== 'undefined' && PowerPoint && typeof PowerPoint.run === 'function';
  }

  function ppt(name, fn) {
    if (!pptAvailable()) {
      record(name, { ok: false, error: 'PowerPoint.run not available (typeof PowerPoint = ' + typeof PowerPoint + ')' });
      return Promise.resolve(undefined);
    }
    var started = performance.now();
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error('timeout after ' + PPT_TIMEOUT_MS + ' ms'));
      }, PPT_TIMEOUT_MS);
    });
    // Wrapped so that a synchronous throw (missing API on older builds) becomes a rejection.
    var run = new Promise(function (resolve) {
      resolve(PowerPoint.run(fn));
    });
    return Promise.race([run, timeout]).then(
      function (value) {
        record(name, { ok: true, value: value, ms: Math.round(performance.now() - started) });
        return value;
      },
      function (e) {
        record(name, { ok: false, error: errInfo(e), ms: Math.round(performance.now() - started) });
        return undefined;
      },
    );
  }

  function lsProbe() {
    try {
      localStorage.setItem('pulseSpike.probe', String(Date.now()));
      var roundTrip = localStorage.getItem('pulseSpike.probe') !== null;
      var firstSeen = localStorage.getItem('pulseSpike.firstSeen');
      var existed = !!firstSeen;
      if (!firstSeen) {
        firstSeen = new Date().toISOString();
        localStorage.setItem('pulseSpike.firstSeen', firstSeen);
      }
      var loads = Number(localStorage.getItem('pulseSpike.loads') || 0) + 1;
      localStorage.setItem('pulseSpike.loads', String(loads));
      return { ok: roundTrip, firstSeen: firstSeen, existedBefore: existed, loadsOnThisDevice: loads };
    } catch (e) {
      return { ok: false, error: errInfo(e) };
    }
  }

  function navigationInfo() {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (!nav) return null;
      return { type: nav.type, transferSize: nav.transferSize, workerStart: Math.round(nav.workerStart) };
    } catch (e) {
      return null;
    }
  }

  function collectEnv() {
    return {
      ua: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      search: location.search.slice(0, 300),
      path: location.pathname,
      frame: frameInfo(),
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      officeScriptLoaded: typeof Office !== 'undefined',
      bootToScriptMs: Date.now() - boot.t0,
      historyBefore: boot.historyBefore,
      localStorage: state.ls,
      broadcastChannel: typeof BroadcastChannel !== 'undefined',
      indexedDB: typeof indexedDB !== 'undefined',
      webSocket: typeof WebSocket !== 'undefined',
      clipboard: !!(navigator.clipboard && navigator.clipboard.writeText),
      serviceWorker: 'serviceWorker' in navigator,
      swControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      navigation: navigationInfo(),
    };
  }

  function probeRequirementSets() {
    var sets = [
      ['ActiveView', '1.1'],
      ['DocumentEvents', '1.1'],
      ['Settings', '1.1'],
      ['Selection', '1.1'],
      ['File', '1.1'],
      ['ImageCoercion', '1.1'],
      ['OpenBrowserWindowApi', '1.1'],
      ['DialogApi', '1.1'],
      ['DialogApi', '1.2'],
      ['SharedRuntime', '1.1'],
    ];
    for (var v = 1; v <= 10; v++) sets.push(['PowerPointApi', '1.' + v]);
    var out = {};
    sets.forEach(function (s) {
      try {
        out[s[0] + ' ' + s[1]] = Office.context.requirements.isSetSupported(s[0], s[1]);
      } catch (e) {
        out[s[0] + ' ' + s[1]] = 'error: ' + (e && e.message);
      }
    });
    record('reqsets', out);
  }

  // -------------------------------------------------------------------------
  // Settings (per add-in instance, stored in the document)

  function getSettings() {
    try {
      return Office.context.document.settings.get(SETTINGS_KEY) || null;
    } catch (e) {
      log('settings.get.error', errInfo(e));
      return null;
    }
  }

  function baseSettings() {
    return {
      v: 1,
      itemId: makeId(),
      createdAt: new Date().toISOString(),
      createdBy: SHORT,
      boundSlideId: null,
      value: null,
      valueWrittenAt: null,
      copiedFrom: null,
    };
  }

  function loadSettings(trigger) {
    var s = getSettings();
    state.settings = s;
    var big = null;
    try {
      big = Office.context.document.settings.get(BIG_KEY);
    } catch (e) {
      /* ignore */
    }
    log('settings.read', {
      trigger: trigger,
      present: !!s,
      settings: s,
      bound: s ? s.boundSlideId : null,
      bigLength: typeof big === 'string' ? big.length : null,
    });
    evaluateOnScreen('settings:' + trigger);
    return s;
  }

  function saveSettings(reason, value) {
    try {
      Office.context.document.settings.set(SETTINGS_KEY, value);
    } catch (e) {
      log('settings.set.error', { reason: reason, error: errInfo(e) });
      return Promise.resolve(false);
    }
    state.settings = value;
    return officeAsync(function (cb) {
      Office.context.document.settings.saveAsync(cb);
    }).then(function (r) {
      log('settings.save', {
        reason: reason,
        ok: r.ok,
        error: r.error,
        itemId: value.itemId,
        bound: value.boundSlideId,
        value: value.value,
      });
      evaluateOnScreen('settings:' + reason);
      return r.ok;
    });
  }

  function saveRaw(reason, mutate) {
    try {
      mutate(Office.context.document.settings);
    } catch (e) {
      log('settings.raw.error', { reason: reason, error: errInfo(e) });
      return Promise.resolve(false);
    }
    return officeAsync(function (cb) {
      Office.context.document.settings.saveAsync(cb);
    }).then(function (r) {
      log('settings.save', { reason: reason, ok: r.ok, error: r.error });
      return r.ok;
    });
  }

  // -------------------------------------------------------------------------
  // View and slide identity

  function setView(view, trigger) {
    var prev = state.view;
    state.view = view;
    log('view', { view: view, prev: prev, trigger: trigger, bound: state.settings ? state.settings.boundSlideId : null });
    evaluateOnScreen('view:' + trigger);
    if (view === 'read' && state.config && state.config.auto && !state.autoReadDone) {
      state.autoReadDone = true;
      setTimeout(runProbes, 1500);
    }
  }

  function refreshView(trigger) {
    return officeAsync(function (cb) {
      Office.context.document.getActiveViewAsync(cb);
    }).then(function (r) {
      if (r.ok) setView(r.value, trigger);
      else log('view.error', { trigger: trigger, error: r.error });
    });
  }

  var lastSlideKey = null;
  var slideBusy = false;

  function readSlide(trigger) {
    if (!state.officeReady || !state.host) return Promise.resolve(null);
    if (trigger === 'poll' && slideBusy) return Promise.resolve(null);
    slideBusy = true;
    return officeAsync(function (cb) {
      Office.context.document.getSelectedDataAsync(Office.CoercionType.SlideRange, cb);
    }).then(function (r) {
      slideBusy = false;
      if (trigger === 'poll') state.counts.poll += 1;
      if (!r.ok) {
        var errKey = 'err:' + (r.error && r.error.code);
        if (errKey !== lastSlideKey || trigger !== 'poll') {
          log('slide.error', { trigger: trigger, view: state.view, error: r.error });
        }
        lastSlideKey = errKey;
        state.slideError = r.error;
        state.current = null;
        state.currentIds = [];
        evaluateOnScreen(trigger);
        return null;
      }
      var slides = (r.value && r.value.slides) || [];
      var ids = slides.map(function (s) { return s.id; });
      var indexes = slides.map(function (s) { return s.index; });
      var key = ids.join('+');
      state.slideError = null;
      state.currentIds = ids;
      state.current = ids.length === 1 ? ids[0] : null;
      state.currentIndex = indexes.length === 1 ? indexes[0] : null;
      if (state.loadSlide === null && state.current !== null) state.loadSlide = state.current;
      if (key !== lastSlideKey || trigger !== 'poll') {
        log('slide', {
          trigger: trigger,
          view: state.view,
          ids: ids,
          indexes: indexes,
          visibility: document.visibilityState,
          fps: state.fps,
        });
      }
      lastSlideKey = key;
      evaluateOnScreen(trigger);
      return state.current;
    });
  }

  // The activation rule from master prompt §6.6, plus a variant that binds to the
  // slide seen at load time (to learn whether load-time selection is reliable).
  function evaluateOnScreen(trigger) {
    var bound = state.settings ? state.settings.boundSlideId : null;
    var on = state.view === 'read' && bound !== null && bound !== undefined && state.current === bound;
    var onByLoad = state.view === 'read' && state.loadSlide !== null && state.current === state.loadSlide;
    if (on !== state.onScreen || onByLoad !== state.onScreenByLoad) {
      state.onScreen = on;
      state.onScreenByLoad = onByLoad;
      log('activation', {
        onScreen: on,
        onScreenByLoad: onByLoad,
        trigger: trigger,
        view: state.view,
        bound: bound,
        loadSlide: state.loadSlide,
        current: state.current,
        visibility: document.visibilityState,
        fps: state.fps,
      });
    }
    scheduleRender();
  }

  // Copy detection from master prompt §6.5. 'load' only reports; a click in edit view writes.
  function bindCheck(trigger) {
    if (!state.officeReady || !state.host) return Promise.resolve();
    return readSlide('bind:' + trigger).then(function (cur) {
      var s = state.settings;
      var info = {
        trigger: trigger,
        view: state.view,
        current: cur,
        currentIds: state.currentIds,
        itemId: s ? s.itemId : null,
        bound: s ? s.boundSlideId : null,
      };
      if (cur === null) {
        info.reason = state.currentIds.length > 1 ? 'multiple slides selected' : 'no slide';
        log('bind.skip', info);
        return;
      }
      if (!s) {
        info.reason = 'no settings';
        log('bind.skip', info);
        return;
      }
      var mayWrite = state.view === 'edit' && trigger !== 'load';
      if (s.boundSlideId === null || s.boundSlideId === undefined) {
        if (!mayWrite) {
          log('bind.unbound', info);
          return;
        }
        var bound = Object.assign({}, s, { boundSlideId: cur });
        return saveSettings('bind.first', bound).then(function () {
          info.bound = cur;
          log('bind.first', info);
        });
      }
      if (s.boundSlideId === cur) {
        log('bind.ok', info);
        return;
      }
      state.copy = { trigger: trigger, oldItemId: s.itemId, oldBound: s.boundSlideId, current: cur, at: Date.now() };
      log('bind.copyDetected', info);
      if (!mayWrite) return;
      var newItemId = makeId();
      var forked = Object.assign({}, s, { itemId: newItemId, copiedFrom: s.itemId, boundSlideId: cur });
      return saveSettings('bind.fork', forked).then(function () {
        info.newItemId = newItemId;
        info.bound = cur;
        log('bind.forked', info);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Cross-instance signals (localStorage heartbeat + BroadcastChannel)

  var bc = null;
  var bcPeers = {};
  var lsErrorLogged = false;
  var lastSameKey = '';

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('pulse-spike');
      bc.onmessage = function (ev) {
        var msg = ev.data;
        if (!msg || msg.nonce === nonce) return;
        state.counts.bc += 1;
        if (state.counts.bc === 1) log('bc.first', { from: String(msg.nonce).slice(0, 8) });
        bcPeers[msg.nonce] = msg;
      };
    }
  } catch (e) {
    log('bc.error', errInfo(e));
  }

  window.addEventListener('storage', function (ev) {
    if (!ev.key || ev.key.indexOf(HB_PREFIX) !== 0 || ev.key === HB_PREFIX + nonce) return;
    state.counts.storage += 1;
    if (state.counts.storage === 1) log('storage.first', { from: ev.key.slice(HB_PREFIX.length, HB_PREFIX.length + 8) });
  });

  function heartbeat() {
    var now = Date.now();
    var me = {
      nonce: nonce,
      view: state.view,
      itemId: state.settings ? state.settings.itemId : null,
      bound: state.settings ? state.settings.boundSlideId : null,
      current: state.current,
      onScreen: state.onScreen,
      platform: state.platform,
      t: now,
    };
    try {
      localStorage.setItem(HB_PREFIX + nonce, JSON.stringify(me));
    } catch (e) {
      if (!lsErrorLogged) log('ls.hb.error', errInfo(e));
      lsErrorLogged = true;
    }
    if (bc) {
      try {
        bc.postMessage(me);
      } catch (e) {
        /* ignore */
      }
    }
    var peers = {};
    try {
      var stale = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(HB_PREFIX) !== 0) continue;
        var v = null;
        try {
          v = JSON.parse(localStorage.getItem(k));
        } catch (e) {
          v = null;
        }
        if (!v || typeof v.t !== 'number') continue;
        if (now - v.t > 60000) {
          stale.push(k);
          continue;
        }
        v.via = 'ls';
        peers[v.nonce] = v;
      }
      stale.forEach(function (key) {
        localStorage.removeItem(key);
      });
    } catch (e) {
      /* logged once above */
    }
    Object.keys(bcPeers).forEach(function (n) {
      var p = bcPeers[n];
      if (now - p.t > 60000) {
        delete bcPeers[n];
        return;
      }
      if (peers[n]) peers[n].via = 'ls+bc';
      else peers[n] = Object.assign({}, p, { via: 'bc' });
    });
    state.instances = Object.keys(peers)
      .map(function (n) { return peers[n]; })
      .sort(function (a, b) { return b.t - a.t; });

    // Fallback duplicate detection (§6.5): another live instance with the same item id.
    var mine = state.settings ? state.settings.itemId : null;
    var same = state.instances.filter(function (o) {
      return o.nonce !== nonce && mine && o.itemId === mine && now - o.t < 5000;
    });
    var sameEdit = same.filter(function (o) {
      return o.view === 'edit' && state.view === 'edit';
    });
    state.sameItem = { all: same.length, edit: sameEdit.length };
    var sameKey = same
      .map(function (o) { return o.nonce + ':' + o.view + ':' + o.current; })
      .sort()
      .join(',');
    if (sameKey !== lastSameKey) {
      lastSameKey = sameKey;
      log('hb.sameItem', {
        count: same.length,
        editCount: sameEdit.length,
        myView: state.view,
        others: same.map(function (o) {
          return { n: o.nonce.slice(0, 8), view: o.view, bound: o.bound, current: o.current, via: o.via };
        }),
      });
    }
    scheduleRender();
  }

  // -------------------------------------------------------------------------
  // Render meter: rAF ticks per second (0 when the webview is not rendering).

  var frames = 0;
  function rafTick() {
    frames += 1;
    window.requestAnimationFrame(rafTick);
  }
  window.requestAnimationFrame(rafTick);
  setInterval(function () {
    var fps = frames;
    frames = 0;
    var active = fps > 0;
    if (state.fps === null || state.fps > 0 !== active) {
      log('render', { active: active, fps: fps, visibility: document.visibilityState, view: state.view, onScreen: state.onScreen });
    }
    state.fps = fps;
    scheduleRender();
  }, 1000);

  // -------------------------------------------------------------------------
  // PowerPoint API (document-level store, shapes)

  function readTag(ctx) {
    var t = ctx.presentation.tags.getItemOrNullObject(TAG_KEY);
    t.load('key,value');
    return ctx.sync().then(function () {
      return t.isNullObject ? { found: false } : { found: true, key: t.key, value: t.value };
    });
  }

  function writeTag(ctx) {
    var v = randomValue();
    ctx.presentation.tags.add(TAG_KEY, v);
    return ctx.sync().then(function () {
      return { wrote: v };
    });
  }

  function readProp(ctx) {
    var p = ctx.presentation.properties.customProperties.getItemOrNullObject(PROP_KEY);
    p.load('key,value,type');
    return ctx.sync().then(function () {
      return p.isNullObject ? { found: false } : { found: true, key: p.key, value: p.value, type: p.type };
    });
  }

  function writeProp(ctx) {
    var v = randomValue();
    ctx.presentation.properties.customProperties.add(PROP_KEY, v);
    return ctx.sync().then(function () {
      return { wrote: v };
    });
  }

  function readXml(ctx) {
    var parts = ctx.presentation.customXmlParts.getByNamespace(XML_NS);
    parts.load('items/id');
    return ctx.sync().then(function () {
      var xmls = parts.items.map(function (p) { return p.getXml(); });
      return ctx.sync().then(function () {
        return { count: parts.items.length, xml: xmls.map(function (x) { return x.value; }) };
      });
    });
  }

  function writeXml(ctx) {
    var parts = ctx.presentation.customXmlParts.getByNamespace(XML_NS);
    parts.load('items/id');
    return ctx.sync().then(function () {
      var replaced = parts.items.length;
      parts.items.forEach(function (p) { p.delete(); });
      var v = randomValue();
      var part = ctx.presentation.customXmlParts.add('<pulse xmlns="' + XML_NS + '"><value>' + v + '</value></pulse>');
      part.load('id');
      return ctx.sync().then(function () {
        return { wrote: v, id: part.id, replaced: replaced };
      });
    });
  }

  function currentSlideObject(ctx) {
    // getSelectedSlides needs PowerPointApi 1.5; fall back to the common-API index.
    var sel = ctx.presentation.getSelectedSlides();
    sel.load('items/id');
    return ctx.sync().then(
      function () {
        return sel.items.length > 0 ? { slide: sel.items[0], via: 'getSelectedSlides' } : null;
      },
      function () {
        if (!state.currentIndex) return null;
        var slide = ctx.presentation.slides.getItemAt(state.currentIndex - 1);
        slide.load('id');
        return ctx.sync().then(function () {
          return { slide: slide, via: 'common index' };
        });
      },
    );
  }

  function listShapes(ctx) {
    return currentSlideObject(ctx).then(function (found) {
      if (!found) return { slide: null };
      var shapes = found.slide.shapes;
      shapes.load('items/id,items/name,items/type,items/left,items/top,items/width,items/height');
      return ctx.sync().then(function () {
        return {
          slideId: found.slide.id,
          via: found.via,
          shapes: shapes.items.map(function (s) {
            return { id: s.id, name: s.name, type: s.type, left: s.left, top: s.top, width: s.width, height: s.height };
          }),
        };
      });
    });
  }

  function fitShape(slideId, shapeId) {
    var w = Number($('slide-w').value);
    var h = Number($('slide-h').value);
    return ppt('ppt.fitShape', function (ctx) {
      var shape = ctx.presentation.slides.getItem(slideId).shapes.getItem(shapeId);
      shape.left = 0;
      shape.top = 0;
      shape.width = w;
      shape.height = h;
      return ctx.sync().then(function () {
        shape.load('left,top,width,height');
        return ctx.sync().then(function () {
          return { shapeId: shapeId, left: shape.left, top: shape.top, width: shape.width, height: shape.height, frame: frameInfo() };
        });
      });
    });
  }

  function renderShapes(result) {
    var body = $('shapes-table').querySelector('tbody');
    body.textContent = '';
    if (!result || !result.shapes) return;
    result.shapes.forEach(function (s) {
      var tr = document.createElement('tr');
      [s.name, s.type, s.left + ',' + s.top, s.width + '×' + s.height].forEach(function (text) {
        var td = document.createElement('td');
        td.textContent = String(text);
        tr.appendChild(td);
      });
      var td = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary';
      btn.textContent = 'Fit to slide';
      btn.onclick = function () {
        fitShape(result.slideId, s.id).then(function () {
          return ppt('ppt.shapes', listShapes).then(renderShapes);
        });
      };
      td.appendChild(btn);
      tr.appendChild(td);
      body.appendChild(tr);
    });
  }

  function pageSetup(ctx) {
    var p = ctx.presentation.pageSetup;
    p.load('slideWidth,slideHeight');
    return ctx.sync().then(function () {
      return { slideWidth: p.slideWidth, slideHeight: p.slideHeight };
    });
  }

  function runProbes() {
    log('probes.start', { view: state.view });
    record('frame', frameInfo());
    if (!state.officeReady || !state.host) {
      record('office', { ok: false, view: state.view });
      return Promise.resolve();
    }
    probeRequirementSets();
    record('settings.current', getSettings());
    record('openBrowserWindow.available', !!(Office.context.ui && typeof Office.context.ui.openBrowserWindow === 'function'));
    record('ppt.namespace', { powerPointDefined: typeof PowerPoint !== 'undefined', runIsFunction: pptAvailable() });
    return refreshView('probe')
      .then(function () { return readSlide('probe'); })
      .then(function () {
        record('common.slideRange', { current: state.current, ids: state.currentIds, index: state.currentIndex, error: state.slideError });
      })
      .then(function () {
        return ppt('ppt.slides', function (ctx) {
          var slides = ctx.presentation.slides;
          slides.load('items/id');
          return ctx.sync().then(function () {
            return slides.items.map(function (s) { return s.id; }).slice(0, 60);
          });
        });
      })
      .then(function () {
        return ppt('ppt.selectedSlides', function (ctx) {
          var sel = ctx.presentation.getSelectedSlides();
          sel.load('items/id');
          return ctx.sync().then(function () {
            return sel.items.map(function (s) { return s.id; });
          });
        });
      })
      .then(function () { return ppt('ppt.tag.read', readTag); })
      .then(function () { return ppt('ppt.customProperty.read', readProp); })
      .then(function () { return ppt('ppt.customXml.read', readXml); })
      .then(function () { return ppt('ppt.pageSetup', pageSetup); })
      .then(function () { return ppt('ppt.shapes', listShapes).then(renderShapes); })
      .then(swStatus)
      .then(function () { log('probes.done', {}); });
  }

  // -------------------------------------------------------------------------
  // Service worker (offline test, master prompt principle 4)

  function swStatus() {
    var out = {
      supported: 'serviceWorker' in navigator,
      controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      cachesApi: typeof caches !== 'undefined',
    };
    if (!out.supported) {
      record('sw.status', out);
      return Promise.resolve();
    }
    return navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        out.registrations = regs.length;
        return typeof caches !== 'undefined' ? caches.keys() : [];
      })
      .then(function (keys) {
        out.caches = keys;
        var ctrl = navigator.serviceWorker.controller;
        if (!ctrl) return null;
        return new Promise(function (resolve) {
          var channel = new MessageChannel();
          var timer = setTimeout(function () { resolve(null); }, 1000);
          channel.port1.onmessage = function (ev) {
            clearTimeout(timer);
            resolve(ev.data);
          };
          ctrl.postMessage('status', [channel.port2]);
        });
      })
      .then(function (fromWorker) {
        out.worker = fromWorker;
        record('sw.status', out);
        $('sw-out').textContent = JSON.stringify(out, null, 2);
      })
      .catch(function (e) {
        out.error = errInfo(e);
        record('sw.status', out);
      });
  }

  function swRegister() {
    if (!('serviceWorker' in navigator)) {
      record('sw.register', { ok: false, error: 'navigator.serviceWorker is not available' });
      return Promise.resolve();
    }
    return navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (reg) {
        return navigator.serviceWorker.ready.then(function () {
          record('sw.register', { ok: true, scope: reg.scope });
        });
      })
      .catch(function (e) {
        record('sw.register', { ok: false, error: errInfo(e) });
      })
      .then(swStatus);
  }

  function swUnregister() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      })
      .then(function (results) {
        var keysP = typeof caches !== 'undefined' ? caches.keys() : Promise.resolve([]);
        return keysP.then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); })).then(function () {
            record('sw.unregister', { ok: true, unregistered: results.length, cachesDeleted: keys.length });
          });
        });
      })
      .catch(function (e) {
        record('sw.unregister', { ok: false, error: errInfo(e) });
      })
      .then(swStatus);
  }

  // -------------------------------------------------------------------------
  // Report (copy/paste fallback when the server log is not reachable)

  function buildReport() {
    var lines = [];
    lines.push('## Spike instance ' + SHORT);
    lines.push('');
    lines.push('- platform: ' + state.platform + ' · host: ' + state.host + ' · version: ' + state.version + ' · displayLanguage: ' + state.displayLanguage);
    lines.push('- view: ' + state.view + ' · slide now: ' + state.current + ' · bound: ' + (state.settings && state.settings.boundSlideId) + ' · item: ' + (state.settings && state.settings.itemId));
    lines.push('- localStorage: ' + shortJson(state.ls, 400));
    lines.push('- counts: ' + shortJson(state.counts, 400));
    lines.push('- live instances seen: ' + state.instances.length);
    lines.push('');
    lines.push('| probe | result |');
    lines.push('|---|---|');
    Object.keys(state.probes).forEach(function (k) {
      lines.push('| ' + k + ' | `' + shortJson(state.probes[k].result, 500).replace(/\|/g, '\\|') + '` |');
    });
    return lines.join('\n');
  }

  function copyReport() {
    var text = buildReport();
    log('report', { length: text.length });
    var area = $('report-out');
    var fallback = function () {
      area.hidden = false;
      area.value = text;
      area.focus();
      area.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      log('report.copy', { via: 'execCommand', ok: ok });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          log('report.copy', { via: 'clipboard', ok: true });
          area.hidden = false;
          area.value = text;
        },
        function (e) {
          log('report.copy', { via: 'clipboard', ok: false, error: errInfo(e) });
          fallback();
        },
      );
    } else {
      fallback();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering

  var renderPending = false;
  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    window.requestAnimationFrame(function () {
      renderPending = false;
      render();
    });
  }

  function statusText() {
    switch (state.view) {
      case 'read':
        return state.onScreen ? 'ON SCREEN' : 'OFF SCREEN';
      case 'edit':
        return 'EDIT VIEW';
      case 'no-office':
        return 'OFFICE.JS NOT LOADED';
      case 'no-host':
        return 'NOT RUNNING IN OFFICE';
      default:
        return 'WAITING FOR OFFICE';
    }
  }

  function bannerText() {
    var parts = [];
    if (state.copy) {
      parts.push('COPY DETECTED (' + state.copy.trigger + '): item was bound to slide ' + state.copy.oldBound + ', now on slide ' + state.copy.current + '.');
    }
    if (state.sameItem.edit > 0) parts.push('Same item id is live in ' + state.sameItem.edit + ' other edit-view instance(s).');
    else if (state.sameItem.all > 0) parts.push('Same item id is live in ' + state.sameItem.all + ' other instance(s).');
    if (state.platform === 'OfficeOnline') parts.push('PowerPoint on the web detected.');
    if (state.server === 'down') parts.push('Spike server unreachable; ' + queue.length + ' log entries queued.');
    if (state.view === 'read' && (!state.settings || state.settings.boundSlideId === null)) {
      parts.push('Not bound: click this frame once in edit view first.');
    }
    return parts.join(' ');
  }

  function render() {
    var cls = ['view-' + state.view];
    if (state.onScreen) cls.push('on-screen');
    if (state.showPanel) cls.push('show-panel');
    document.body.className = cls.join(' ');

    var s = state.settings;
    $('hud-status').textContent = statusText();
    var banner = bannerText();
    $('hud-banner').hidden = !banner;
    $('hud-banner').textContent = banner;
    $('h-instance').textContent = SHORT + ' · ' + (state.platform || '?');
    $('h-view').textContent = state.view;
    $('h-current').textContent =
      state.current !== null ? state.current + ' (#' + state.currentIndex + ')' : state.slideError ? 'error ' + state.slideError.code : state.currentIds.length > 1 ? state.currentIds.join('+') : '–';
    $('h-bound').textContent = s && s.boundSlideId !== null ? String(s.boundSlideId) : '–';
    $('h-item').textContent = s ? s.itemId.slice(0, 8) + (s.copiedFrom ? ' (from ' + s.copiedFrom.slice(0, 8) + ')' : '') : '–';
    $('h-value').textContent = s && s.value ? s.value : '–';
    $('h-server').textContent = state.server + (queue.length ? ' · queued ' + queue.length : '');
    $('h-render').textContent = 'fps ' + state.fps + ' · ' + document.visibilityState + ' · focus ' + document.hasFocus();
    $('h-events').textContent =
      'view ' + state.counts.view + ' sel ' + state.counts.sel + ' poll ' + state.counts.poll + ' ls ' + state.counts.storage + ' bc ' + state.counts.bc + ' key ' + state.counts.key;
    var f = frameInfo();
    $('h-frame').textContent = f.innerW + '×' + f.innerH + ' @' + f.dpr;
    $('btn-click-test').textContent = 'Click test (' + state.counts.click + ')';

    $('settings-out').textContent = s ? JSON.stringify(s, null, 2) : 'No settings in this instance.';
    $('slide-out').textContent = JSON.stringify(
      {
        current: state.current,
        currentIds: state.currentIds,
        index: state.currentIndex,
        loadSlide: state.loadSlide,
        bound: s ? s.boundSlideId : null,
        onScreen: state.onScreen,
        onScreenByLoad: state.onScreenByLoad,
        error: state.slideError,
        copy: state.copy,
      },
      null,
      2,
    );
    $('ls-out').textContent = JSON.stringify(
      { localStorage: state.ls, storageEvents: state.counts.storage, broadcastMessages: state.counts.bc, sameItem: state.sameItem },
      null,
      2,
    );

    var ib = $('instances-table').querySelector('tbody');
    ib.textContent = '';
    state.instances.forEach(function (o) {
      var tr = document.createElement('tr');
      [
        o.nonce.slice(0, 8) + (o.nonce === nonce ? ' (me)' : '') + ' ' + o.via,
        o.view,
        o.itemId ? o.itemId.slice(0, 8) : '–',
        o.bound,
        o.current,
        o.onScreen ? 'yes' : 'no',
        Math.round((Date.now() - o.t) / 1000) + ' s',
      ].forEach(function (text) {
        var td = document.createElement('td');
        td.textContent = String(text);
        tr.appendChild(td);
      });
      ib.appendChild(tr);
    });

    var pb = $('probe-table').querySelector('tbody');
    pb.textContent = '';
    Object.keys(state.probes).forEach(function (k) {
      var r = state.probes[k].result;
      var tr = document.createElement('tr');
      var name = document.createElement('td');
      name.textContent = k;
      var status = document.createElement('td');
      var ok = r && typeof r === 'object' && 'ok' in r ? r.ok : null;
      status.textContent = ok === null ? 'info' : ok ? 'ok' : 'fail';
      status.className = ok === null ? '' : ok ? 'ok' : 'fail';
      var value = document.createElement('td');
      value.textContent = shortJson(r, 400);
      tr.appendChild(name);
      tr.appendChild(status);
      tr.appendChild(value);
      pb.appendChild(tr);
    });

    $('log-out').textContent = recent
      .map(function (e) {
        return e.t.slice(11, 23) + ' ' + e.kind + ' ' + shortJson(e.data, 220);
      })
      .join('\n');
  }

  // -------------------------------------------------------------------------
  // Unattended mode (server started with --auto, used by automation/). Nobody can
  // click inside the frame from a script, so the instance does on load what the
  // checklist does by hand: bind, write a value, probe, fill the document stores.

  function fetchConfig() {
    return fetch('/config.json', { cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : {};
      })
      .catch(function () {
        return {};
      })
      .then(function (cfg) {
        state.config = cfg || {};
        log('config', state.config);
        return state.config;
      });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // Two identical single-slide reads 600 ms apart while the page is visible.
  function stableSlide() {
    var attempts = 0;
    function attempt() {
      return readSlide('auto').then(function (a) {
        return delay(600)
          .then(function () {
            return readSlide('auto');
          })
          .then(function (b) {
            if (a !== null && a === b && document.visibilityState === 'visible') return a;
            attempts += 1;
            return attempts < 5 ? attempt() : null;
          });
      });
    }
    return attempt();
  }

  function probeResult(name) {
    var p = state.probes[name];
    return p ? p.result : null;
  }

  function fillDocumentStores() {
    var tag = probeResult('ppt.tag.read');
    var prop = probeResult('ppt.customProperty.read');
    var xml = probeResult('ppt.customXml.read');
    var chain = Promise.resolve();
    if (tag && tag.ok && tag.value && tag.value.found === false) {
      chain = chain.then(function () { return ppt('ppt.tag.write', writeTag); });
    }
    if (prop && prop.ok && prop.value && prop.value.found === false) {
      chain = chain.then(function () { return ppt('ppt.customProperty.write', writeProp); });
    }
    if (xml && xml.ok && xml.value && xml.value.count === 0) {
      chain = chain.then(function () { return ppt('ppt.customXml.write', writeXml); });
    }
    return chain;
  }

  function autoRun() {
    log('auto.start', { view: state.view, config: state.config });
    var chain = Promise.resolve();
    if (state.view === 'edit') {
      chain = chain
        .then(stableSlide)
        .then(function (stable) {
          if (stable === null) {
            log('auto.skip', { reason: 'no stable single slide' });
            return;
          }
          if (Date.now() - state.readyAt > 12000) {
            log('auto.skip', { reason: 'more than 12 s after load', afterMs: Date.now() - state.readyAt });
            return;
          }
          return bindCheck('auto');
        })
        .then(function () {
          var s = state.settings;
          if (!s || (s.value && state.config.autoWrite !== 'always')) return;
          return saveSettings(
            'auto.write',
            Object.assign({}, s, { value: randomValue(), valueWrittenAt: new Date().toISOString(), valueWrittenBy: SHORT }),
          );
        });
    } else if (state.view === 'read') {
      state.autoReadDone = true;
    }
    return chain
      .then(runProbes)
      .then(function () {
        if (state.view === 'edit') return fillDocumentStores();
      })
      .then(function () {
        if (state.config.sw === 'register') return swRegister();
        if (state.config.sw === 'unregister') return swUnregister();
      })
      .then(function () {
        log('auto.done', { view: state.view, bound: state.settings ? state.settings.boundSlideId : null });
      });
  }

  // -------------------------------------------------------------------------
  // Wiring

  function on(id, handler) {
    $(id).addEventListener('click', function () {
      try {
        var r = handler();
        if (r && typeof r.catch === 'function') {
          r.catch(function (e) {
            log('js.error', { action: id, error: errInfo(e) });
          });
        }
      } catch (e) {
        log('js.error', { action: id, error: errInfo(e) });
      }
    });
  }

  function requireOffice() {
    if (state.officeReady && state.host) return true;
    log('action.skipped', { reason: 'not running in Office', view: state.view });
    return false;
  }

  function wire() {
    on('btn-click-test', function () {
      state.counts.click += 1;
      log('clickTest', { count: state.counts.click, view: state.view, onScreen: state.onScreen, hasFocus: document.hasFocus() });
    });
    var hover = $('hover-test');
    hover.addEventListener('mouseenter', function () {
      hover.classList.add('hovered');
      log('hover', { view: state.view });
    });
    hover.addEventListener('mouseleave', function () {
      hover.classList.remove('hovered');
    });
    on('btn-toggle-panel', function () {
      state.showPanel = !state.showPanel;
      scheduleRender();
    });

    on('btn-probes', runProbes);
    on('btn-report', copyReport);
    on('btn-browser', function () {
      if (!requireOffice()) return;
      try {
        Office.context.ui.openBrowserWindow(location.origin + '/logs');
        log('openBrowserWindow', { called: true });
      } catch (e) {
        log('openBrowserWindow', { called: false, error: errInfo(e) });
      }
    });
    on('btn-marker', function () {
      var input = $('marker');
      var text = input.value.trim();
      if (!text) return;
      log('marker', { text: text });
      input.value = '';
    });

    on('btn-set-write', function () {
      if (!requireOffice()) return;
      var next = Object.assign({}, state.settings || baseSettings(), {
        value: randomValue(),
        valueWrittenAt: new Date().toISOString(),
        valueWrittenBy: SHORT,
      });
      return saveSettings('write', next);
    });
    on('btn-set-read', function () {
      if (!requireOffice()) return;
      loadSettings('button');
    });
    on('btn-set-big', function () {
      if (!requireOffice()) return;
      return saveRaw('big.write', function (st) {
        st.set(BIG_KEY, new Array(50001).join('x'));
      });
    });
    on('btn-set-big-rm', function () {
      if (!requireOffice()) return;
      return saveRaw('big.remove', function (st) {
        st.remove(BIG_KEY);
      });
    });
    on('btn-set-newitem', function () {
      if (!requireOffice()) return;
      var prev = state.settings || baseSettings();
      return saveSettings('newItem', Object.assign({}, prev, { itemId: makeId(), copiedFrom: prev.itemId }));
    });

    on('btn-slide-read', function () {
      if (!requireOffice()) return;
      return readSlide('button');
    });
    on('btn-bind', function () {
      if (!requireOffice()) return;
      return bindCheck('button');
    });
    on('btn-unbind', function () {
      if (!requireOffice() || !state.settings) return;
      state.copy = null;
      return saveSettings('unbind', Object.assign({}, state.settings, { boundSlideId: null }));
    });

    on('btn-tag-w', function () { return ppt('ppt.tag.write', writeTag); });
    on('btn-tag-r', function () { return ppt('ppt.tag.read', readTag); });
    on('btn-prop-w', function () { return ppt('ppt.customProperty.write', writeProp); });
    on('btn-prop-r', function () { return ppt('ppt.customProperty.read', readProp); });
    on('btn-xml-w', function () { return ppt('ppt.customXml.write', writeXml); });
    on('btn-xml-r', function () { return ppt('ppt.customXml.read', readXml); });
    on('btn-shapes', function () {
      return ppt('ppt.shapes', listShapes).then(renderShapes);
    });

    on('btn-sw-reg', swRegister);
    on('btn-sw-unreg', swUnregister);
    on('btn-sw-status', swStatus);

    // §6.5: copy detection runs on the first interaction with the editor.
    document.addEventListener(
      'pointerdown',
      function () {
        if (state.firstInteractionDone || !state.officeReady || state.view !== 'edit') return;
        state.firstInteractionDone = true;
        bindCheck('click');
      },
      true,
    );

    document.addEventListener('keydown', function (ev) {
      var tag = ev.target && ev.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      state.counts.key += 1;
      log('key', { key: ev.key, code: ev.code, view: state.view, onScreen: state.onScreen });
    });

    document.addEventListener('visibilitychange', function () {
      log('lifecycle', { event: 'visibilitychange', visibility: document.visibilityState, view: state.view });
      if (document.visibilityState === 'hidden') flushBeacon('hidden');
    });
    window.addEventListener('focus', function () { log('lifecycle', { event: 'focus', view: state.view }); });
    window.addEventListener('blur', function () { log('lifecycle', { event: 'blur', view: state.view }); });
    window.addEventListener('pageshow', function (ev) { log('lifecycle', { event: 'pageshow', persisted: ev.persisted }); });
    window.addEventListener('pagehide', function () { flushBeacon('pagehide'); });
    window.addEventListener('beforeunload', function () { flushBeacon('beforeunload'); });
    document.addEventListener('freeze', function () { flushBeacon('freeze'); });
    document.addEventListener('resume', function () { log('lifecycle', { event: 'resume' }); });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        log('frame', frameInfo());
      }, 400);
    });

    window.addEventListener('error', function (ev) {
      log('js.error', { message: ev.message, source: ev.filename, line: ev.lineno });
    });
    window.addEventListener('unhandledrejection', function (ev) {
      log('js.unhandledRejection', errInfo(ev.reason));
    });
  }

  // -------------------------------------------------------------------------
  // Office startup

  function registerHandlers() {
    var doc = Office.context.document;
    return officeAsync(function (cb) {
      doc.addHandlerAsync(
        Office.EventType.ActiveViewChanged,
        function (args) {
          state.counts.view += 1;
          log('event.activeViewChanged', { activeView: args && args.activeView });
          setView(args && args.activeView, 'event');
          readSlide('viewChanged');
        },
        cb,
      );
    })
      .then(function (r) {
        record('handler.activeViewChanged', r);
        return officeAsync(function (cb) {
          doc.addHandlerAsync(
            Office.EventType.DocumentSelectionChanged,
            function () {
              state.counts.sel += 1;
              log('event.selectionChanged', { view: state.view });
              readSlide('selectionChanged');
            },
            cb,
          );
        });
      })
      .then(function (r) {
        record('handler.documentSelectionChanged', r);
        if (!doc.settings || typeof doc.settings.addHandlerAsync !== 'function' || !Office.EventType.SettingsChanged) {
          record('handler.settingsChanged', { ok: false, error: 'not available' });
          return;
        }
        return officeAsync(function (cb) {
          doc.settings.addHandlerAsync(
            Office.EventType.SettingsChanged,
            function () {
              log('event.settingsChanged', {});
              loadSettings('settingsChanged');
            },
            cb,
          );
        }).then(function (r2) {
          record('handler.settingsChanged', r2);
        });
      });
  }

  function onOfficeReady(info) {
    state.officeReady = true;
    state.readyAt = Date.now();
    state.host = info ? info.host : null;
    state.platform = info ? info.platform : null;
    var diag = Office.context && Office.context.diagnostics;
    state.version = diag ? diag.version : null;
    state.displayLanguage = Office.context ? Office.context.displayLanguage : null;

    var history_ = {
      before: boot.historyBefore,
      after: { pushState: typeof history.pushState, replaceState: typeof history.replaceState },
      restored: [],
    };
    if (typeof history.pushState !== 'function' && boot.pushStateRef) {
      history.pushState = boot.pushStateRef;
      history_.restored.push('pushState');
    }
    if (typeof history.replaceState !== 'function' && boot.replaceStateRef) {
      history.replaceState = boot.replaceStateRef;
      history_.restored.push('replaceState');
    }

    log('office.ready', {
      host: state.host,
      platform: state.platform,
      contextPlatform: Office.context ? Office.context.platform : null,
      version: state.version,
      diagHost: diag ? diag.host : null,
      displayLanguage: state.displayLanguage,
      contentLanguage: Office.context ? Office.context.contentLanguage : null,
      documentMode: Office.context && Office.context.document ? Office.context.document.mode : null,
      readyAfterMs: Date.now() - boot.t0,
      history: history_,
    });

    if (!state.host) {
      state.view = 'no-host';
      scheduleRender();
      return;
    }

    loadSettings('load');
    registerHandlers()
      .then(function () { return refreshView('load'); })
      .then(function () {
        if (!state.settings && state.view === 'edit') return saveSettings('create', baseSettings());
      })
      .then(function () { return readSlide('load'); })
      .then(function () { return bindCheck('load'); })
      .then(fetchConfig)
      .then(function (cfg) {
        if (cfg.auto) return autoRun();
        probeRequirementSets();
        return swStatus();
      })
      .catch(function (e) {
        log('js.error', { phase: 'startup', error: errInfo(e) });
      });

    setInterval(function () {
      if ($('chk-poll').checked) readSlide('poll');
    }, 1000);
  }

  state.ls = lsProbe();
  wire();
  log('env', collectEnv());
  setInterval(flush, 700);
  setInterval(ping, 5000);
  setInterval(heartbeat, 1000);
  ping();
  heartbeat();
  scheduleRender();

  if (typeof Office === 'undefined') {
    log('office.missing', { afterMs: Date.now() - boot.t0 });
    scheduleRender();
    return;
  }
  setTimeout(function () {
    if (!state.officeReady) log('office.timeout', { afterMs: Date.now() - boot.t0 });
  }, 15000);
  Office.onReady(onOfficeReady);
})();
