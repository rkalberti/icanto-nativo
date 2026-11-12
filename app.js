const menuButton = document.querySelector(".menu-toggle");
const siteNav = document.querySelector("#siteNav");
const authDialog = document.querySelector("#authDialog");
const authTitle = document.querySelector("#authTitle");
const authMessage = document.querySelector("#authMessage");
const toast = document.querySelector("#toast");
let toastTimer;
let installPrompt;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
}

async function apiRequest(path, method = "GET", body) {
  const options = {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" }
  };
  if (body !== undefined) options.body = JSON.stringify(body);

  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error("Não foi possível conectar à API. Confira se o servidor está rodando em http://localhost:3000.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("A API retornou uma resposta inválida.");
  }

  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error?.message || "Não foi possível concluir a solicitação.");
  }
  return payload;
}

function setAuthenticatedUser(user) {
  document.querySelectorAll("[data-auth-guest]").forEach((element) => {
    element.hidden = Boolean(user);
  });
  document.querySelectorAll("[data-authenticated]").forEach((element) => {
    element.hidden = !user;
  });
  document.querySelectorAll("[data-user-name]").forEach((element) => {
    element.textContent = user?.name || "";
  });
}

async function restoreSession() {
  try {
    const result = await apiRequest("/api/me");
    setAuthenticatedUser(result.user);
  } catch {
    setAuthenticatedUser(null);
  }
}

function closeMenu() {
  siteNav.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Abrir menu");
}

menuButton.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  menuButton.setAttribute("aria-label", expanded ? "Abrir menu" : "Fechar menu");
  siteNav.classList.toggle("is-open", !expanded);
});

siteNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

function setAuthMode(mode) {
  const selected = mode === "signup" ? "signup" : "login";
  authTitle.textContent = selected === "signup" ? "Faça parte da nossa roda." : "Entre na nossa roda.";
  authDialog.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    const active = tab.dataset.authTab === selected;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  authDialog.querySelectorAll("[data-auth-form]").forEach((form) => {
    form.hidden = form.dataset.authForm !== selected;
  });
  authMessage.textContent = selected === "signup"
    ? "Sua senha é armazenada em formato protegido, nunca em texto puro."
    : "Use o e-mail e a senha do seu cadastro.";
}

document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.addEventListener("click", () => {
    setAuthMode(button.dataset.openAuth);
    closeMenu();
    authDialog.showModal();
  });
});

authDialog.querySelectorAll("[data-auth-tab]").forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authTab));
});

authDialog.querySelector(".dialog-close").addEventListener("click", () => authDialog.close());
authDialog.addEventListener("click", (event) => {
  if (event.target === authDialog) authDialog.close();
});

authDialog.querySelectorAll("form[data-auth-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = form.dataset.authForm;
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());
    const endpoint = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
    submitButton.disabled = true;
    submitButton.textContent = mode === "signup" ? "Criando cadastro…" : "Entrando…";
    authMessage.textContent = "Conectando ao servidor…";

    try {
      const result = await apiRequest(endpoint, "POST", body);
      setAuthenticatedUser(result.user);
      form.reset();
      authDialog.close();
      showToast(mode === "signup"
        ? `Cadastro criado. Que bom ter você, ${result.user.name}!`
        : `Você entrou. Bem-vinda(o), ${result.user.name}!`);
    } catch (error) {
      authMessage.textContent = error.message;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = mode === "signup" ? "Criar cadastro" : "Entrar";
    }
  });
});

document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await apiRequest("/api/auth/logout", "POST", {});
      setAuthenticatedUser(null);
      closeMenu();
      showToast("Você saiu da sua conta.");
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-product-notice]").forEach((button) => {
  button.addEventListener("click", () => {
    showToast("Vitrine em preparação. As fotos e informações das camisetas serão adicionadas pelo Instituto.");
  });
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    showToast("O Instituto Canto Nativo já está instalado neste dispositivo.");
    return;
  }
  showToast("Para instalar, abra o menu do navegador e escolha ‘Instalar app’ ou ‘Adicionar à tela inicial’.");
}

document.querySelectorAll(".install-button").forEach((button) => button.addEventListener("click", installApp));

restoreSession();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // A navegação e o conteúdo continuam disponíveis mesmo sem o service worker.
    });
  });
}
