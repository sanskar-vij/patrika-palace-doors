(() => {
  'use strict';
  const w = window.WEDDING,
    $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  // Visible copy is editable alongside names, dates and events.
  document.querySelectorAll('[data-copy]').forEach((element) => {
    const value = w.copy?.[element.dataset.copy];
    if (typeof value === 'string') element.textContent = value;
  });
  const names = w.pages.map((page) => page.title);
  const pages = $$('.scene'),
    car = $('.travelling-car');
  let page = 0,
    locked = false,
    lastFocus,
    activeEvent = 0,
    photo = 0,
    attending = true,
    response = '';
  const positions = [
    { left: 24, top: 64, width: 53, rotate: 0 },
    { left: 9, top: 56, width: 47, rotate: -8 },
    { left: 17, top: 65, width: 51, rotate: 3 },
    { left: 39, top: 84, width: 22, rotate: 0 },
    { left: 21, top: 65, width: 50, rotate: -5 },
    { left: 23, top: 59, width: 54, rotate: 0 },
    { left: 16, top: 66, width: 50, rotate: 3 },
    { left: 31, top: 68, width: 44, rotate: 0 },
  ];

  // Content and colours come from src/data/content.ts; behaviour stays in this file.
  Object.entries(w.theme).forEach(([name, value]) =>
    document.documentElement.style.setProperty('--' + name, value)
  );
  w.pages.forEach((config, index) => {
    const section = document.getElementById(config.id);
    section.querySelector('.scene-title').textContent =
      String(index + 1).padStart(2, '0') + ' ' + config.title.toUpperCase();
    const subtitle = section.querySelector('.scene-subtitle');
    if (subtitle) {
      subtitle.textContent = config.subtitle;
      subtitle.style.whiteSpace = 'pre-line';
    }
    const image = section.querySelector('.backdrop');
    image.src = config.background;
    image.alt = config.alt;
  });
  w.gallery.forEach((config, index) => {
    const button = document.querySelectorAll('[data-photo]')[index];
    button.querySelector('img').src = config.src;
    button.querySelector('img').alt = config.alt;
    button.querySelector('span').textContent = config.caption;
  });

  function text(selector, value) {
    $$(selector).forEach((e) => (e.textContent = value));
  }
  text('[data-bride]', w.bride);
  text('[data-groom]', w.groom);
  text('[data-date]', w.dateLabel);
  text('[data-venue]', w.venue);
  text('[data-location]', w.location);
  $('#venue-map').href = w.mapsUrl;
  document.title = `${w.bride} & ${w.groom} · A Palace Journey`;
  // Dialog helpers: open, close, and return keyboard focus.
  function open(d) {
    lastFocus = document.activeElement;
    d.showModal();
  }
  function close(d) {
    d.close();
    lastFocus?.focus();
  }
  $$('dialog .close').forEach((b) => (b.onclick = () => close(b.closest('dialog'))));
  // Navigation uses normal vertical scrolling; it does not capture the wheel.
  function menu(opened) {
    $('.journey-menu').hidden = !opened;
    $('.menu-button').setAttribute('aria-expanded', String(opened));
    $('.menu-button').setAttribute(
      'aria-label',
      opened ? 'Close journey menu' : 'Open journey menu'
    );
    if (opened) $('.journey-menu button').focus();
  }
  $('.menu-button').onclick = () => menu($('.journey-menu').hidden);
  function go(i) {
    i = Math.max(0, Math.min(7, i));
    menu(false);
    pages[i].scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  }
  const motionMode = w.car.mode;
  // Car routes are editable in src/data/content.ts. Rendering is handled below.
  const tracks = w.car.paths;
  // Shape-preserving curves keep the wheels on the traced road without abrupt
  // clamping at each waypoint. Arc-length lookup removes segment speed changes.
  const routeCache = new WeakMap();
  function roadPoint(points, t) {
    let route = routeCache.get(points);
    if (!route) {
      const slopes = points[0].map((_, k) => {
        const differences = points.slice(1).map((p, i) => p[k] - points[i][k]);
        return points.map((_, i) => {
          if (i === 0) return differences[0];
          if (i === points.length - 1) return differences[differences.length - 1];
          const a = differences[i - 1], b = differences[i];
          return a * b <= 0 ? 0 : 2 * a * b / (a + b);
        });
      });
      const valueAt = (position) => {
        const scaled = Math.max(0, Math.min(1, position)) * (points.length - 1);
        const i = Math.min(points.length - 2, Math.floor(scaled));
        const u = scaled - i, u2 = u * u, u3 = u2 * u;
        return points[0].map((_, k) =>
          (2 * u3 - 3 * u2 + 1) * points[i][k] +
          (u3 - 2 * u2 + u) * slopes[k][i] +
          (-2 * u3 + 3 * u2) * points[i + 1][k] +
          (u3 - u2) * slopes[k][i + 1]);
      };
      const distances = [0];
      let previous = valueAt(0);
      for (let i = 1; i <= 320; i++) {
        const next = valueAt(i / 320);
        distances.push(distances[i - 1] + Math.hypot(next[0] - previous[0], (next[1] - previous[1]) * 1.5));
        previous = next;
      }
      route = { valueAt, distances, total: distances[320] };
      routeCache.set(points, route);
    }
    const tClamped = Math.max(0, Math.min(1, t));
    if (route.total < 0.0001) return route.valueAt(tClamped);
    const distance = tClamped * route.total;
    let low = 0, high = 320;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (route.distances[mid] < distance) low = mid; else high = mid;
    }
    const fraction = (distance - route.distances[low]) / (route.distances[high] - route.distances[low] || 1);
    return route.valueAt((low + fraction) / 320);
  }
  let motionScroll = scrollY, scrollVelocity = 0;
  // Critically damped motion eases velocity changes without cutting road bends.
  function smoothScrollStep(position, velocity, target, elapsedMs, responseMs) {
    const elapsed = Math.max(0, elapsedMs) / 1000;
    const frequency = 3 / (Math.max(80, responseMs) / 1000);
    const offset = position - target;
    const change = (velocity + frequency * offset) * elapsed;
    const decay = Math.exp(-frequency * elapsed);
    return {
      position: target + (offset + change) * decay,
      velocity: (velocity - frequency * change) * decay,
    };
  }
  // The first scene welcomes the car from the foreground once the doors reveal it.
  let arrivalStarted = null, arrivalProgress = 1;
  const arrivalEnterMs = Math.max(1, w.car.arrivalEnterMs ?? 2000);
  const arrivalDriveMs = Math.max(1, w.car.arrivalDriveMs ?? 4000);
  const arrivalDuration = arrivalEnterMs + arrivalDriveMs;
  function startInvitationArrival() {
    motionScroll = scrollY;
    scrollVelocity = 0;
    arrivalProgress = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0;
    arrivalStarted = arrivalProgress === 1 ? null : performance.now();
    schedule();
  }

  car.hidden = true;
  const sceneCars = pages.map((scene, i) => {
    const img = document.createElement('img');
    img.className = 'scene-car';
    img.src = w.car.image;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    // Fixed geometry; each frame changes only the composited transform.
    img.style.left = '0';
    img.style.top = '0';
    img.style.width = '200px';
    img.style.transformOrigin = '0 0';
    scene.append(img);
    return img;
  });
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  // Draw the cars and update route progress for the current scroll position.
  function updateScroll() {
    // Read the current scene dimensions so resizing keeps the route aligned.
    const rects = pages.map((section) => section.getBoundingClientRect());
    const dimensions = pages.map((section) => ({ width: section.clientWidth, height: section.clientHeight }));
    const centre = scrollY + innerHeight / 2;
    const centres = rects.map((rect) => rect.top + scrollY + rect.height / 2);
    let progress = 0;
    for (let i = 0; i < pages.length - 1; i++) {
      if (centre >= centres[i])
        progress = i + clamp((centre - centres[i]) / (centres[i + 1] - centres[i]));
    }
    progress = Math.max(0, Math.min(pages.length - 1, progress));
    sceneCars.forEach((img, i) => {
      const rect = rects[i];
      const height = rect.height;
      if (pages[i].id === 'gallery' || rect.top >= innerHeight || rect.bottom <= 0) {
        img.style.visibility = 'hidden';
        return;
      }
      img.style.visibility = 'visible';
      const t = clamp((innerHeight * 0.5 - rect.top) / height);
      let x, y, width, rotation, opacity;
      if (motionMode === 'road') {
        const sceneT = clamp(
          (innerHeight * 0.5 - (rect.top + scrollY - motionScroll)) / height
        );
        // A shorter, eased journey keeps the car visible at both ends of each road.
        let roadT = (w.car.travelStart ?? 0.08) + sceneT * ((w.car.travelEnd ?? 0.88) - (w.car.travelStart ?? 0.08));
        const image = pages[i].querySelector('.backdrop');
        const cw = dimensions[i].width, ch = dimensions[i].height;
        const fit = image.naturalWidth ? Math.max(cw / image.naturalWidth, ch / image.naturalHeight) : 1;
        const dw = (image.naturalWidth || cw) * fit, dh = (image.naturalHeight || ch) * fit;
        const key = [cw,ch,image.naturalWidth,image.naturalHeight].join(':');
        if (img.dataset.routeKey !== key) {
          const valid = [];
          for (let s = 0; s <= 100; s++) {
            const [px,py] = roadPoint(tracks[i], s / 100);
            const vx = px / 100 * dw - (dw - cw) / 2;
            const vy = py / 100 * dh - (dh - ch) / 2;
            if (vx > 20 && vx < cw - 20 && vy > ch * 0.12 && vy < ch * 0.98) valid.push(s / 100);
          }
          img.dataset.routeKey = key;
          img.routeRange = valid.length ? [valid[0],valid[valid.length - 1]] : [0.35,0.65];
        }
        roadT = Math.max(img.routeRange[0], Math.min(img.routeRange[1], roadT));
        if (i === 0 && arrivalProgress < 1) {
          const driveProgress = clamp((arrivalProgress * arrivalDuration - arrivalEnterMs) / arrivalDriveMs);
          roadT = img.routeRange[0] + (roadT - img.routeRange[0]) * smooth(driveProgress);
        }
        [x, y, width, rotation] = roadPoint(tracks[i], roadT);
        // Paths are measured on the source artwork. Match its object-fit: cover crop.
        const background = pages[i].querySelector('.backdrop');
        const sceneWidth = dimensions[i].width;
        const sceneHeight = dimensions[i].height;
        if (
          background.naturalWidth &&
          background.naturalHeight
        ) {
          const scale = Math.max(
            sceneWidth / background.naturalWidth,
            sceneHeight / background.naturalHeight
          );
          const drawnWidth = background.naturalWidth * scale;
          const drawnHeight = background.naturalHeight * scale;
          x =
            (((x / 100) * drawnWidth - (drawnWidth - sceneWidth) / 2) / sceneWidth) * 100;
          y =
            (((y / 100) * drawnHeight - (drawnHeight - sceneHeight) / 2) / sceneHeight) *
            100;
          width *= drawnWidth / sceneWidth;
        }
        width = Math.max(w.car.minimumWidth ?? 12, width * (w.car.sizeScale ?? 1.02));
        // Start below the frame and drive forward onto the existing road curve.
        if (i === 0 && arrivalProgress < 1) {
          const enterProgress = clamp(arrivalProgress * arrivalDuration / arrivalEnterMs);
          y += 38 * (1 - smooth(enterProgress));
        }
        opacity = 1;
      } else {
        const p = positions[i];
        const entry = clamp(t / 0.38),
          exit = clamp((t - 0.62) / 0.38);
        const ein = smooth(entry),
          eout = smooth(exit);
        x = -25 + (p.left + p.width / 2 + 25) * ein + 80 * eout;
        y = 96 + (p.top + 12 - 96) * ein - 40 * eout;
        width = p.width * (0.8 + 0.2 * ein - 0.5 * eout);
        rotation = p.rotate + -12 * (1 - ein) + 12 * eout;
        opacity = clamp(entry * 3) * clamp((1 - exit) * 3);
      }
      img.style.opacity = opacity;
      const scale = width / 100 * dimensions[i].width / 200;
      img.style.transform = 'translate3d(' + (x / 100 * dimensions[i].width) + 'px,' +
        (y / 100 * dimensions[i].height) + 'px,0) rotate(' + rotation + 'deg) scale(' + scale + ') translate(-43%,-94%)';
    });
    page = Math.round(progress);
    $('.route-car').style.left = (progress / 7) * 100 + '%';
    $('.route-fill').style.width = (progress / 7) * 100 + '%';
    $$('.route-stops button').forEach((el, n) =>
      el.setAttribute('aria-current', String(n === page))
    );
    text('.current', String(page + 1).padStart(2, '0'));
    text(
      '.page-indicator',
      String(page + 1).padStart(2, '0') + ' / 08 · ' + names[page].toUpperCase()
    );
    $$('.previous').forEach((el) => (el.disabled = page === 0));
    $$('.next').forEach((el) => (el.disabled = page === 7));
  }
  names.forEach((name, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', 'Go to ' + name);
    b.setAttribute('aria-current', String(i === 0));
    b.onclick = () => go(i);
    $('.route-stops').append(b);
    const m = document.createElement('button');
    const n = document.createElement('span');
    n.textContent = String(i + 1).padStart(2, '0');
    m.append(n, document.createTextNode(name));
    m.onclick = () => go(i);
    $('.journey-menu').append(m);
  });
  $$('.previous').forEach((b) => (b.onclick = () => go(page - 1)));
  $$('.next').forEach((b) => (b.onclick = () => go(page + 1)));
  $('.begin').onclick = () => go(1);
  pages.forEach((el) => {
    el.inert = false;
    el.classList.add('active');
  });
  let animationFrame = 0,
    lastFrame = 0;
  // Time-based smoothing behaves consistently across different screen refresh rates.
  function animateScroll(time) {
    const dt = Math.min(50, time - (lastFrame || time - 16));
    lastFrame = time;
    const target = scrollY;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (arrivalStarted !== null) {
      arrivalProgress = reduced ? 1 : clamp((time - arrivalStarted) / arrivalDuration);
      if (arrivalProgress === 1) arrivalStarted = null;
    }
    if (reduced) {
      motionScroll = target;
      scrollVelocity = 0;
    } else {
      const next = smoothScrollStep(motionScroll, scrollVelocity, target, dt, w.car.smoothingMs);
      motionScroll = next.position;
      scrollVelocity = next.velocity;
    }
    const moving = Math.abs(target - motionScroll) > 0.05 || Math.abs(scrollVelocity) > 0.5;
    if (!moving) { motionScroll = target; scrollVelocity = 0; }
    updateScroll();
    if (moving || arrivalStarted !== null)
      animationFrame = requestAnimationFrame(animateScroll);
    else {
      animationFrame = 0;
      lastFrame = 0;
    }
  }
  function schedule() {
    if (!animationFrame) animationFrame = requestAnimationFrame(animateScroll);
  }
  // Recalculate the traced road after uncached artwork finishes loading.
  pages.forEach((section) => {
    const background = section.querySelector('.backdrop');
    if (!background.complete) background.addEventListener('load', schedule, { once: true });
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => {
    motionScroll = scrollY;
    scrollVelocity = 0;
    schedule();
  });
  schedule();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('dialog[open]')) menu(false);
  });
  // Story, guest-guide, and celebration popups.
  function detail(label, title, copy) {
    $('#detail-label').textContent = label;
    $('#detail-title').textContent = title;
    $('#detail-copy').textContent = copy;
    $('#detail-calendar').hidden = true;
    open($('#detail-dialog'));
  }
  const stories = w.stories;
  $$('[data-story]').forEach(
    (b) => (b.onclick = () => detail(...stories[Number(b.dataset.story)]))
  );
  function eventDate(e) {
    return new Date(new Date(w.date).getTime() + (e.dayOffset || 0) * 86400000);
  }
  // Swipeable celebration invitations. Data stays in content.ts; no automatic cycling.
  const eventList = $('#events');
  eventList.className = 'celebration-carousel';
  eventList.setAttribute('role', 'region');
  eventList.setAttribute('aria-label', 'Wedding celebrations. Swipe cards or choose a ceremony.');
  const hasSchedule = (event) =>
    !event.dateTBC && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(event.time || '');
  function openEvent(index) {
    const event = w.events[index];
    activeEvent = index;
    const schedule = hasSchedule(event)
      ? eventDate(event).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }) + ' · ' + event.time
      : 'Date and time to be announced';
    detail(event.name.toUpperCase(), event.title || event.name,
      [event.description, schedule, event.place, event.attire ? 'Dress: ' + event.attire : ''].filter(Boolean).join('\n\n'));
    $('#detail-calendar').hidden = !hasSchedule(event);
  }
  const ceremonyArt = {
    MEHNDI: ['M24 39V22c0-4 5-4 5 0v9-17c0-4 5-4 5 0v17-14c0-4 5-4 5 0v15-10c0-4 5-4 5 0v18c0 11-20 14-25 2l-6-9c-2-4 3-6 6-2l5 7', 'A little colour. A lifetime of love.'],
    MAYRA: ['M14 27h36v26H14zM11 22h42v9H11zM32 22v31M32 22c-23-1-14-23 0 0 14-23 23-1 0 0', 'Blessings, wrapped in tradition.'],
    HALDI: ['M18 38h28c-2 18-26 18-28 0ZM32 9v5M12 19l4 4M52 19l-4 4M22 31a10 10 0 0 1 20 0M7 31h6M51 31h6', 'Golden moments, glowing hearts.'],
    SHAGUN: ['M13 39h38M17 40c2 14 28 14 30 0M32 37c-15-8-9-18 0-27 9 9 15 19 0 27ZM21 22c-10 4-9 13 2 16M43 22c10 4 9 13-2 16', 'An auspicious beginning.'],
    COCKTAIL: ['M12 14h40L32 35ZM32 35v17M22 52h20M22 14l16 12M44 10l-9 19', 'A toast to everything ahead.'],
    SANGEET: ['M24 41V16l25-5v26M24 25l25-5M24 41c0 10-17 10-17 3s17-10 17-3M49 37c0 10-17 10-17 3s17-10 17-3', 'Our kind of rhythm. Our kind of night.'],
    TILAK: ['M19 32a13 13 0 0 1 26 0v17H19ZM25 49V32M39 49V32M29 13h6M32 10v6M25 56h14', 'A promise blessed by tradition.'],
    ENGAGEMENT: ['M24 29a14 14 0 1 0 16 0M23 14l9-6 9 6-9 14ZM23 14h18M28 14l4 14 4-14', 'One question. A beautiful forever.'],
    BARAAT: ['M16 46V30l11-7 10 8h12v15M18 46v10M29 46v10M44 46v10M49 46v10M37 31V16l7-5 8 12-4 8M37 16l-3-7M44 11l3-5M16 30l-7 10M27 23V12M22 12h10', 'Make way for a grand arrival.'],
    WEDDING: ['M10 49h44M15 49V25M49 49V25M12 25h40L32 11ZM22 49V31h20v18M26 16l6-10 6 10M32 31v18', 'Two hearts. One beautiful beginning.'],
    VARMALA: ['M17 14c-8 28 0 41 15 41 15 0 23-13 15-41M17 14c12 9 18 9 30 0M14 25l7 1M15 37l8-2M20 48l7-5M50 25l-7 1M49 37l-8-2M44 48l-7-5', 'Choosing each other, all over again.'],
    PHERAS: ['M13 51h38M19 45h26M24 39h16M32 37c-16-7-6-17-2-27 1 11 17 15 7 25M25 56l14-11M25 45l14 11', 'Seven steps towards forever.'],
    RECEPTION: ['M12 17h17v12c0 11-17 11-17 0ZM35 17h17v12c0 11-17 11-17 0ZM20 37v16M43 37v16M13 53h14M36 53h14M29 22l6 5M29 12l6-5', 'The beginning deserves a celebration.'],
    VIDAI: ['M12 39l9-12h22l9 12v13H12ZM16 39h32M22 27l3-7h14l4 7M18 45h3M43 45h3M17 52v5M47 52v5M28 12c-6-6-13 4 4 11 17-7 10-17 4-11l-4 4Z', 'New journeys. The same love.'],
    ROKA: ['M25 28c-19-19-30 8 7 25 37-17 26-44 7-25l-7 7ZM20 15l4 5M44 15l-4 5M32 9v7', 'Where our forever first begins.']
  };
  function makeNode(tag, className, textValue) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = textValue;
    return node;
  }
  if (!w.events.length) {
    eventList.append(makeNode('p', 'events-empty', 'Our celebrations are being planned. Details coming soon.'));
  } else {
    const track = makeNode('div', 'event-track');
    track.tabIndex = 0;
    track.setAttribute('aria-label', 'Swipe left or right to explore celebrations');
    const navigation = makeNode('div', 'event-navigation');
    const previous = makeNode('button', 'event-arrow', '←');
    previous.setAttribute('aria-label', 'Previous celebration');
    const counter = makeNode('span', 'event-counter');
    counter.setAttribute('aria-live', 'polite');
    const next = makeNode('button', 'event-arrow', '→');
    next.setAttribute('aria-label', 'Next celebration');
    navigation.append(previous, counter, next);
    const picker = makeNode('nav', 'event-picker');
    picker.setAttribute('aria-label', 'Choose a celebration');
    const cards = [], chips = [];
    let selected = -1, scrollFrame = 0;
    w.events.forEach((event, index) => {
      const key = event.name.trim().toUpperCase();
      const art = ceremonyArt[key] || ceremonyArt.WEDDING;
      const card = makeNode('button', 'event-card');
      card.type = 'button';
      card.setAttribute('aria-label', 'Explore ' + event.name);
      const seal = makeNode('span', 'event-seal');
      seal.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 64 64');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', art[0]);
      svg.append(path); seal.append(svg);
      const ordinal = makeNode('span', 'event-ordinal', (w.copy.celebrationLabel || 'Celebration') + ' ' + String(index + 1).padStart(2, '0'));
      const title = makeNode('strong', 'event-name', event.name);
      const flourish = makeNode('span', 'event-flourish', '✦');
      flourish.setAttribute('aria-hidden', 'true');
      const tagline = makeNode('span', 'event-tagline', event.tagline || art[1]);
      const date = makeNode('span', 'event-date', hasSchedule(event)
        ? eventDate(event).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }) + ' · ' + event.time
        : 'Date to be announced');
      const action = makeNode('span', 'event-discover', 'Discover the celebration ↗');
      card.append(ordinal, seal, title, flourish, tagline, date, action);
      card.onclick = () => openEvent(index);
      track.append(card); cards.push(card);
      const chip = makeNode('button', 'event-chip', event.name);
      chip.type = 'button';
      chip.setAttribute('aria-label', 'Show ' + event.name);
      chip.onclick = () => select(index, true);
      picker.append(chip); chips.push(chip);
    });
    eventList.append(track, navigation, picker);
    function select(index, moveTrack) {
      index = Math.max(0, Math.min(cards.length - 1, index));
      if (selected !== index) {
        selected = index;
        cards.forEach((card, i) => card.classList.toggle('is-selected', i === index));
        chips.forEach((chip, i) => chip.setAttribute('aria-pressed', String(i === index)));
        counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
        previous.disabled = index === 0; next.disabled = index === cards.length - 1;
        picker.scrollTo({ left: chips[index].offsetLeft - picker.clientWidth / 2 + chips[index].offsetWidth / 2,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      if (moveTrack) track.scrollTo({ left: cards[index].offsetLeft - (track.clientWidth - cards[index].offsetWidth) / 2,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    previous.onclick = () => select(selected - 1, true);
    next.onclick = () => select(selected + 1, true);
    track.addEventListener('scroll', () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        let nearest = 0, distance = Infinity;
        cards.forEach((card, i) => {
          const delta = Math.abs(card.offsetLeft + card.offsetWidth / 2 - track.scrollLeft - track.clientWidth / 2);
          if (delta < distance) { nearest = i; distance = delta; }
        });
        select(nearest, false);
      });
    }, { passive: true });
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); select(selected + (event.key === 'ArrowRight' ? 1 : -1), true);
      }
    });
    addEventListener('resize', () => select(selected, true));
    select(0, true);
  }
  const guides = w.guestGuide;
  $$('[data-guide]').forEach(
    (b) => (b.onclick = () => detail(...guides[Number(b.dataset.guide)]))
  );
  // Gallery viewer: use the same configured images as the visible photo grid.
  const photos = $$('[data-photo]');
  function showPhoto(i) {
    photo = (i + photos.length) % photos.length;
    $('#photo-dialog>img').src = w.gallery[photo].src;
    $('#photo-dialog>img').alt = photos[photo].querySelector('img').alt;
    $('#photo-index').textContent = `${photo + 1} / ${photos.length}`;
  }
  photos.forEach(
    (b, i) =>
      (b.onclick = () => {
        showPhoto(i);
        open($('#photo-dialog'));
      })
  );
  $('#photo-prev').onclick = () => showPhoto(photo - 1);
  $('#photo-next').onclick = () => showPhoto(photo + 1);
  $('#photo-dialog').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showPhoto(photo - 1);
    if (e.key === 'ArrowRight') showPhoto(photo + 1);
  });
  function download(content, name, type) {
    const u = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  // Calendar export: all event times currently use Indian Standard Time.
  function calendar(event) {
    let start = new Date(w.date);
    if (event) {
      const match = event.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return;
      const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
      start = new Date(
        `${w.date.slice(0, 10)}T${String(hour).padStart(2, '0')}:${match[2]}:00+05:30`
      );
      start = new Date(+start + (event.dayOffset || 0) * 86400000);
    }
    const stamp = (date) =>
      date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const escape = (value) =>
      String(value)
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Patrika Studio//Wedding Journey//EN',
      'BEGIN:VEVENT',
      `UID:${+start}-${event?.name || 'wedding'}@patrika-template`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(+start + 10800000))}`,
      `SUMMARY:${escape(w.bride + ' & ' + w.groom + ' - ' + (event?.name || 'Wedding'))}`,
      `LOCATION:${escape(event?.place || w.venue)}`,
      'DESCRIPTION:Sample invitation. Confirm details with hosts.',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ];
    download(lines.join('\r\n'), 'wedding-date.ics', 'text/calendar');
  }
  $('.calendar-button').onclick = () => {
  const start = new Date(w.date);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  const formatDate = (date) =>
    date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${w.bride} & ${w.groom} — Wedding`,
    dates: `${formatDate(start)}/${formatDate(end)}`,
    location: `${w.venue}, ${w.location}`,
    details: 'Join us to celebrate our wedding!',
    stz: 'Asia/Kolkata',
    etz: 'Asia/Kolkata',
  });

  window.open(
    `https://calendar.google.com/calendar/r/eventedit?${params}`,
    '_blank',
    'noopener,noreferrer'
  );
};
  $('#detail-calendar').onclick = () => calendar(w.events[activeEvent]);
  // RSVP demonstration: preview and download only; no network submission.
  $$('[data-rsvp]').forEach(
    (b) =>
      (b.onclick = () => {
        attending = b.dataset.rsvp === 'yes';
        $('#rsvp-heading').textContent = attending
          ? 'We can’t wait.'
          : 'You’ll be missed.';
        $('#guest-label').hidden = !attending;
        $('#rsvp-form').hidden = false;
        $('#response').hidden = true;
        open($('#rsvp-dialog'));
      })
  );
  $('#rsvp-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    response = `${f.get('name')}\n${attending ? 'Joyfully accepting' : 'Regretfully declining'}\nGuests: ${attending ? f.get('guests') : 0}\n${f.get('note') || ''}\n\n${w.bride} & ${w.groom} · ${w.dateLabel}\nTemplate preview — not submitted.`;
    $('#response-text').textContent = response;
    $('#rsvp-form').hidden = true;
    $('#response').hidden = false;
  };
  $('#download-rsvp').onclick = () => download(response, 'my-rsvp.txt', 'text/plain');
  // Use the timezone-aware wedding date from src/data/content.ts.
  function countdownParts(weddingDate, now = Date.now()) {
    const difference = new Date(weddingDate).getTime() - now;
    const seconds = Number.isFinite(difference) ? Math.max(0, Math.floor(difference / 1000)) : 0;
    return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24,
      Math.floor(seconds / 60) % 60, seconds % 60];
  }
  function tick() {
    const values = countdownParts(w.date);
    values.forEach((value, i) => {
      $('#' + ['days', 'hours', 'minutes', 'seconds'][i]).textContent = String(value).padStart(2, '0');
    });
    $('#days-label').textContent = values[0] === 1 ? w.copy.countdownDay : w.copy.countdownDays;
  }
  tick();
  setInterval(tick, 1000);

  const initial = pages.findIndex((p) => '#' + p.id === location.hash);
  if (initial > 0) go(initial);

  // Flowers and leaves are independent transparent layers. Pause offscreen animations.
  function setupBotanicals() {
    const config = w.botanicals;
    if (!config?.enabled) return;
    const motionScale = config.motionScale ?? 1;
    document.documentElement.style.setProperty('--botanical-motion-scale', motionScale);
    document.documentElement.style.setProperty(
      '--botanical-sway',
      config.swayDegrees * motionScale + 'deg'
    );
    document.documentElement.style.setProperty(
      '--botanical-duration',
      config.durationSeconds + 's'
    );
    pages.forEach((section, pageIndex) => {
      const layer = document.createElement('div');
      layer.className = 'botanical-layer';
      layer.setAttribute('aria-hidden', 'true');
      ['left', 'right'].forEach((side) => {
        const cluster = document.createElement('img');
        cluster.src = side === 'left' ? 'assets/000010.png' : 'assets/flowers-right.png';
        cluster.alt = '';
        cluster.className = 'botanical-cluster botanical-' + side;
        cluster.style.animationDelay = -(pageIndex * 1.2) + 's';
        layer.append(cluster);
      });
      for (let i = 0; i < config.leavesPerPage; i++) {
        const leaf = document.createElement('img');
        leaf.src = i % 2 ? 'assets/leaf-stem.png' : 'assets/leaf-sprig.png';
        leaf.alt = '';
        leaf.className = 'botanical-sprig sprig-' + (i % 3);
        leaf.style.animationDelay = -(i * 1.7 + pageIndex) + 's';
        layer.append(leaf);
      }
      for (let i = 0; i < config.petalsPerPage; i++) {
        const petal = document.createElement('span');
        petal.className = 'drifting-petal' + (config.floatingLeaves !== false && i % 4 === 0 ? ' drifting-leaf' : '');
        petal.style.left = ((i * 31 + pageIndex * 13) % 94) + 3 + '%';
        petal.style.setProperty('--drift', (i % 2 ? 42 : -35) * motionScale + 'px');
        petal.style.animationDuration = 13 + (i % 5) * 2 + 's';
        petal.style.animationDelay = -(i * 2.3 + pageIndex) + 's';
        layer.append(petal);
      }
      section.append(layer);
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            entry.target.classList.toggle('botanicals-visible', entry.isIntersecting);
          }),
        { rootMargin: '80px' }
      );
      pages.forEach((section) => observer.observe(section));
    } else pages.forEach((section) => section.classList.add('botanicals-visible'));
  }
  setupBotanicals();

  // Background music: best-effort autoplay, a first-tap fallback, and explicit pause.
  // This Audio instance belongs only to this document, with no worker/background player.
  function setupMusic() {
    const config = w.audio;
    const button = document.querySelector('.music-toggle');
    if (!config?.enabled || !config.src || !button) return;
    const audio = new Audio(config.src);
    audio.id = 'invitation-audio';
    audio.preload = 'auto';
    audio.loop = config.loop !== false;
    audio.volume = Math.max(0, Math.min(1, Number(config.volume ?? 0.32) || 0));
    audio.setAttribute('playsinline', '');
    audio.hidden = true;
    document.body.append(audio);
    button.hidden = false;
    let pausedByVisitor = false;
    let resumeOnVisible = false;
    let leaving = false;
    let playPending = false;
    let scrollRequested = false;
    const startsOnScroll = config.startOn === 'scroll';
    const startsAtEntrance = config.startOn === 'entrance';
    const label = button.querySelector('[data-music-label]');
    const icon = button.querySelector('.music-icon');
    function render() {
      const playing = !audio.paused && !audio.ended;
      label.textContent = playing ? 'Pause music' : 'Play music';
      icon.classList.toggle('is-playing', playing);
      button.setAttribute('aria-label', label.textContent);
      button.setAttribute('aria-pressed', String(playing));
    }
    async function play() {
      if (pausedByVisitor || leaving || document.hidden || playPending) return;
      playPending = true;
      try {
        await audio.play();
        // A page-hide or pause may have happened while play() was pending.
        if (pausedByVisitor || leaving || document.hidden) audio.pause();
      } catch {
        // Scroll alone may not unlock sound; the next tap or wheel button can.
      } finally {
        playPending = false;
      }
      render();
    }
    button.addEventListener('click', () => {
      if (audio.paused) {
        pausedByVisitor = false;
        play();
      } else {
        pausedByVisitor = true;
        resumeOnVisible = false;
        audio.pause();
      }
      render();
    });
    function autoPlay() {
      if (config.autoplay !== false && audio.paused && !pausedByVisitor) play();
    }
    function isMusicButton(event) {
      return event.target instanceof Element && event.target.closest('.music-toggle');
    }
    function scrollIntent(event) {
      if (!event.isTrusted || isMusicButton(event)) return;
      scrollRequested = true;
      autoPlay();
    }
    if (startsOnScroll) {
      window.addEventListener('wheel', (event) => {
        if (event.deltaY) scrollIntent(event);
      }, { passive: true });
      let touchY = null;
      window.addEventListener('touchstart', (event) => {
        touchY = event.touches[0]?.clientY ?? null;
      }, { passive: true });
      window.addEventListener('touchmove', (event) => {
        if (touchY !== null && event.touches[0] && Math.abs(event.touches[0].clientY - touchY) > 8) scrollIntent(event);
      }, { passive: true });
      window.addEventListener('scroll', () => {
        if (scrollRequested) autoPlay();
      }, { passive: true });
      window.addEventListener('keydown', (event) => {
        const editing = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]');
        if (!editing && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) scrollIntent(event);
      });
      // iOS may allow playback on touchend even when touchmove was rejected.
      function finishGesture(event) {
        if (scrollRequested && !isMusicButton(event)) autoPlay();
      }
      window.addEventListener('touchend', finishGesture, { passive: true });
      window.addEventListener('pointerup', finishGesture, { passive: true });
    } else if (!startsAtEntrance) {
      function firstGesture(event) {
        if (isMusicButton(event)) return;
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        autoPlay();
      }
      document.addEventListener('pointerdown', firstGesture, { passive: true });
      document.addEventListener('keydown', firstGesture);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (!audio.paused) resumeOnVisible = !pausedByVisitor;
        audio.pause();
      } else if (resumeOnVisible && !leaving) {
        resumeOnVisible = false;
        play();
      }
    });
    window.addEventListener('pagehide', () => {
      leaving = true;
      scrollRequested = false;
      resumeOnVisible = false;
      audio.pause();
      audio.currentTime = 0;
    });
    window.addEventListener('pageshow', (event) => {
      leaving = false;
      if (event.persisted && !startsOnScroll && !startsAtEntrance && config.autoplay !== false) play();
    });
    for (const event of ['play', 'pause', 'ended', 'error']) audio.addEventListener(event, render);
    render();
    if (!startsOnScroll && !startsAtEntrance && config.autoplay !== false) play();
    return { start: () => { pausedByVisitor = false; return play(); }, pause: () => { pausedByVisitor = true; resumeOnVisible = false; audio.pause(); } };
  }
  const music = setupMusic();
  setupEntrance(music);
  function setupEntrance(player) {
    const entrance = document.querySelector('#palace-entrance');
    const website = document.querySelector('#invitation-site');
    if (!entrance || !w.entrance?.enabled) {
      entrance?.remove();
      document.body.classList.remove('has-palace-intro');
      if (website) website.inert = false;
      startInvitationArrival();
      return;
    }
    if (website) website.inert = true;
    const start = entrance.querySelector('.entrance-car');
    const silent = entrance.querySelector('.entrance-silent');
    const promptButton = entrance.querySelector('.entrance-instructions');
    entrance.querySelector('[data-entrance-kicker]').textContent = w.entrance.kicker;
    entrance.querySelector('[data-entrance-prompt]').textContent = w.entrance.prompt;
    entrance.querySelector('[data-entrance-caption]').textContent = w.entrance.caption;
    silent.textContent = w.entrance.silentLabel;
    const entranceArt = new URL(w.entrance.background, document.baseURI).href;
    entrance.style.setProperty('--palace-art', 'url("' + entranceArt.replaceAll('"', '%22') + '")');
    let opening = false, revealTimer, removeTimer;
    function enter(withMusic) {
      if (opening) return;
      opening = true;
      // This call is synchronous inside a real tap, before any timer/animation.
      if (withMusic) player?.start(); else player?.pause();
      start.disabled = true; silent.disabled = true; promptButton.disabled = true;
      entrance.classList.add('is-opening');
      entrance.setAttribute('aria-busy', 'true');
      document.querySelector('#entrance-status').textContent = 'The palace doors are opening. Welcome to our wedding invitation.';
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      revealTimer = setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.body.classList.remove('has-palace-intro');
        if (website) website.inert = false;
        entrance.classList.add('is-finished');
        const heading = document.querySelector('#invitation h2');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
        startInvitationArrival();
        removeTimer = setTimeout(() => entrance.remove(), reduced ? 170 : 550);
      }, reduced ? 250 : Math.max(2400, w.entrance.durationMs || 2500));
    }
    start.addEventListener('click', () => enter(true));
    promptButton.addEventListener('click', () => enter(true));
    silent.addEventListener('click', () => enter(false));
    start.focus({ preventScroll: true });
    window.addEventListener('pagehide', () => { clearTimeout(revealTimer); clearTimeout(removeTimer); });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && opening) {
        entrance.remove(); document.body.classList.remove('has-palace-intro');
        if (website) website.inert = false;
      }
    });
  }
})();

