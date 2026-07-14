/* ============================================================
   main.js — SiiNouBeea 全局 JavaScript
   功能：导航栏控制、滚动动画、平滑滚动、页面加载效果
   ============================================================ */

(function () {
  'use strict';

  // ---------- DOM 加载完成后再执行 ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    initNavbar();
    initScrollAnimations();
    initNavbarScrollEffect();
    addPageLoadAnimation();
  }

  // ---------- 导航栏 ----------
  function initNavbar() {
    const toggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (!toggle || !navLinks) return;

    // 切换菜单
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded',
        navLinks.classList.contains('open') ? 'true' : 'false'
      );
    });

    // 点击导航链接后关闭菜单
    navLinks.querySelectorAll('.nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    // 点击页面其他区域关闭菜单
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.navbar')) {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---------- 导航栏滚动阴影 ----------
  function initNavbarScrollEffect() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    var ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(function () {
          navbar.classList.toggle('scrolled', window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    }

    // 初始检查
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- 滚动进入动画 (Intersection Observer) ----------
  function initScrollAnimations() {
    var elements = document.querySelectorAll('.animate-on-scroll, .animate-on-scroll-left, .animate-on-scroll-right, .animate-on-scroll-scale');

    if (elements.length === 0) return;

    // 如果浏览器不支持 IntersectionObserver，直接显示所有元素
    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (el) {
        el.classList.add('visible');
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    elements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // ---------- 页面加载淡入动画 ----------
  function addPageLoadAnimation() {
    document.body.classList.add('page-load-fade');
  }

})();