(() => {
  'use strict';

  const STYLE_ID = 'sulandraAnalogClockStyles';
  const TIME_ZONE = 'America/New_York';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .wall-clock-layout{display:flex;align-items:center;justify-content:center;gap:24px;margin-top:6px;min-height:150px}
      .wall-clock-face{width:150px;height:150px;border-radius:50%;position:relative;flex:0 0 150px;background:#f8fafc;border:7px solid #dbe3ef;box-shadow:inset 0 0 0 2px #fff,0 9px 22px rgba(15,23,42,.28);color:#172554}
      .wall-clock-face:before{content:'';position:absolute;inset:8px;border-radius:50%;background:repeating-conic-gradient(from -1deg,#334155 0deg 1.7deg,transparent 1.7deg 30deg);opacity:.7}
      .wall-clock-number{position:absolute;font-size:13px;font-weight:950;line-height:1;transform:translate(-50%,-50%);z-index:2}
      .wall-clock-number.n12{left:50%;top:12%}.wall-clock-number.n3{left:88%;top:50%}.wall-clock-number.n6{left:50%;top:88%}.wall-clock-number.n9{left:12%;top:50%}
      .wall-clock-hand{position:absolute;left:50%;bottom:50%;transform-origin:50% 100%;border-radius:999px;z-index:4;will-change:transform}
      .wall-clock-hour{width:6px;height:38px;margin-left:-3px;background:#172554}
      .wall-clock-minute{width:4px;height:52px;margin-left:-2px;background:#1e3a8a}
      .wall-clock-second{width:2px;height:58px;margin-left:-1px;background:#ef4444;transition:transform .08s linear}
      .wall-clock-second:after{content:'';position:absolute;width:2px;height:16px;left:0;top:54px;background:#ef4444;border-radius:999px}
      .wall-clock-pin{position:absolute;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.35);z-index:5}
      .wall-clock-info{text-align:left;min-width:150px}.wall-clock-date{font-size:13px;font-weight:800;color:var(--cardMeta,#eef2ff);line-height:1.45}.wall-clock-zone{display:inline-flex;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.2);color:var(--cardText,#fff);font-size:10px;font-weight:900;margin-top:10px;border:1px solid rgba(255,255,255,.18)}
      @media(max-width:700px){.wall-clock-layout{gap:14px}.wall-clock-face{width:130px;height:130px;flex-basis:130px}.wall-clock-hour{height:32px}.wall-clock-minute{height:44px}.wall-clock-second{height:50px}.wall-clock-second:after{top:46px}.wall-clock-info{min-width:120px}}
    `;
    document.head.appendChild(style);
  }

  function analogMarkup() {
    return `<div class="wall-clock-layout" data-sulandra-analog-clock="true">
      <div class="wall-clock-face" role="img" aria-label="Live analog wall clock">
        <span class="wall-clock-number n12">12</span><span class="wall-clock-number n3">3</span><span class="wall-clock-number n6">6</span><span class="wall-clock-number n9">9</span>
        <span class="wall-clock-hand wall-clock-hour" data-clock-hour></span>
        <span class="wall-clock-hand wall-clock-minute" data-clock-minute></span>
        <span class="wall-clock-hand wall-clock-second" data-clock-second></span>
        <span class="wall-clock-pin"></span>
      </div>
      <div class="wall-clock-info"><div class="wall-clock-date" data-clock-date></div><span class="wall-clock-zone">America/New_York</span></div>
    </div>`;
  }

  function ensureAnalogClock() {
    const card = document.querySelector('.live-card[data-widget-id="clock"]');
    if (!card) return;
    if (card.querySelector('[data-sulandra-analog-clock="true"]')) return;

    const title = card.querySelector('h3');
    const drag = card.querySelector('.card-drag-handle');
    const hint = card.querySelector('.card-edit-hint');
    [...card.children].forEach((child) => {
      if (child !== title && child !== drag && child !== hint) child.remove();
    });
    if (hint) hint.insertAdjacentHTML('beforebegin', analogMarkup());
    else card.insertAdjacentHTML('beforeend', analogMarkup());
  }

  function getTimeParts(now) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      hour:'numeric', minute:'2-digit', second:'2-digit', hour12:false,
    }).formatToParts(now);
    const number = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { hour:number('hour') % 12, minute:number('minute'), second:number('second') };
  }

  function tick() {
    ensureAnalogClock();
    const face = document.querySelector('[data-sulandra-analog-clock="true"]');
    if (!face) return;
    const now = new Date();
    const {hour, minute, second} = getTimeParts(now);
    const hourHand = face.querySelector('[data-clock-hour]');
    const minuteHand = face.querySelector('[data-clock-minute]');
    const secondHand = face.querySelector('[data-clock-second]');
    if (hourHand) hourHand.style.transform = `rotate(${hour * 30 + minute * .5}deg)`;
    if (minuteHand) minuteHand.style.transform = `rotate(${minute * 6 + second * .1}deg)`;
    if (secondHand) secondHand.style.transform = `rotate(${second * 6}deg)`;
    const date = face.querySelector('[data-clock-date]');
    if (date) date.textContent = new Intl.DateTimeFormat('en-US', {timeZone:TIME_ZONE,weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(now);
  }

  function start() {
    installStyles();
    tick();
    setInterval(tick, 1000);
    setTimeout(tick, 250);
    setTimeout(tick, 900);
    setTimeout(tick, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
