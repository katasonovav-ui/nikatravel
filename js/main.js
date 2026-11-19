/* ==========================================================================
   NikaTravel — інтерактивність сайту
   Модулі ініціалізуються лише тоді, коли на сторінці є потрібні елементи.
   ========================================================================== */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------------
     Утиліти
     ------------------------------------------------------------------------ */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  const storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* приватний режим */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  /** Відмінювання: plural(5, ['тур', 'тури', 'турів']) → 'турів' */
  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  /** Імітація відправки на сервер */
  function fakeRequest(data, delay = 1000) {
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true, data }), delay));
  }

  function setLoading(button, isLoading, loadingText = 'Надсилаємо…') {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
      button.classList.add('btn--loading');
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
      button.classList.remove('btn--loading');
    }
  }

  /* ------------------------------------------------------------------------
     Toast-повідомлення
     ------------------------------------------------------------------------ */
  const toast = (() => {
    let container;

    function ensureContainer() {
      if (container) return container;
      container = document.createElement('div');
      container.className = 'toasts';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
      return container;
    }

    return function show(message, type = 'success', duration = 4000) {
      const box = ensureContainer();
      const item = document.createElement('div');
      item.className = `toast toast--${type}`;
      item.innerHTML = '<span class="toast__text"></span><button class="toast__close" type="button" aria-label="Закрити повідомлення">×</button>';
      item.querySelector('.toast__text').textContent = message;
      box.appendChild(item);

      requestAnimationFrame(() => item.classList.add('toast--visible'));

      const remove = () => {
        item.classList.remove('toast--visible');
        setTimeout(() => item.remove(), 250);
      };
      item.querySelector('.toast__close').addEventListener('click', remove);
      setTimeout(remove, duration);
    };
  })();

  /* ------------------------------------------------------------------------
     Хедер: тінь при скролі
     ------------------------------------------------------------------------ */
  function initHeader() {
    const header = $('.header');
    if (!header) return;
    const update = () => header.classList.toggle('header--scrolled', window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  /* ------------------------------------------------------------------------
     Мобільне меню
     ------------------------------------------------------------------------ */
  function initMobileNav() {
    const toggle = $('#nav-toggle');
    const menu = $('#mobile-nav');
    const header = $('.header');
    if (!toggle || !menu) return;

    const sync = () => toggle.setAttribute('aria-expanded', String(toggle.checked));
    const close = () => {
      if (!toggle.checked) return;
      toggle.checked = false;
      sync();
    };

    sync();
    toggle.addEventListener('change', sync);

    // Закриваємо після вибору пункту
    $$('a', menu).forEach((link) => link.addEventListener('click', close));

    // Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.checked) {
        close();
        toggle.focus();
      }
    });

    // Клік поза меню
    document.addEventListener('click', (e) => {
      if (toggle.checked && header && !header.contains(e.target)) close();
    });

    // При переході на десктоп
    window.matchMedia('(min-width: 768px)').addEventListener?.('change', (e) => {
      if (e.matches) close();
    });
  }

  /* ------------------------------------------------------------------------
     Валідація форм
     ------------------------------------------------------------------------ */
  const RULES = {
    name: {
      test: (v) => /^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ'’ʼ\- ]+$/u.test(v),
      message: 'Ім\'я може містити лише літери, пробіл, апостроф або дефіс',
    },
    contact: {
      test: (value) => EMAIL_RE.test(value) ||
        /^(\+?38)?0\d{9}$/.test(value.replace(/[\s()-]/g, '')),
      message: 'Введіть коректний email або український номер телефону',
    },
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateField(field) {
    const value = field.type === 'checkbox' ? field.checked : field.value.trim();

    if (field.type === 'checkbox') {
      return field.required && !value ? 'Потрібна ваша згода' : '';
    }

    if (!value) {
      return field.required ? 'Це поле обов\'язкове' : '';
    }

    const min = Number(field.getAttribute('minlength'));
    const max = Number(field.getAttribute('maxlength'));
    if (min && value.length < min) {
      return `Мінімум ${min} ${plural(min, ['символ', 'символи', 'символів'])} (зараз ${value.length})`;
    }
    if (max && value.length > max) {
      return `Максимум ${max} ${plural(max, ['символ', 'символи', 'символів'])}`;
    }

    if (field.type === 'email' && !EMAIL_RE.test(value)) {
      return 'Введіть коректну адресу, наприклад you@example.com';
    }

    const rule = RULES[field.dataset.rule];
    if (rule && !rule.test(value)) return rule.message;

    return '';
  }

  function getErrorNode(field) {
    const id = `${field.id || field.name}-error`;
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('p');
      node.id = id;
      node.className = 'form__error';
      node.hidden = true;
      const anchor = field.closest('.subscribe, .form__check') || field;
      anchor.insertAdjacentElement('afterend', node);
      const describedBy = (field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (!describedBy.includes(id)) describedBy.push(id);
      field.setAttribute('aria-describedby', describedBy.join(' '));
    }
    return node;
  }

  function showFieldState(field, error) {
    const node = getErrorNode(field);
    const hasValue = field.type === 'checkbox' ? field.checked : field.value.trim() !== '';
    field.classList.toggle('is-invalid', Boolean(error));
    field.classList.toggle('is-valid', !error && hasValue);
    field.setAttribute('aria-invalid', String(Boolean(error)));
    node.textContent = error;
    node.hidden = !error;
  }

  /**
   * Підключає «живу» валідацію до форми.
   * Помилка показується після першого blur або спроби відправки,
   * далі поле перевіряється під час введення.
   */
  function attachValidation(form) {
    const fields = $$('input:not([type="hidden"]):not([type="submit"]), textarea, select', form)
      .filter((f) => f.required || f.dataset.rule || f.hasAttribute('minlength') || f.type === 'email');

    fields.forEach((field) => {
      const check = () => showFieldState(field, validateField(field));
      field.addEventListener('blur', () => {
        if (field.type !== 'checkbox' && field.value.trim() === '' && !field.dataset.touched) return;
        field.dataset.touched = 'true';
        check();
      });
      field.addEventListener(field.type === 'checkbox' ? 'change' : 'input', () => {
        if (field.dataset.touched) check();
      });
    });

    return {
      validate() {
        let firstInvalid = null;
        fields.forEach((field) => {
          field.dataset.touched = 'true';
          const error = validateField(field);
          showFieldState(field, error);
          if (error && !firstInvalid) firstInvalid = field;
        });
        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
      },
      reset() {
        form.reset();
        fields.forEach((field) => {
          delete field.dataset.touched;
          field.classList.remove('is-invalid', 'is-valid');
          field.removeAttribute('aria-invalid');
          const node = document.getElementById(`${field.id || field.name}-error`);
          if (node) node.hidden = true;
        });
      },
    };
  }

  /* ------------------------------------------------------------------------
     Контактна форма
     ------------------------------------------------------------------------ */
  function initContactForm() {
    const form = $('#contact-form');
    if (!form) return;

    const validator = attachValidation(form);
    const submitBtn = $('button[type="submit"]', form);
    const draftKey = 'nika:contact-draft';
    const draft = storage.get(draftKey, {});
    const tour = new URLSearchParams(location.search).get('tour');

    form.elements.name.value = draft.name || '';
    form.elements.contact.value = draft.contact || draft.email || draft.phone || '';
    form.elements.destination.value = (tour || draft.destination || '').slice(0, 100);
    form.elements.message.value = draft.message || '';

    form.addEventListener('input', debounce(() => {
      storage.set(draftKey, Object.fromEntries(new FormData(form)));
    }, 400));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validator.validate()) {
        toast('Перевірте, будь ласка, виділені поля', 'error');
        return;
      }

      const data = Object.fromEntries(new FormData(form));
      setLoading(submitBtn, true);
      try {
        await fakeRequest(data);
        const requests = storage.get('nika:requests', []);
        requests.push({ ...data, date: new Date().toISOString() });
        storage.set('nika:requests', requests);
        storage.remove(draftKey);
        validator.reset();
        toast('Демонстраційний запит збережено в цьому браузері.', 'success', 6000);
      } catch (err) {
        toast('Не вдалося надіслати. Спробуйте ще раз або зателефонуйте нам.', 'error');
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }

  /* ------------------------------------------------------------------------
     Підписка у футері
     ------------------------------------------------------------------------ */
  function initSubscribe() {
    const form = $('#subscribe-form');
    if (!form) return;

    const validator = attachValidation(form);
    const button = $('button[type="submit"]', form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validator.validate()) return;

      const email = form.elements.email.value.trim().toLowerCase();
      const list = storage.get('nika:subscribers', []);
      if (list.includes(email)) {
        toast('Ця адреса вже підписана на новини 🙂', 'info');
        return;
      }

      setLoading(button, true, '…');
      await fakeRequest(email, 700);
      list.push(email);
      storage.set('nika:subscribers', list);
      validator.reset();
      setLoading(button, false);
      toast('Готово! Ви підписались на новини NikaTravel.', 'success');
    });
  }

  /* ------------------------------------------------------------------------
     Кастомний випадаючий список (поверх нативного <select data-dropdown>)
     Нативний select лишається у формі як джерело значення.
     ------------------------------------------------------------------------ */
  const CHEVRON = '<svg class="dropdown__chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let openDropdown = null;

  function syncDropdown(select) {
    if (select && select._dropdownSync) select._dropdownSync();
  }

  function enhanceSelect(select, index) {
    const variant = select.dataset.dropdown || 'field';
    const id = select.id || `dropdown-${index}`;
    const label = document.querySelector(`label[for="${select.id}"]`);

    const wrap = document.createElement('div');
    wrap.className = `dropdown dropdown--${variant}`;
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('dropdown__native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dropdown__toggle';
    toggle.id = `${id}-toggle`;
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', `${id}-list`);
    toggle.innerHTML = `<span class="dropdown__value"></span>${CHEVRON}`;

    const list = document.createElement('ul');
    list.className = 'dropdown__list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    list.hidden = true;

    if (label) {
      label.id = label.id || `${id}-label`;
      label.htmlFor = toggle.id;
      toggle.setAttribute('aria-labelledby', `${label.id} ${toggle.id}`);
      list.setAttribute('aria-labelledby', label.id);
    }

    const options = Array.from(select.options).map((opt, i) => {
      const li = document.createElement('li');
      li.className = 'dropdown__option';
      li.id = `${id}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      list.appendChild(li);
      return li;
    });

    wrap.append(toggle, list);

    let activeIndex = select.selectedIndex;

    function setActive(i) {
      activeIndex = Math.max(0, Math.min(options.length - 1, i));
      options.forEach((li, n) => li.classList.toggle('is-active', n === activeIndex));
      list.setAttribute('aria-activedescendant', options[activeIndex].id);
      options[activeIndex].scrollIntoView?.({ block: 'nearest' });
    }

    function sync() {
      const current = select.selectedIndex < 0 ? 0 : select.selectedIndex;
      toggle.querySelector('.dropdown__value').textContent = select.options[current].textContent;
      options.forEach((li, n) => li.setAttribute('aria-selected', String(n === current)));
    }

    function open() {
      if (openDropdown && openDropdown !== api) openDropdown.close(false);
      openDropdown = api;
      wrap.classList.add('dropdown--open');
      toggle.setAttribute('aria-expanded', 'true');
      list.hidden = false;
      setActive(select.selectedIndex);
      list.focus({ preventScroll: true });
    }

    function close(returnFocus = true) {
      if (list.hidden) return;
      wrap.classList.remove('dropdown--open');
      toggle.setAttribute('aria-expanded', 'false');
      list.hidden = true;
      if (openDropdown === api) openDropdown = null;
      if (returnFocus) toggle.focus({ preventScroll: true });
    }

    function choose(i) {
      const changed = select.selectedIndex !== i;
      select.selectedIndex = i;
      sync();
      close();
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const api = { wrap, close };

    toggle.addEventListener('click', () => (list.hidden ? open() : close()));
    toggle.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        open();
      }
    });

    list.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setActive(activeIndex + 1); break;
        case 'ArrowUp': e.preventDefault(); setActive(activeIndex - 1); break;
        case 'Home': e.preventDefault(); setActive(0); break;
        case 'End': e.preventDefault(); setActive(options.length - 1); break;
        case 'Enter':
        case ' ': e.preventDefault(); choose(activeIndex); break;
        case 'Escape': e.preventDefault(); close(); break;
        case 'Tab': close(false); break;
        default: {
          // Пошук за першою літерою
          if (e.key.length !== 1) return;
          const key = e.key.toLowerCase();
          const n = options.length;
          for (let step = 1; step <= n; step++) {
            const i = (activeIndex + step) % n;
            if (options[i].textContent.trim().toLowerCase().startsWith(key)) { setActive(i); break; }
          }
        }
      }
    });

    list.addEventListener('click', (e) => {
      const li = e.target.closest('.dropdown__option');
      if (li) choose(options.indexOf(li));
    });
    list.addEventListener('mousemove', (e) => {
      const li = e.target.closest('.dropdown__option');
      if (li && options.indexOf(li) !== activeIndex) setActive(options.indexOf(li));
    });

    select.addEventListener('change', sync);
    select._dropdownSync = sync;
    sync();
  }

  function initDropdowns() {
    const selects = $$('select[data-dropdown]');
    if (!selects.length) return;
    selects.forEach(enhanceSelect);

    document.addEventListener('click', (e) => {
      if (openDropdown && !openDropdown.wrap.contains(e.target)) openDropdown.close(false);
    });
    // Після form.reset() оновлюємо підписи
    document.addEventListener('reset', (e) => {
      setTimeout(() => $$('select[data-dropdown]', e.target).forEach(syncDropdown));
    }, true);
  }

  /* ------------------------------------------------------------------------
     Каталог турів: пошук, фільтри, сортування, «Показати більше»
     ------------------------------------------------------------------------ */
  function initTours() {
    const grid = $('#tour-grid');
    const form = $('#tour-filters');
    if (!grid || !form) return;

    const mobileLayout = window.matchMedia('(max-width: 767px)');
    const sortSelect = $('#sort-select');
    const countNode = $('#tours-count');
    const emptyNode = $('#tours-empty');
    const moreBtn = $('#tours-more');
    const resetBtn = $('#tours-reset');
    const fields = {
      country: form.elements.country,
      budget: form.elements.budget,
      duration: form.elements.duration,
    };

    // Збираємо дані з карток один раз
    const tours = $$('.tour-card', grid).map((el, index) => ({
      el,
      index,
      title: el.dataset.title,
      country: el.dataset.country,
      countryName: el.dataset.countryName,
      price: Number(el.dataset.price),
      nights: Number(el.dataset.nights),
      popularity: Number(el.dataset.popularity),
    }));

    let expanded = false;

    const BUDGET = {
      '0-500': (t) => t.price < 500,
      '500-1000': (t) => t.price >= 500 && t.price <= 1000,
      '1000+': (t) => t.price > 1000,
    };

    const DURATION = {
      '3-5': (t) => t.nights >= 3 && t.nights <= 5,
      '7-10': (t) => t.nights >= 7 && t.nights <= 10,
      '14+': (t) => t.nights >= 14,
    };

    const SORTERS = {
      popular: (a, b) => b.popularity - a.popularity,
      'price-asc': (a, b) => a.price - b.price || b.popularity - a.popularity,
      'price-desc': (a, b) => b.price - a.price || b.popularity - a.popularity,
    };

    function getState() {
      return {
        country: fields.country.value,
        budget: fields.budget.value,
        duration: fields.duration.value,
        sort: sortSelect.value,
      };
    }

    function matches(tour, state) {
      if (state.country && tour.country !== state.country) return false;
      if (state.budget && BUDGET[state.budget] && !BUDGET[state.budget](tour)) return false;
      if (state.duration && DURATION[state.duration] && !DURATION[state.duration](tour)) return false;
      return true;
    }

    function syncUrl(state) {
      if (location.protocol === 'file:') return;
      const params = new URLSearchParams();
      Object.entries(state).forEach(([key, value]) => {
        if (value && !(key === 'sort' && value === 'popular')) params.set(key, value);
      });
      const query = params.toString();
      history.replaceState(null, '', query ? `?${query}` : location.pathname);
    }

    function render({ animate = true } = {}) {
      const state = getState();
      const filtered = tours.filter((t) => matches(t, state)).sort(SORTERS[state.sort] || SORTERS.popular);
      const hasFilters = Boolean(state.country || state.budget || state.duration);
      const compactCatalog = mobileLayout.matches && !hasFilters && state.sort === 'popular';
      const visibleLimit = expanded ? filtered.length : compactCatalog ? 5 : 6;

      // На телефоні Будва з'являється після розгортання каталогу.
      if (compactCatalog) {
        const budvaIndex = filtered.findIndex((tour) => tour.title === 'Будва');
        if (budvaIndex !== -1) {
          const [budva] = filtered.splice(budvaIndex, 1);
          filtered.splice(5, 0, budva);
        }
      }
      const filteredSet = new Set(filtered);

      // Порядок у DOM відповідає сортуванню; невідповідні — в кінець і приховані
      filtered.forEach((t) => grid.appendChild(t.el));
      tours.filter((t) => !filteredSet.has(t)).forEach((t) => {
        grid.appendChild(t.el);
        t.el.hidden = true;
      });

      filtered.forEach((t, i) => {
        const show = i < visibleLimit;
        const wasHidden = t.el.hidden;
        t.el.hidden = !show;
        if (show && wasHidden && animate && !prefersReducedMotion) {
          t.el.classList.remove('tour-card--appear');
          void t.el.offsetWidth; // перезапуск анімації
          t.el.classList.add('tour-card--appear');
        }
      });

      const total = filtered.length;
      const shown = Math.min(total, visibleLimit);
      countNode.textContent = total
        ? `Знайдено ${total} ${plural(total, ['тур', 'тури', 'турів'])}` + (shown < total ? ` · показано ${shown}` : '')
        : 'Нічого не знайдено';

      emptyNode.hidden = total > 0;
      grid.hidden = total === 0;
      moreBtn.parentElement.hidden = shown >= total;

      resetBtn.hidden = !hasFilters;

      syncUrl(state);
    }

    function applyFilters() {
      expanded = false;
      render();
    }

    function resetFilters() {
      form.reset();
      sortSelect.value = 'popular';
      Object.values(fields).concat(sortSelect).forEach(syncDropdown);
      applyFilters();
    }

    // Стан з URL (наприклад, tours.html?country=it з головної)
    const params = new URLSearchParams(location.search);
    Object.entries(fields).forEach(([key, field]) => {
      const value = params.get(key);
      if (!value) return;
      if ($$('option', field).some((o) => o.value === value)) field.value = value;
    });
    const sortParam = params.get('sort');
    if (sortParam && SORTERS[sortParam]) sortSelect.value = sortParam;
    Object.values(fields).concat(sortSelect).forEach(syncDropdown);

    // Події
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      applyFilters();
      if (window.innerWidth < 768) {
        $('.tours__toolbar')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    });
    Object.values(fields).forEach((f) => f.addEventListener('change', applyFilters));
    sortSelect.addEventListener('change', () => render({ animate: false }));
    resetBtn.addEventListener('click', resetFilters);
    $$('[data-action="reset-filters"]').forEach((btn) => btn.addEventListener('click', resetFilters));

    moreBtn.addEventListener('click', () => {
      const visibleBefore = new Set($$('.tour-card:not([hidden])', grid));
      expanded = true;
      render();
      $$('.tour-card:not([hidden])', grid)
        .find((card) => !visibleBefore.has(card))?.querySelector('a')?.focus({ preventScroll: true });
    });

    mobileLayout.addEventListener('change', () => render({ animate: false }));
    render({ animate: false });
  }

  /* ------------------------------------------------------------------------
     Про нас: «Дізнатись більше» + анімація цифр
     ------------------------------------------------------------------------ */
  function initAboutMore() {
    const toggle = $('#about-more');
    if (!toggle) return;
    const sync = () => toggle.setAttribute('aria-expanded', String(toggle.checked));
    sync();
    toggle.addEventListener('change', sync);
  }

  function initStats() {
    const values = $$('.stats__value');
    if (!values.length) return;

    const animate = (el) => {
      const match = el.textContent.trim().match(/^(\d+)(.*)$/);
      if (!match) return;
      const target = Number(match[1]);
      const suffix = match[2];
      if (prefersReducedMotion) return;

      const duration = 1400;
      const start = performance.now();
      el.style.minWidth = `${el.offsetWidth}px`;

      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    values.forEach((el) => observer.observe(el));
  }

  /* ------------------------------------------------------------------------
     Запасний варіант для зображень, що не завантажились
     ------------------------------------------------------------------------ */
  function initImageFallback() {
    $$('img').forEach((img) => {
      const fail = () => img.classList.add('img--broken');
      if (img.complete && img.naturalWidth === 0 && img.src) fail();
      img.addEventListener('error', fail, { once: true });
    });
  }

  /* ------------------------------------------------------------------------
     Старт
     ------------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    initMobileNav();
    initContactForm();
    initSubscribe();
    initDropdowns();
    initTours();
    initAboutMore();
    initStats();
    initImageFallback();
  });
})();
