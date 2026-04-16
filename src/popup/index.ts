interface AuthStateResponse {
  status: 'unauthenticated' | 'pending' | 'authenticated' | 'error';
  user: { login: string; avatar_url: string } | null;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_at?: number;
  error?: string;
}

const POLL_INTERVAL_MS = 2000;
let pollHandle: ReturnType<typeof setTimeout> | null = null;

function showState(stateId: string): void {
  for (const el of document.querySelectorAll('.state')) {
    (el as HTMLElement).hidden = el.id !== stateId;
  }
}

function stopPolling(): void {
  if (pollHandle) {
    clearTimeout(pollHandle);
    pollHandle = null;
  }
}

function showError(message: string): void {
  stopPolling();
  const errorMsg = document.getElementById('error-msg')!;
  errorMsg.textContent = message;
  showState('error');
}

function showSignedIn(user: { login: string; avatar_url: string }): void {
  stopPolling();
  const avatar = document.getElementById('user-avatar') as HTMLImageElement;
  const login = document.getElementById('user-login')!;
  avatar.src = user.avatar_url;
  login.textContent = user.login;
  showState('signed-in');
}

function showPending(response: AuthStateResponse): void {
  const codeEl = document.getElementById('device-code')!;
  const linkEl = document.getElementById(
    'verification-link'
  ) as HTMLAnchorElement;

  codeEl.textContent = response.user_code ?? '';
  linkEl.href =
    response.verification_uri_complete ??
    response.verification_uri ??
    '#';
  linkEl.textContent =
    response.verification_uri ?? 'GitHub device verification';

  showState('pending');

  // Poll for state changes while the popup is open
  if (!pollHandle) {
    pollHandle = setTimeout(refresh, POLL_INTERVAL_MS);
  }
}

function render(response: AuthStateResponse): void {
  if (response.status === 'error' || response.error) {
    showError(response.error ?? 'Authentication error');
    return;
  }
  if (response.status === 'authenticated' && response.user) {
    showSignedIn(response.user);
    return;
  }
  if (response.status === 'pending' && response.user_code) {
    showPending(response);
    return;
  }
  stopPolling();
  showState('signed-out');
}

async function refresh(): Promise<void> {
  pollHandle = null;
  const response = (await chrome.runtime.sendMessage({
    type: 'getAuthState',
  })) as AuthStateResponse;
  render(response);
}

document.getElementById('sign-in-btn')!.addEventListener('click', async () => {
  showState('loading');
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'startAuth',
    })) as AuthStateResponse;
    render(response);
  } catch (err) {
    showError((err as Error).message);
  }
});

document
  .getElementById('sign-out-btn')!
  .addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'logout' });
    showState('signed-out');
  });

document
  .getElementById('cancel-auth-btn')!
  .addEventListener('click', async () => {
    stopPolling();
    await chrome.runtime.sendMessage({ type: 'cancelAuth' });
    showState('signed-out');
  });

document.getElementById('retry-btn')!.addEventListener('click', () => {
  void refresh();
});

// Stop polling when the popup closes
window.addEventListener('unload', stopPolling);

void refresh();
