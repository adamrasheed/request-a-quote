/*
 * Request a Quote — storefront block client (theme app extension).
 *
 * The block renders an empty container; this script decides whether to show
 * the quote button based on the app's config endpoint (served over the app
 * proxy, so the shop param is HMAC-verified). It then opens a small modal form
 * and POSTs the request to the submit endpoint.
 *
 * Every dynamic string lands in the DOM via textContent, never innerHTML, so
 * merchant settings and customer input can't inject markup.
 */
(function () {
  var block = document.querySelector("[data-raq-block]");
  if (!block) return;

  var openBtn = block.querySelector("[data-raq-open]");
  var modal = block.querySelector("[data-raq-modal]");
  var form = block.querySelector("[data-raq-form]");
  var errorEl = block.querySelector("[data-raq-error]");
  var successEl = block.querySelector("[data-raq-success]");
  var requestIdEl = block.querySelector("[data-raq-request-id]");
  var companyField = block.querySelector("[data-raq-company]");
  var phoneField = block.querySelector("[data-raq-phone]");

  var productId = block.getAttribute("data-raq-product");
  var defaultVariantId = block.getAttribute("data-raq-default-variant");

  function currentVariantId() {
    // Prefer whatever the theme's variant picker has selected: a hidden input
    // in the buy form, or the URL ?variant= param. Falls back to the default.
    var urlVariant = new URLSearchParams(window.location.search).get("variant");
    if (urlVariant) return urlVariant;

    var hidden = document.querySelector(
      'form[action*="/cart/add"] input[name="id"]',
    );
    if (hidden && hidden.value) return hidden.value;

    return defaultVariantId;
  }

  function show(el) {
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function setMessage(el, message) {
    if (!el) return;
    el.textContent = message;
  }

  function fetchConfig() {
    var url =
      "/apps/quote-requests/config?product=" + encodeURIComponent(productId);
    return fetch(url, { headers: { accept: "application/json" } }).then(
      function (res) {
        if (!res.ok) throw new Error("config " + res.status);
        return res.json();
      },
    );
  }

  function submitRequest() {
    var data = new FormData(form);
    data.set("variant_id", currentVariantId());
    data.set("client_request_id", (requestIdEl && requestIdEl.value) || "");
    data.set(
      "customer_name",
      form.querySelector('[name="customer_name"]').value,
    );
    data.set(
      "customer_email",
      form.querySelector('[name="customer_email"]').value,
    );
    data.set("quantity", form.querySelector('[name="quantity"]').value);
    data.set(
      "customer_company",
      form.querySelector('[name="customer_company"]').value,
    );
    data.set(
      "customer_phone",
      form.querySelector('[name="customer_phone"]').value,
    );
    data.set("notes", form.querySelector('[name="notes"]').value);

    return fetch("/apps/quote-requests/submit", {
      method: "POST",
      body: data,
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {
            ok: false,
            error: "Something went wrong. Please try again.",
          };
        });
      })
      .then(function (json) {
        if (json && json.ok) {
          show(successEl);
          hide(errorEl);
          setMessage(
            successEl,
            json.message || "Thanks! Your request has been submitted.",
          );
          form.reset();
        } else {
          hide(successEl);
          show(errorEl);
          setMessage(
            errorEl,
            (json && json.error) || "Something went wrong. Please try again.",
          );
        }
      })
      .catch(function () {
        hide(successEl);
        show(errorEl);
        setMessage(errorEl, "Something went wrong. Please try again.");
      });
  }

  function init() {
    if (!openBtn || !modal || !form) return;

    fetchConfig()
      .then(function (config) {
        if (!config || !config.enabled || !config.eligible) return;

        if (config.button_label) openBtn.textContent = config.button_label;
        if (config.form) {
          if (config.form.company_optional) show(companyField);
          if (config.form.customer_phone_optional) show(phoneField);
        }
        if (requestIdEl) {
          try {
            requestIdEl.value = crypto.randomUUID();
          } catch (e) {
            requestIdEl.value =
              String(Date.now()) + "-" + Math.random().toString(36).slice(2);
          }
        }
        show(openBtn);
      })
      .catch(function () {
        // Config unreachable — don't show the button.
      });

    openBtn.addEventListener("click", function () {
      hide(errorEl);
      hide(successEl);
      modal.hidden = false;
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      submitRequest();
    });
  }

  // Delegate close actions (backdrop + cancel buttons) from the modal.
  modal.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-raq-close")) {
      modal.hidden = true;
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) modal.hidden = true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
